#!/usr/bin/env node

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { migrateProject, rewritePaths } = require('../lib/storage-migration');
const path = require('node:path');
const { TextDecoder } = require('node:util');

const {
  MAX_RECORD_BYTES,
  isInside,
  parseFrontmatter,
  parsePlanMetadata,
  parseSpecMetadata,
  parseDesignMetadata,
} = require('../dashboard/records/record-parser.js');
const { assertDesignWrite, readDevelopmentRecord, readDesigns, searchDesigns, supersessionMap } = require('../dashboard/records/development-contracts.js');
const { withFileLock } = require('../lib/file-lock.js');
const { registerProject, rootKey } = require('../dashboard/registry.js');
const { validateDocumentPaths, readDesignDocuments, assertDocumentSetAvailable, recoveryMessage } = require('../lib/design-documents.js');
const { readMarkdownSection } = require('../lib/markdown-section.js');
const roots = require('../lib/document-roots.js');

const PLAN_PATH = /^\.emeth\/plan\/(PLAN-\d{4,})-([^/\\]+)\/PLAN\.md$/;
const SPEC_PATH = /^\.emeth\/specs\/(SPEC-\d{4,})-([^/\\]+)\/SPEC\.md$/;
const DESIGN_PATH = /^\.emeth\/designs\/(DESIGN-\d{4,})(?:-([^/\\]+))?\/DESIGN\.md$/;
const CHANGE_KINDS = new Set(['edit', 'major', 'operational']);
const USAGE = 'Usage: document-writer.js create --project-root DIR --title TITLE --slug SLUG [--supersedes ID]... [--input-format documents]; write --kind design|plan|spec --project-root DIR --relative-path PATH; status --project-root DIR --id DESIGN-ID|SPEC-ID --status STATE; read --project-root DIR --id DESIGN-ID [--document PATH] [--section TITLE]; patch|recover --project-root DIR --id DESIGN-ID; list --project-root DIR; search --project-root DIR [--query TEXT] [--path PATH] [--limit N] [--offset N] [--expected-revision HASH] [--include-source overview|documents]; record --project-root DIR';

class DocumentWriterError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'DocumentWriterError';
    this.code = code;
  }
}

const CONTEXT_USAGE = 'context --project-root DIR --records issues|designs|both [--format json|text|codex-text] [--query TEXT] [--path PATH] [--limit N] [--offset N] [--expected-revision HASH] [--issue-id ID] [--issue-query TEXT] [--issue-offset N] [--code-context N] [--file PATH]...';
const PATCH_SHAPE = 'Patch: {edits:[{old:"unique substring",new:"replacement"}],documents:[{path,edits:[{old,new}]}]}.';

function writerError(code, message, cause) {
  return new DocumentWriterError(code, message, cause);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!['create', 'write', 'status', 'read', 'patch', 'recover', 'list', 'search', 'context', 'record'].includes(command)) {
    throw writerError(
      'invalid-command',
      `${USAGE}; ${CONTEXT_USAGE}`
    );
  }

  const options = command === 'write' ? {} : { command };
  const allowed = new Set(command === 'create' ? ['project_root', 'id', 'title', 'slug', 'kind', 'status', 'supersedes', 'memory', 'language', 'input_format']
    : command === 'read' ? ['project_root', 'id', 'document', 'section']
    : command === 'recover' ? ['project_root', 'id']
    : command === 'list' ? ['project_root']
    : command === 'record' ? ['project_root', 'input', 'data']
    : command === 'context' ? ['project_root', 'records', 'query', 'path', 'limit', 'offset', 'expected_revision', 'issue_query', 'issue_id', 'issue_offset', 'code_context', 'file', 'format']
    : command === 'search' ? ['project_root', 'query', 'path', 'limit', 'offset', 'expected_revision', 'include_source']
    : command === 'patch' ? ['project_root', 'id', 'change_kind', 'memory', 'language']
    : command === 'status'
    ? ['project_root', 'id', 'status', 'memory', 'language']
    : ['kind', 'project_root', 'relative_path', 'change_kind', 'memory', 'language']);
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (!argument.startsWith('--')) {
      throw writerError('invalid-argument', `알 수 없는 인수입니다: ${argument}`);
    }
    const key = argument.slice(2).replace(/-/g, '_');
    if (!allowed.has(key)) {
      throw writerError('invalid-argument', `알 수 없는 옵션입니다: ${argument}`);
    }
    if (Object.hasOwn(options, key) && key !== 'supersedes' && !(command === 'context' && key === 'file')) {
      throw writerError('invalid-argument', `옵션이 중복되었습니다: ${argument}`);
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw writerError('invalid-argument', `${argument} 값이 필요합니다.`);
    }
    // --supersedes repeats once per replaced document.
    if (key === 'supersedes') options.supersedes = [...(options.supersedes || []), value];
    else if (command === 'context' && key === 'file') options.file = [...(options.file || []), value];
    else options[key] = value;
    index += 1;
  }

  if (command === 'status') {
    if (!/^(?:DESIGN|SPEC)-\d{4,}$/.test(options.id || '') || !options.status) {
      throw writerError('invalid-argument', 'Supply --id DESIGN-ID|SPEC-ID and --status STATE');
    }
    options.kind = options.id.startsWith('DESIGN-') ? 'design' : 'spec';
  }
  if (command === 'read' || command === 'patch' || command === 'recover') {
    if (!/^DESIGN-\d{4,}$/.test(options.id || '')) throw writerError('invalid-argument', 'Supply --id DESIGN-ID');
    options.kind = 'design';
  }
  if (['list', 'search', 'context', 'record'].includes(command)) options.kind = 'design';
  if (command === 'create') {
    options.design_kind = options.kind || 'feature';
    options.kind = 'design';
    if (!options.title || !options.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.slug)
        || (options.id !== undefined && !/^DESIGN-\d{4,}$/.test(options.id))) {
      throw writerError('invalid-argument', 'Supply --title and --slug (lowercase words separated by hyphens); optional --id DESIGN-ID');
    }
  }
  if (!new Set(['design', 'plan', 'spec']).has(options.kind)) {
    throw writerError('document-kind-invalid', '--kind는 design, plan 또는 spec이어야 합니다.');
  }
  if (options.memory !== undefined && options.memory !== 'off') throw writerError('invalid-argument', '--memory accepts off only');
  if (options.input_format !== undefined && !['markdown', 'documents'].includes(options.input_format)) {
    throw writerError('invalid-argument', '--input-format accepts markdown or documents');
  }
  if (typeof options.project_root !== 'string' || options.project_root.length === 0) {
    throw writerError('project-root-invalid', '--project-root에는 프로젝트 경로가 필요합니다.');
  }
  if (command === 'write' && (typeof options.relative_path !== 'string' || options.relative_path.length === 0)) {
    throw writerError('document-path-invalid', '--relative-path 값이 필요합니다.');
  }
  if (command === 'record' && options.input !== undefined && options.data !== undefined) throw writerError('invalid-argument', 'Choose --input or --data');
  if (options.change_kind !== undefined && (!CHANGE_KINDS.has(options.change_kind)
      || options.change_kind === 'edit' && options.kind !== 'design')) {
    throw writerError('change-kind-invalid', '--change-kind accepts major or operational; Design also accepts edit (default).');
  }
  if (options.section !== undefined && !options.section.trim()) {
    throw writerError('invalid-argument', '--section에는 절 제목이 필요합니다.');
  }
  return options;
}

function canonicalProjectRoot(projectRoot) {
  const absolute = path.resolve(projectRoot);
  try {
    const resolve = fs.realpathSync.native || fs.realpathSync;
    const canonical = path.normalize(resolve(absolute));
    if (!fs.statSync(canonical).isDirectory()) {
      throw new Error('디렉터리가 아닙니다.');
    }
    migrateProject(canonical);
    return canonical;
  } catch (error) {
    throw writerError('project-root-invalid', `존재하는 프로젝트 디렉터리가 아닙니다: ${absolute}`, error);
  }
}

function decodeContent(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw writerError('document-content-invalid', 'stdin에 UTF-8 Markdown 원문이 필요합니다.');
  }
  if (buffer.length > MAX_RECORD_BYTES) {
    throw writerError('document-too-large', '문서가 2 MiB 한도를 초과합니다.');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (error) {
    throw writerError('document-invalid-utf8', '문서가 올바른 UTF-8이 아닙니다.', error);
  }
}

function resolveTarget(root, kind, relativePath) {
  relativePath = rewritePaths(relativePath);
  if (relativePath.includes('\0') || relativePath.includes('\\')) {
    throw writerError('document-path-invalid', '문서 경로는 프로젝트 상대 POSIX 경로여야 합니다.');
  }
  const match = ({ plan: PLAN_PATH, spec: SPEC_PATH, design: DESIGN_PATH }[kind]).exec(relativePath);
  if (!match || match[2] === '.' || match[2] === '..') {
    throw writerError('document-path-invalid', `${kind} 문서 경로가 올바르지 않습니다: ${relativePath}`);
  }
  const storage = kind === 'design' ? roots.designStorage(root) : { root, configured: false };
  const storageRoot = storage.root;
  const target = kind === 'design' ? roots.designTarget(root, relativePath) : path.join(root, ...relativePath.split('/'));
  if (!isInside(storageRoot, target)) {
    throw writerError('document-path-outside-project', '프로젝트 밖의 문서는 쓸 수 없습니다.');
  }
  return { expectedId: match[1], target, storageRoot, custom: storage.configured };
}

function metadataFor(kind, content, expectedId) {
  let metadata;
  try {
    const frontmatter = parseFrontmatter(content);
    metadata = kind === 'plan'
      ? parsePlanMetadata(frontmatter.metadataText)
      : kind === 'design' ? parseDesignMetadata(frontmatter.metadataText) : parseSpecMetadata(frontmatter.metadataText);
  } catch (error) {
    throw writerError(error.code || 'document-metadata-invalid', error.message, error);
  }
  if (metadata.id !== expectedId) {
    throw writerError('document-id-mismatch', '문서 경로의 ID와 frontmatter ID가 일치하지 않습니다.');
  }
  return metadata;
}

function statPath(filePath) {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function assertSafeExistingPath(root, filePath, expectedType) {
  const stat = statPath(filePath);
  if (!stat) {
    return null;
  }
  if (stat.isSymbolicLink()) {
    throw writerError('document-path-link', '심볼릭 링크 또는 junction 경로에는 쓸 수 없습니다.');
  }
  if ((expectedType === 'directory' && !stat.isDirectory())
      || (expectedType === 'file' && !stat.isFile())) {
    throw writerError('document-path-type-invalid', `문서 ${expectedType} 경로 형식이 올바르지 않습니다.`);
  }
  const resolve = fs.realpathSync.native || fs.realpathSync;
  const canonical = path.normalize(resolve(filePath));
  if (!isInside(root, canonical) || rootKey(canonical) !== rootKey(path.normalize(filePath))) {
    throw writerError('document-path-link', '프로젝트 밖을 가리키는 경로에는 쓸 수 없습니다.');
  }
  return stat;
}

function ensureSafeDirectory(root, directory) {
  const relative = path.relative(root, directory);
  if (!isInside(root, directory) || path.isAbsolute(relative)) {
    throw writerError('document-path-outside-project', '프로젝트 밖의 문서 디렉터리는 만들 수 없습니다.');
  }
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const existing = assertSafeExistingPath(root, current, 'directory');
    if (!existing) {
      try {
        fs.mkdirSync(current);
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
      }
      assertSafeExistingPath(root, current, 'directory');
    }
  }
}

function readExisting(root, filePath) {
  const stat = assertSafeExistingPath(root, filePath, 'file');
  if (!stat) {
    return null;
  }
  if (stat.size > MAX_RECORD_BYTES) {
    throw writerError('document-too-large', '기존 문서가 2 MiB 한도를 초과합니다.');
  }
  try {
    return fs.readFileSync(filePath);
  } catch (error) {
    throw writerError('document-read-failed', `기존 문서를 읽지 못했습니다: ${error.message}`, error);
  }
}

function temporaryPathFor(target) {
  return path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${crypto.randomUUID()}.tmp`
  );
}

function writeTemporary(target, buffer) {
  const temporary = temporaryPathFor(target);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx');
    fs.writeFileSync(descriptor, buffer);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    return temporary;
  } catch (error) {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch { /* preserve original error */ }
    }
    try { fs.unlinkSync(temporary); } catch { /* preserve original error */ }
    throw error;
  }
}

function installNewFiles(root, files) {
  const staged = [];
  try {
    for (const file of files) {
      ensureSafeDirectory(root, path.dirname(file.target));
      staged.push({ temporary: writeTemporary(file.target, file.buffer), target: file.target });
    }
    let index = 0;
    for (; index < staged.length; index += 1) {
      const file = staged[index];
      try {
        fs.linkSync(file.temporary, file.target);
      } catch (error) {
        if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
        break;
      }
      fs.unlinkSync(file.temporary);
    }
    if (index < staged.length) {
      // MXC can reject hardlinks. Keep ordered, atomic, no-replace publication in one helper process.
      const pending = staged.slice(index);
      const single = pending.length === 1;
      const moved = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        single ? '$ErrorActionPreference="Stop"; [IO.File]::Move($env:EMETH_STAGED_FILE,$env:EMETH_TARGET_FILE)'
          : '$ErrorActionPreference="Stop"; $files=[Console]::In.ReadToEnd(); $i=0; '
            + 'try { foreach($line in $files.Split([char]10)) { $paths=$line.Split([char]58); '
            + '$from=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($paths[0])); '
            + '$to=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($paths[1])); '
            + '[IO.File]::Move($from,$to); $i++ } } '
            + 'catch { [Console]::Out.Write($i); [Console]::Error.Write($_.Exception.Message); exit 1 }'], {
        ...(single ? {env:{...process.env,EMETH_STAGED_FILE:pending[0].temporary,EMETH_TARGET_FILE:pending[0].target}}
          : {input:pending.map(file=>[file.temporary,file.target].map(value=>Buffer.from(value,'utf8').toString('base64')).join(':')).join('\n')}),
        encoding: 'utf8', windowsHide: true,
      });
      if (moved.status !== 0) {
        const failed = pending[Number(moved.stdout?.trim()) || 0];
        if (failed && fs.existsSync(failed.target)) {
          throw Object.assign(new Error(`File already exists: ${failed.target}`), { code: 'EEXIST' });
        }
        throw Object.assign(new Error(moved.stderr || moved.error?.message || 'File publication failed'), { code: 'EPERM' });
      }
    }
  } finally {
    for (const file of staged) {
      try { fs.unlinkSync(file.temporary); } catch { /* already linked or moved, or preserve the original error */ }
    }
  }
}

function installFile(root, target, buffer, existing) {
  if (existing === null) return installNewFiles(root, [{ target, buffer }]);
  ensureSafeDirectory(root, path.dirname(target));
  const temporary = writeTemporary(target, buffer);
  try {
    const latest = readExisting(root, target);
    if (!latest || !latest.equals(existing)) {
      throw writerError('document-changed', '문서가 읽은 뒤 변경되어 덮어쓰지 않았습니다.');
    }
    fs.renameSync(temporary, target);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch { /* preserve original error */ }
    throw error;
  }
}

function validateTransition(kind, existingMetadata, nextMetadata, changeKind) {
  if (!existingMetadata) {
    if (changeKind !== undefined) {
      throw writerError('change-kind-invalid', '새 문서에는 --change-kind를 사용하지 않습니다.');
    }
    if (kind !== 'plan' && nextMetadata.revision !== 1) {
      throw writerError('spec-revision-invalid', '새 Spec revision은 1이어야 합니다.');
    }
    return;
  }

  if (existingMetadata.id !== nextMetadata.id || existingMetadata.title !== nextMetadata.title) {
    throw writerError('document-identity-changed', '기존 문서의 ID와 title은 변경할 수 없습니다.');
  }
  if (kind === 'plan') {
    if (changeKind !== undefined) {
      throw writerError('change-kind-invalid', 'Plan에는 --change-kind를 사용하지 않습니다.');
    }
    return;
  }
  if (kind === 'design' && changeKind === undefined) changeKind = 'edit';
  if (!CHANGE_KINDS.has(changeKind) || kind !== 'design' && changeKind === 'edit') {
    throw writerError('change-kind-required', 'Spec 변경에는 --change-kind major 또는 operational이 필요합니다.');
  }
  const expectedRevision = changeKind === 'major'
    ? existingMetadata.revision + 1
    : existingMetadata.revision;
  if (nextMetadata.revision !== expectedRevision) {
    throw writerError(
      'spec-revision-invalid',
      `${changeKind} Spec revision은 ${expectedRevision}이어야 합니다.`
    );
  }
}

function ensureSnapshot(root, target, existing, revision, publications) {
  const relativePath = `${path.relative(root, path.dirname(target)).split(path.sep).join('/')}/revisions/REV-${revision}.md`;
  const snapshot = path.join(root, ...relativePath.split('/'));
  const current = readExisting(root, snapshot);
  if (current) {
    if (!current.equals(existing)) {
      throw writerError('snapshot-conflict', `기존 snapshot 내용이 다릅니다: ${relativePath}`);
    }
    return { status: 'reused', path: relativePath };
  }
  publications.push({ target: snapshot, buffer: existing });
  return { status: 'created', path: relativePath };
}

function registrationResult(projectRoot) {
  try {
    const result = registerProject(projectRoot);
    return {
      status: result.status,
      project: result.project,
      registry_path: result.registryPath,
    };
  } catch (error) {
    return {
      status: 'failed',
      error: {
        code: error.code || 'registration-failed',
        message: error.message,
      },
    };
  }
}

function prepareDetailChanges(root, target, oldMetadata, nextMetadata, changes) {
  const directory = path.dirname(target);
  const prepared = new Map();
  validateDocumentPaths(changes.map(change => change.path));
  for (const change of changes) {
    const file = path.join(directory, ...change.path.split('/'));
    const before = readExisting(root, file);
    if ((before === null) !== (change.expected === null) || before && !before.equals(change.expected)) {
      throw writerError('document-changed', `Detailed document changed: ${change.path}`);
    }
    if (change.content !== null) decodeContent(change.content);
    if ((change.content === null) === (nextMetadata.documents || []).includes(change.path)) {
      throw writerError('document-content-invalid', 'Detailed document changes must match membership');
    }
    prepared.set(change.path, { target: file, before, after: change.content });
  }
  for (const name of new Set([...(oldMetadata?.documents || []), ...(nextMetadata.documents || [])])) {
    const file = path.join(directory, ...name.split('/'));
    const current = readExisting(root, file);
    if ((oldMetadata?.documents || []).includes(name) && !current) {
      throw writerError('contract-unavailable', `Detailed document not found: ${name}`);
    }
    if ((nextMetadata.documents || []).includes(name)) {
      const next = prepared.has(name) ? prepared.get(name).after : current;
      if (!next) throw writerError('contract-unavailable', `Detailed document not found: ${name}`);
      decodeContent(next);
    }
    // Validate existing parents before publishing any file.
    let parent = path.dirname(file);
    while (parent !== root && isInside(root, parent)) {
      assertSafeExistingPath(root, parent, 'directory');
      parent = path.dirname(parent);
    }
  }
  return [...prepared.values()].filter(change => change.before === null || change.after === null || !change.before.equals(change.after));
}

function recoverDocumentSetUnlocked(root, directory) {
  const pending = path.join(directory, '.design-set-pending.json');
  const stat = assertSafeExistingPath(root, pending, 'file');
  if (!stat) return { status: 'no-op' };
  if (stat.size > MAX_RECORD_BYTES * 8) throw writerError('document-too-large', 'Design recovery record is too large');
  let record;
  try { record = JSON.parse(fs.readFileSync(pending, 'utf8')); }
  catch (error) { throw writerError('design-document-set-pending', 'Invalid Design recovery record', error); }
  if (!record || record.schema_version !== 1 || !Array.isArray(record.files) || !record.files.length
      || record.files.some(file => !file || typeof file !== 'object' || Array.isArray(file))
      || record.files.filter(file => file.path === 'DESIGN.md').length !== 1
      || record.files.some(file => typeof file.after !== 'string' && file.after !== null
        || typeof file.before !== 'string' && file.before !== null)) {
    throw writerError('design-document-set-pending', 'Invalid Design recovery record');
  }
  validateDocumentPaths(record.files.filter(file => file.path !== 'DESIGN.md').map(file => file.path));
  const files = record.files.map(file => ({
    target: path.join(directory, ...file.path.split('/')),
    before: file.before === null ? null : Buffer.from(file.before, 'base64'),
    after: file.after === null ? null : Buffer.from(file.after, 'base64'),
  }));
  const same = (left, right) => left === null ? right === null : right !== null && left.equals(right);
  for (const file of files) {
    const current = readExisting(root, file.target);
    if (!same(current, file.before) && !same(current, file.after)) {
      throw writerError('document-changed', 'Recovery would overwrite an independent change; preserve the pending record');
    }
  }
  for (const file of files.reverse()) {
    const current = readExisting(root, file.target);
    if (same(current, file.before)) continue;
    if (file.before === null) fs.unlinkSync(file.target);
    else installFile(root, file.target, file.before, current);
  }
  fs.unlinkSync(pending);
  return { status: 'recovered' };
}

function publishDocumentSet(root, target, source, existing, details) {
  if (!details.length) return installFile(root, target, source, existing);
  const directory = path.dirname(target);
  ensureSafeDirectory(root, directory);
  const changes = [...details, { target, before: existing, after: source }];
  const pending = path.join(directory, '.design-set-pending.json');
  const journal = Buffer.from(JSON.stringify({ schema_version: 1, files: changes.map(file => ({
    path: path.relative(directory, file.target).split(path.sep).join('/'),
    before: file.before === null ? null : file.before.toString('base64'),
    after: file.after === null ? null : file.after.toString('base64'),
  })) }));
  if (journal.length > MAX_RECORD_BYTES * 8) throw writerError('document-too-large', 'Design recovery record is too large');
  installFile(root, pending, journal, null);
  try {
    for (const file of changes) {
      if (file.after === null) {
        const current = readExisting(root, file.target);
        if (!current || !current.equals(file.before)) throw writerError('document-changed', 'Detailed document changed before removal');
        fs.unlinkSync(file.target);
      } else installFile(root, file.target, file.after, file.before);
    }
    fs.unlinkSync(pending);
  } catch (error) {
    try { recoverDocumentSetUnlocked(root, directory); }
    catch (recoveryError) {
      throw writerError('design-document-set-pending', recoveryMessage(target, `Rollback failed: ${recoveryError.message}`), error);
    }
    throw error;
  }
}

function writeDocumentUnlocked(options, sourceBuffer, expectedSource, documentChanges = [], designCatalog) {
  options = { ...options, relative_path: rewritePaths(options.relative_path) };
  const projectRoot = canonicalProjectRoot(options.project_root);
  const content = decodeContent(sourceBuffer);
  const { expectedId, target, storageRoot, custom } = resolveTarget(projectRoot, options.kind, options.relative_path);
  const nextMetadata = metadataFor(options.kind, content, expectedId);
  if (options.kind === 'design') assertDesignWrite(projectRoot, nextMetadata, options.relative_path, designCatalog);
  if (options.kind === 'design') assertDocumentSetAvailable(target);
  const existing = readExisting(storageRoot, target);
  if (expectedSource && (!existing || !existing.equals(expectedSource))) {
    throw writerError('document-changed', '문서가 읽은 뒤 변경되어 덮어쓰지 않았습니다.');
  }

  const existingMetadata = existing
    ? metadataFor(options.kind, decodeContent(existing), expectedId)
    : null;
  const details = options.kind === 'design'
    ? prepareDetailChanges(storageRoot, target, existingMetadata, nextMetadata, documentChanges) : [];

  if (existing && existing.equals(sourceBuffer) && !details.length) {
    return {
      schema_version: 1,
      write: {
        status: 'no-op',
        kind: options.kind,
        id: nextMetadata.id,
        title: nextMetadata.title,
        path: options.relative_path,
        ...(custom ? { absolute_path: target } : {}),
        revision: options.kind !== 'plan' ? nextMetadata.revision : undefined,
        snapshot: null,
      },
      registration: null,
      ...(options.kind === 'design' ? { memory: memoryResult(projectRoot, options) } : {}),
    };
  }

  validateTransition(options.kind, existingMetadata, nextMetadata, options.change_kind);
  if (options.kind === 'design' && existingMetadata) {
    if (existingMetadata.supersedes.some(id => !nextMetadata.supersedes.includes(id))) {
      throw writerError('contract-history-changed', 'Preserve existing supersedes links');
    }
    const oldBody = parseFrontmatter(decodeContent(existing)).body;
    const nextBody = parseFrontmatter(content).body;
    const membershipChanged = JSON.stringify(existingMetadata.documents || []) !== JSON.stringify(nextMetadata.documents || []);
    if (options.change_kind === 'operational' && (oldBody !== nextBody || membershipChanged || details.length)) {
      throw writerError('contract-revision-required', 'Use edit for changes within the current Design revision, or major to start a new revision');
    }
  }

  let snapshot = null;
  const publications = [];
  if (options.kind !== 'plan' && existing && options.change_kind === 'major') {
    const setOverview = path.join(path.dirname(target), 'revisions', `REV-${existingMetadata.revision}`, 'DESIGN.md');
    if (existingMetadata.documents?.length) {
      const saved = readExisting(storageRoot, setOverview);
      if (saved && !saved.equals(existing)) throw writerError('snapshot-conflict', 'Document-set overview snapshot differs');
    }
    for (const name of existingMetadata.documents || []) {
      const file = path.join(path.dirname(target), ...name.split('/'));
      const destination = path.join(path.dirname(target), 'revisions', `REV-${existingMetadata.revision}`, ...name.split('/'));
      const original = readExisting(storageRoot, file);
      const saved = readExisting(storageRoot, destination);
      if (saved && !saved.equals(original)) throw writerError('snapshot-conflict', `Detailed snapshot differs: ${name}`);
    }
    snapshot = ensureSnapshot(storageRoot, target, existing, existingMetadata.revision, publications);
    if (existingMetadata.documents?.length) {
      if (!readExisting(storageRoot, setOverview)) publications.push({ target: setOverview, buffer: existing });
      snapshot = { ...snapshot, path: path.relative(storageRoot, setOverview).split(path.sep).join('/') };
    }
    for (const name of existingMetadata.documents || []) {
      const file = path.join(path.dirname(target), ...name.split('/'));
      const destination = path.join(path.dirname(target), 'revisions', `REV-${existingMetadata.revision}`, ...name.split('/'));
      if (!readExisting(storageRoot, destination)) publications.push({ target: destination, buffer: readExisting(storageRoot, file) });
    }
    if (custom) snapshot = { ...snapshot, absolute_path: path.join(storageRoot, snapshot.path), path: roots.DESIGN_PREFIX + snapshot.path };
  }

  installNewFiles(storageRoot, publications);
  try {
    publishDocumentSet(storageRoot, target, sourceBuffer, existing, details);
  } catch (error) {
    if (error instanceof DocumentWriterError) {
      throw error;
    }
    throw writerError('document-write-failed', `문서를 쓰지 못했습니다: ${error.message}`, error);
  }

  if (designCatalog) {
    const current = designCatalog.find(record => record.id === nextMetadata.id);
    if (current) current.metadata = nextMetadata;
    else designCatalog.push({kind:'design',id:nextMetadata.id,metadata:nextMetadata,relativePath:options.relative_path});
  }

  return {
    schema_version: 1,
    write: {
      status: existing ? 'updated' : 'created',
      kind: options.kind,
      id: nextMetadata.id,
      title: nextMetadata.title,
      path: options.relative_path,
      ...(custom ? { absolute_path: target } : {}),
      revision: options.kind !== 'plan' ? nextMetadata.revision : undefined,
      snapshot,
      ...(options.kind === 'design' ? { documents: nextMetadata.documents || [] } : {}),
    },
    registration: registrationResult(projectRoot),
    ...(options.kind === 'design' ? { memory: memoryResult(projectRoot, options, !existing) } : {}),
  };
}

function memoryResult(projectRoot, options, creating = false) {
  if (options.memory === 'off') return { status: 'disabled' };
  if (!creating) return require('../lib/architecture-memory.js').connectionStatus(projectRoot);
  try { return require('../skills/architecture-memory/scripts/record.js').ensureMemory(projectRoot, { language: options.language }); }
  catch (error) { return { status: 'failed', error: { code: error.code || 'memory-start-failed', message: error.message } }; }
}

function withDocumentLock(options, operation) {
  if (options.kind !== 'design') return operation();
  const root = canonicalProjectRoot(options.project_root);
  const storage = roots.designStorage(root);
  if (storage.configured) roots.prepareRoot(root, storage.directory);
  ensureSafeDirectory(root, path.join(root, '.emeth'));
  const lock = path.join(root, '.emeth', '.design-write.lock');
  assertSafeExistingPath(root, lock);
  return withFileLock(lock, operation, { code: 'document-locked', message: 'Another Design write is active or its lock needs inspection' });
}

function writeDocument(options, sourceBuffer) {
  return withDocumentLock(options, () => writeDocumentUnlocked(options, sourceBuffer));
}

function validDocumentContent(document) {
  return ['body', 'source'].filter(key => Object.hasOwn(document, key)).length === 1
    && (Object.hasOwn(document, 'body') ? typeof document.body === 'string' && !!document.body.trim()
      : typeof document.source === 'string' && path.isAbsolute(document.source));
}

function documentContent(document) {
  if (Object.hasOwn(document, 'body')) return Buffer.from(document.body, 'utf8');
  let buffer;
  try {
    if (fs.statSync(document.source).size > MAX_RECORD_BYTES) {
      throw writerError('document-too-large', '문서가 2 MiB 한도를 초과합니다.');
    }
    buffer = fs.readFileSync(document.source);
  } catch (error) {
    if (error instanceof DocumentWriterError) throw error;
    throw writerError('document-source-read-failed', `문서 원본을 읽지 못했습니다: ${document.source}`, error);
  }
  if (!decodeContent(buffer).trim()) throw writerError('document-content-invalid', '문서 원본에 본문이 필요합니다.');
  return buffer;
}

function createDocument(options, sourceBuffer) {
  let body = decodeContent(sourceBuffer);
  let documents;
  if (options.input_format === 'documents') {
    let input;
    try { input = JSON.parse(body); }
    catch (error) { throw writerError('document-content-invalid', 'Supply JSON with body and documents', error); }
    if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).some(key => !['body', 'documents'].includes(key))
        || typeof input.body !== 'string' || !input.body.trim()
        || !Array.isArray(input.documents)
        || input.documents.some(document => !document || typeof document !== 'object' || Array.isArray(document)
          || Object.keys(document).some(key => !['path', 'body', 'source'].includes(key))
          || !validDocumentContent(document))) {
      throw writerError('document-content-invalid', 'Supply an overview body and detailed entries with path and either body or an absolute source file');
    }
    validateDocumentPaths(input.documents.map(document => document.path));
    body = input.body;
    documents = input.documents.map(document => ({ path: document.path, content: documentContent(document) }));
  }
  return withDocumentLock({ ...options, kind: 'design' }, () => {
    const root = canonicalProjectRoot(options.project_root);
    const { nextDocumentId, DOCUMENT_SKILLS } = require('../lib/document-number.js');
    const id = options.id || nextDocumentId(root, DOCUMENT_SKILLS['/emeth-discipline:development-design']);
    const relativePath = `.emeth/designs/${id}-${options.slug}/DESIGN.md`;
    const { target, storageRoot } = resolveTarget(root, 'design', relativePath);
    if (readExisting(storageRoot, target)) throw writerError('document-exists', 'Design already exists');
    const metadata = {
      schema_version: 2, id, title: options.title, kind: options.design_kind || 'feature',
      status: options.status || 'draft', revision: 1,
      supersedes: options.supersedes || [], superseded_by: null, related_issues: [],
      ...(documents ? { documents: documents.map(document => document.path) } : {}),
    };
    const content = Buffer.from(`---\n${JSON.stringify(metadata, null, 2)}\n---\n\n${body}`, 'utf8');
    return writeDocumentUnlocked({ ...options, kind: 'design', relative_path: relativePath }, content, undefined,
      (documents || []).map(document => ({ path: document.path, expected: null, content: document.content })));
  });
}

function readDesignSource(options) {
  const root = canonicalProjectRoot(options.project_root);
  const record = readDevelopmentRecord(root, options.id);
  const { target, storageRoot } = resolveTarget(root, 'design', record.relativePath);
  assertDocumentSetAvailable(target);
  const source = readExisting(storageRoot, target);
  if (!source) throw writerError('contract-unavailable', 'Document not found');
  const text = decodeContent(source);
  metadataFor('design', text, options.id);
  return { record, source, text };
}

function readDocument(options) {
  const projectRoot = canonicalProjectRoot(options.project_root);
  const { record, text } = readDesignSource(options);
  const documents = readDesignDocuments(projectRoot, record);
  const custom = roots.designStorage(projectRoot).configured;
  if (options.document === undefined && options.section === undefined) {
    return { id: options.id, path: record.relativePath, ...(custom ? { absolute_path: record.source.filePath } : {}), text, documents };
  }
  const name = options.document === undefined ? 'DESIGN.md' : options.document;
  let selected = { path: record.relativePath, text };
  if (name !== 'DESIGN.md') {
    validateDocumentPaths([name]);
    const documentPath = path.posix.join(path.posix.dirname(record.relativePath), name);
    const document = documents.find(document => document.path === documentPath);
    if (!document) throw writerError('contract-unavailable', `등록된 상세 문서가 아닙니다: ${name}`);
    selected = { path: document.path, text: document.body };
  }
  if (options.section !== undefined) {
    selected.text = readMarkdownSection(name === 'DESIGN.md' ? parseFrontmatter(selected.text).body : selected.text, options.section);
  }
  return { id: options.id, ...selected, ...(custom
    ? { absolute_path: path.join(path.dirname(record.source.filePath), name) } : {}) };
}

function withRevision(content, revision) {
  const { metadataText } = parseFrontmatter(content);
  const metadata = JSON.parse(metadataText);
  if (metadata.revision === revision) return content;
  let serialized = metadataText.replace(/("revision"\s*:\s*)\d+/, (_, prefix) => `${prefix}${revision}`);
  if (JSON.parse(serialized).revision !== revision) {
    metadata.revision = revision;
    const newline = content.startsWith('---\r\n') ? '\r\n' : '\n';
    serialized = JSON.stringify(metadata, null, 2).replace(/\n/g, newline);
  }
  const start = /^---\r?\n/.exec(content)[0].length;
  return content.slice(0, start) + serialized + content.slice(start + metadataText.length);
}

function editMetadata(content, edit) {
  const { metadataText } = parseFrontmatter(content);
  const metadata = JSON.parse(metadataText);
  const before = JSON.stringify(metadata);
  edit(metadata);
  if (JSON.stringify(metadata) === before) return content;
  const opening = /^---\r?\n/.exec(content)[0];
  const newline = opening.endsWith('\r\n') ? '\r\n' : '\n';
  return opening + JSON.stringify(metadata, null, 2).replace(/\n/g, newline) + content.slice(opening.length + metadataText.length);
}

function validEdits(edits) {
  return Array.isArray(edits) && edits.every(edit => edit && typeof edit === 'object' && !Array.isArray(edit)
    && Object.keys(edit).every(key => ['old', 'new'].includes(key))
    && typeof edit.old === 'string' && edit.old.length && typeof edit.new === 'string');
}

function applyTextEdits(text, edits) {
  for (const edit of edits) {
    const start = text.indexOf(edit.old);
    if (start < 0 || text.indexOf(edit.old, start + 1) !== -1) {
      throw writerError('document-patch-match', 'Each old string must match exactly once; include enough context');
    }
    text = text.slice(0, start) + edit.new + text.slice(start + edit.old.length);
    if (Buffer.byteLength(text, 'utf8') > MAX_RECORD_BYTES) throw writerError('document-too-large', 'Patched document exceeds 2 MiB');
  }
  return text;
}

function validatePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)
      || Object.keys(patch).some(key => !['edits', 'documents'].includes(key))
      || !validEdits(patch.edits === undefined ? [] : patch.edits)
      || !Array.isArray(patch.documents === undefined ? [] : patch.documents)
      || !(patch.edits?.length || patch.documents?.length)
      || (patch.documents || []).some(document => !document || typeof document !== 'object' || Array.isArray(document)
        || Object.keys(document).some(key => !['path', 'edits', 'body', 'source', 'remove'].includes(key))
        || ['edits', 'body', 'source', 'remove'].filter(key => Object.hasOwn(document, key)).length !== 1
        || Object.hasOwn(document, 'edits') && (!validEdits(document.edits) || !document.edits.length)
        || (Object.hasOwn(document, 'body') || Object.hasOwn(document, 'source')) && !validDocumentContent(document)
        || Object.hasOwn(document, 'remove') && document.remove !== true)) {
    throw writerError('document-patch-invalid', 'Supply nonempty edits containing old/new strings');
  }
  return patch;
}

function patchDocument(options, buffer) {
  let patch;
  try { patch = JSON.parse(decodeContent(buffer)); }
  catch (error) {
    if (error instanceof DocumentWriterError) throw error;
    throw writerError('document-patch-invalid', 'Supply UTF-8 JSON with edits');
  }
  validatePatch(patch);
  return withDocumentLock(options, () => patchDocumentUnlocked(options, patch));
}

function patchDocumentUnlocked(options, patch, designCatalog) {
  const { record, source, text } = readDesignSource(options);
  const root = canonicalProjectRoot(options.project_root);
  validateDocumentPaths((patch.documents || []).map(document => document.path));
  let membership = [...(record.metadata.documents || [])];
  const changes = (patch.documents || []).map(document => {
    const target = path.join(path.dirname(record.source.filePath), ...document.path.split('/'));
    const before = readExisting(record.source.root || root, target);
    let content = null;
    if (Object.hasOwn(document, 'body') || Object.hasOwn(document, 'source')) {
      const adoptsInPlace = before && typeof document.source === 'string'
        && rootKey(path.resolve(document.source)) === rootKey(target);
      if (membership.includes(document.path) || before && !adoptsInPlace) throw writerError('document-exists', 'Use edits for a registered detailed document; register an existing unregistered artifact with source pointing to that file');
      content = documentContent(document);
      if (before && !before.equals(content)) throw writerError('document-changed', `Detailed document changed: ${document.path}`);
      membership.push(document.path);
    } else {
      if (!before || !membership.includes(document.path)) throw writerError('contract-unavailable', `Detailed document not found: ${document.path}`);
      if (document.remove) membership = membership.filter(name => name !== document.path);
      else {
        const bom = before.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? before.subarray(0, 3) : Buffer.alloc(0);
        content = Buffer.concat([bom, Buffer.from(applyTextEdits(decodeContent(before), document.edits), 'utf8')]);
      }
    }
    return { path: document.path, expected: before, content };
  });
  let updated = editMetadata(applyTextEdits(text, patch.edits || []), metadata => {
    if (JSON.stringify(metadata.documents || []) !== JSON.stringify(membership)) metadata.documents = membership;
    if (options.related_issue && !(metadata.related_issues || []).includes(options.related_issue)) {
      metadata.related_issues = [...(metadata.related_issues || []), options.related_issue];
    }
  });
  const revision = metadataFor('design', text, options.id).revision;
  updated = withRevision(updated, revision);
  const detailsChanged = changes.some(change => change.expected === null || change.content === null || !change.expected.equals(change.content));
  if ((updated !== text || detailsChanged) && options.change_kind === 'major') updated = withRevision(updated, revision + 1);
  const bom = source.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? source.subarray(0, 3) : Buffer.alloc(0);
  const next = Buffer.concat([bom, Buffer.from(updated, 'utf8')]);
  return writeDocumentUnlocked({ ...options, relative_path: record.relativePath }, next, source, changes, designCatalog);
}

function codexInlineExample(root, create = false, codeWork = false) {
  const {commandQuoter,displayPath}=require('../lib/host'),quote=commandQuoter();
  const windows=process.platform==='win32';
  const invoke=(file,args,data)=>{
    const command=(windows?'& ':'')+[process.execPath,file,...args].map(value=>quote(displayPath(value))).join(' ')+" '";
    return `await tools.exec_command({cmd:${JSON.stringify(command)}+${data}+${JSON.stringify("'"+(windows?'; exit $LASTEXITCODE':''))},workdir:${JSON.stringify(displayPath(root))},shell:${JSON.stringify(windows?'powershell.exe':'/bin/sh')},login:false})`;
  };
  const recordArgs=['record','--project-root','.','--data'];
  const body=create
    ? 'const encode=value=>encodeURIComponent(JSON.stringify(value)).replaceAll("\'","%27");\n'
      + `const registration=${invoke(path.resolve(__dirname,'../skills/issue-ledger/scripts/issue-ledger.js'),['create','--input-format','brief','--output-format','json','--if-empty','--data'],'encode(brief)')};\n`
      + 'if(registration.exit_code!==0){text(registration);exit();}\nconst created=JSON.parse(registration.output);\n'
      + 'text(await tools.apply_patch(preparedPatch));\n'
      + 'const packet={designs,issue:{id:created.id,outcome},verification:verificationFor(created)};\n'
      + `text(${invoke(__filename,recordArgs,'encode(packet)')});\n`
    : (codeWork ? 'if(preparedPatch)text(await tools.apply_patch(preparedPatch));\n' : '')
      + 'const data=encodeURIComponent(JSON.stringify(packet)).replaceAll("\'","%27");\n'
      + `text(${invoke(__filename,recordArgs,'data')});\n`;
  return (create
    ? 'For a required new Issue and prepared code work, choose brief, preparedPatch, designs and outcome. verificationFor(created) returns the check array using selected generated criterion IDs. Execute this complete batch:\n'
    : codeWork
      ? 'For prepared source edits and exit-code checks, choose packet and preparedPatch (null for verification without edits). Execute this complete batch:\n'
      : 'Codex functions.exec after edits; packet is the JSON object above:\n')
    + '```javascript\n' + body + '```\n'
    + 'Beyond shell argument limits, write the packet as UTF-8 and use --input FILE.\n';
}

function recordHelp(scope = 'both', caller = 'cli', root, create = false, codeWork = false) {
  return 'Usage: document-writer.js record --project-root DIR [--input FILE|- | --data URI_ENCODED_JSON]\n'
    + (scope === 'issues'
      ? 'Issue-only JSON file or stdin (default); replace bracketed values with the selected Issue and verification:\n'
        + '```json\n{"designs":[],"issue":{"id":"<Issue ID>","outcome":{"current_summary":"<current conclusion>","status":"doing","next_action":"<remaining action>"}},"verification":[{"command":["<executable>","<argument>"],"targets":["<criterion ID>"],"observation":"<checked behavior and verification limits>"}]}\n```\n'
      : 'JSON file or stdin (default): {designs:[{id,change_kind?,patch}],issue:{id,outcome},verification?:[{command:[executable,...args],targets,observation,kind?}]}.\n')
    + 'outcome: {current_summary,status?:"open|doing|resolved",next_action?,evidence?:[{kind,location,observation,targets:["P/C/D ID"]}],work?:[{kind:"design|plan|spec",id,location}]}. IDs and timestamps are generated.\n'
    + 'record executes verification commands before any record writes and creates their linked evidence; outcome.evidence is for separate observations.\n'
    + (scope === 'issues' ? 'For valid prior checks, omit verification and attach outcome.evidence.\n' : PATCH_SHAPE + '\n')
    + 'Verification: executable argv in project cwd, without an implicit shell. Script entrypoints, including Windows batch files, need an explicit interpreter. Timeout 60s each; exit 0 adds declared scope/target evidence. All checks must pass before record saves.\n'
    + (scope === 'issues' ? 'Validates and saves the Issue.\n' : 'Saves Designs/backlinks in order, then links canonical paths and validates/saves the Issue.\n')
    + 'Returns saved paths/revisions and validated Issue state. Failure reports completed Design saves and pending Issue state.\n'
    + (caller === 'codex-text' ? codexInlineExample(root,create,codeWork) : '');
}

function contractText(file) {
  const { displayPath } = require('../lib/host');
  return fs.readFileSync(file, 'utf8').replaceAll('<plugin-root>', displayPath(path.resolve(__dirname, '..')))
    .replace(/\]\(([^)]+)\)/g, (_, target) => `](${displayPath(path.resolve(path.dirname(file), target))})`);
}

function workContext(options) {
  const selected = options.records;
  if (!['issues', 'designs', 'both'].includes(selected)) throw writerError('invalid-argument', 'Supply --records issues|designs|both for the authorized record scope');
  if (options.format !== undefined && !['json', 'text', 'codex-text'].includes(options.format)) throw writerError('invalid-argument', '--format accepts json, text or codex-text');
  const integer = (value, fallback, minimum, maximum, label) => {
    if (value === undefined) return fallback;
    if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum || Number(value) > maximum) {
      throw writerError('invalid-argument', `${label} must be an integer from ${minimum} to ${maximum}`);
    }
    return Number(value);
  };
  const limit = integer(options.limit, 10, 1, 100, '--limit');
  const issueOffset = integer(options.issue_offset, 0, 0, Number.MAX_SAFE_INTEGER, '--issue-offset');
  const codeLines = options.code_context === undefined ? 0 : integer(options.code_context, 0, 1, 40, '--code-context');
  if (codeLines && !options.query?.trim() && selected !== 'issues') throw writerError('invalid-argument', '--code-context requires a nonempty query outside Issue-only scope');
  const root = canonicalProjectRoot(options.project_root);
  const result = { complete: true };
  const contextFiles = [...(options.file || [])];
  const matchedCodeFiles = new Set();
  let emptyIssueStore = false;
  if (selected !== 'designs') {
    const issueRoot = path.join(root, '.emeth', 'issues');
    const { issues, errors } = fs.existsSync(issueRoot)
      ? require('../skills/issue-ledger/scripts/issue-ledger.js').readAllIssues(issueRoot) : { issues: [], errors: [] };
    emptyIssueStore = issues.length === 0 && errors.length === 0;
    const query = options.issue_query?.toLowerCase();
    const visible = issues.filter(issue => (!options.issue_id || issue.id === options.issue_id)
      && (!query || issue.searchText.includes(query))).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    const model = require('../skills/issue-ledger/lib/issue-model.js');
    result.issues = { items: visible.slice(issueOffset, issueOffset + limit).map(issue => model.buildBrief(issue)),
      total: visible.length, offset: issueOffset, limit, has_more: issueOffset + limit < visible.length,
      complete: errors.length === 0, ...(errors.length ? { diagnostics: errors } : {}) };
    if (errors.length) result.complete = false;
    if (!visible.length || visible.some(issue => ['resolved', 'cancelled', 'superseded'].includes(issue.status))) {
      result.selection_help = contractText(path.resolve(__dirname, '../skills/rules/references/work-records-create.md'));
    }
  }
  if (selected !== 'issues') {
    const found = searchDesigns(root, { ...options, limit, include_source: 'documents' });
    result.designs = { ...found, matches: found.matches.map(match => {
      const { source, hits, hits_truncated, ...metadata } = match;
      const parsed = parseFrontmatter(source.text);
      const designMetadata = parseDesignMetadata(parsed.metadataText);
      return { ...metadata, kind: designMetadata.kind, supersedes: designMetadata.supersedes,
        sources: [{ document: 'DESIGN.md', text: parsed.body },
          ...(source.documents || []).map(document => ({
            document: path.posix.relative(path.posix.dirname(match.path), document.path), text: document.body,
          }))] };
    }) };
    if (!found.complete) result.complete = false;
  }
  if (codeLines) {
    try {
      const directory = roots.designStorage(root).directory;
      if (roots.inside(directory, root)) throw writerError('code-context-record-root', 'Configured Design storage covers the code project; use known code paths separately');
      const globs = ['!.emeth/**', '!.proofline/**', '!node_modules/**'];
      if (roots.inside(root, directory)) {
        const relative = path.relative(root, directory).split(path.sep).join('/').replace(/[?*\[\]{}\\]/g, '\\$&');
        globs.push(`!${relative}/**`);
      }
      const filters = globs.flatMap(glob => ['--glob', glob]);
      let text = '';
      if (options.query?.trim()) {
        const args = ['--no-heading', '--line-number', '--fixed-strings', '--context', String(codeLines), ...filters];
        for (const term of new Set(options.query.trim().split(/\s+/))) args.push(`--regexp=${term}`);
        args.push('.');
        const code = spawnSync('rg', args, { cwd: root, encoding: 'utf8', windowsHide: true,
          shell: false, timeout: 10000, maxBuffer: MAX_RECORD_BYTES });
        if (code.error || ![0, 1].includes(code.status)) throw writerError('code-context-unavailable', code.error?.message || code.stderr || 'Code search unavailable');
        text = code.stdout || '';
      }
      result.code = { available: true, context_lines: codeLines, text: text.slice(0, 12000), truncated: text.length > 12000 };
      const inventory = spawnSync('rg', ['--files', '--hidden', '--glob', '!.git/**', ...filters, '.'],
        { cwd: root, encoding: 'utf8', windowsHide: true, shell: false, timeout: 10000, maxBuffer: MAX_RECORD_BYTES });
      if (!inventory.error && [0, 1].includes(inventory.status)) {
        const files = (inventory.stdout || '').split(/\r?\n/).filter(Boolean).map(file => file.replaceAll('\\', '/').replace(/^\.\//, ''));
        const listing = files.join('\n');
        result.code.files = { text: listing.slice(0, 4000), truncated: listing.length > 4000 };
        const manifests = files.filter(file => /^(?:AGENTS\.md|package\.json|pyproject\.toml|Cargo\.toml|go\.mod|pom\.xml|build\.gradle(?:\.kts)?|CMakeLists\.txt|Makefile|justfile|[^/]+\.(?:slnx?|csproj|fsproj))$/.test(file));
        contextFiles.push(...manifests.slice(0, 8));
        result.code.configs_truncated = manifests.length > 8;
        const inventoryPaths=new Set(files);
        const matched=[...new Set([...text.matchAll(/^(.+?):[0-9]+:/gm)].map(match=>match[1].replaceAll('\\','/').replace(/^\.\//,'')))];
        for(const file of matched.filter(file=>inventoryPaths.has(file)).slice(0,8)){
          if(!contextFiles.includes(file)){matchedCodeFiles.add(file);contextFiles.push(file);}
        }
      } else result.code.files = { unavailable: inventory.error?.message || inventory.stderr || 'Project inventory unavailable' };
      const pathspecs=['.',':(exclude,literal).emeth',':(exclude,literal).proofline'];
      if(roots.inside(root,directory))pathspecs.push(':(exclude,literal)'+path.relative(root,directory).split(path.sep).join('/'));
      const status=spawnSync('git',['status','--short','--untracked-files=all','--',...pathspecs],{
        cwd:root,encoding:'utf8',windowsHide:true,shell:false,timeout:10000,maxBuffer:MAX_RECORD_BYTES});
      result.worktree_status=!status.error&&status.status===0
        ? {available:true,text:status.stdout.slice(0,4000),truncated:status.stdout.length>4000}
        : {available:false,reason:status.error?.message||status.stderr||'Git status unavailable'};
      result.ancestor_instructions = [];
      let budget = 6000;
      for (let directory = path.dirname(root);; directory = path.dirname(directory)) {
        const file = path.join(directory, 'AGENTS.md');
        try {
          if (fs.existsSync(file)) {
            const stat = fs.statSync(file);
            if (!stat.isFile() || stat.size > MAX_RECORD_BYTES) throw Error('Instruction file is not a bounded regular file');
            const source = decodeContent(fs.readFileSync(file));
            const excerpt = source.slice(0, budget);
            result.ancestor_instructions.unshift({path:require('../lib/host').displayPath(file),text:excerpt,truncated:source.length > budget});
            budget -= excerpt.length;
          }
        } catch (error) { result.ancestor_instructions.unshift({path:file,unavailable:error.message}); }
        if (path.dirname(directory) === directory) break;
      }
    } catch (error) {
      result.code = { available: false, reason: error.message };
    }
  }
  if (contextFiles.length) {
    let configBudget = 6000;
    result.files = [...new Set(contextFiles)].map(file => {
      try {
        const target = fs.realpathSync(path.resolve(root, file));
        const relative = path.relative(root, target).split(path.sep).join('/');
        const compared = process.platform === 'win32' ? relative.toLowerCase() : relative;
        if (!roots.inside(root, target) || /^(?:\.emeth|\.proofline)(?:\/|$)/.test(compared)
            || roots.inside(roots.designStorage(root).directory, target)) {
          throw writerError('context-file-scope', 'Use the selected record scope for records; file inputs are project source/configuration files');
        }
        const stat = fs.statSync(target);
        if (!stat.isFile() || stat.size > MAX_RECORD_BYTES) throw writerError('context-file-size', 'Requested source is not a bounded regular file');
        const explicit = options.file?.includes(file);
        if (!explicit && matchedCodeFiles.has(file) && stat.size > configBudget) {
          return {path:relative,unavailable:'Matched source exceeds the remaining context budget; use focused source reads'};
        }
        const text = decodeContent(fs.readFileSync(target));
        const limit = explicit ? 12000 : configBudget;
        const excerpt = text.slice(0, limit);
        if (!explicit) configBudget -= excerpt.length;
        return { path: relative, text: excerpt, truncated: text.length > limit };
      } catch (error) { return { path: file, unavailable: error.message }; }
    });
  }
  const contract = path.resolve(__dirname, '../skills/rules/references/work-records-save.md');
  result.contract_path = contract;
  const source = contractText(contract);
  result.scope = selected;
  result.contract = ['Save', ...(selected !== 'designs' ? ['Issues'] : []), ...(selected !== 'issues' ? ['Designs'] : []), ...(selected === 'designs' ? ['Design-only'] : []),
    ...(selected !== 'designs' ? [options.format === 'codex-text' ? 'Codex' : 'CLI'] : [])]
    .map(section => readMarkdownSection(source, section)).join('\n');
  if (selected !== 'designs') result.record_help = recordHelp(selected, options.format, root, selected==='both'&&!!codeLines&&emptyIssueStore,!!codeLines);
  if (selected === 'designs') result.patch_help = PATCH_SHAPE;
  return result;
}

function contextText(result) {
  const output=[`Context status: ${JSON.stringify({complete:result.complete,scope:result.scope})}`];
  if(result.record_help)output.push('## Record API',result.record_help);
  if(result.patch_help)output.push('## Patch API',result.patch_help);
  output.push('## Ordinary update contract',result.contract);
  if(result.selection_help)output.push('## Issue selection API',result.selection_help);
  if(result.issues){const {items,...metadata}=result.issues;output.push('## Issues',JSON.stringify(metadata),...items);}
  if(result.designs){
    const {matches,...metadata}=result.designs;output.push('## Designs',JSON.stringify(metadata));
    for(const match of matches){const {sources,...fields}=match;output.push(JSON.stringify(fields));
      for(const source of sources)output.push(`### ${match.id}/${source.document}`,source.text);
    }
  }
  if(result.code){const {text,files,...metadata}=result.code;
    const matches=[...new Set([...((text||'').matchAll(/^(.+?):[0-9]+:/gm))].map(match=>match[1].replaceAll('\\','/').replace(/^\.\//,'')))];
    const fullFiles=matches.length&&!metadata.truncated&&matches.every(file=>result.files?.some(source=>source.path===file&&source.text!==undefined&&!source.truncated));
    output.push('## Code excerpts',JSON.stringify({...metadata,...(fullFiles?{supplied_as_full_files:true}:{})}));if(text&&!fullFiles)output.push(text);
    if(files){const {text:listing,...state}=files;output.push('## Project inventory',JSON.stringify(state));if(listing)output.push(listing);}}
  if(result.files)for(const file of result.files){const {text,...metadata}=file;output.push('## Project file',JSON.stringify(metadata));if(text!==undefined)output.push(text);}
  if(result.worktree_status){const {text,...metadata}=result.worktree_status;output.push('## Git source status (record stores excluded)',JSON.stringify(metadata));if(text!==undefined)output.push(text||'(clean)');}
  if(result.ancestor_instructions)for(const file of result.ancestor_instructions){const {text,...metadata}=file;output.push('## Ancestor AGENTS.md',JSON.stringify(metadata));if(text!==undefined)output.push(text);}
  return output.join('\n\n')+'\n';
}

function recordWork(options, buffer) {
  let input;
  try { input = JSON.parse(decodeContent(buffer)); }
  catch (error) { throw writerError('record-input-invalid', 'Supply UTF-8 JSON with designs and issue', error); }
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
  if (!keys(input, ['designs', 'issue', 'verification']) || !Array.isArray(input.designs)
      || !keys(input.issue, ['id', 'outcome']) || !/^PL-\d{4,}$/.test(input.issue.id || '')
      || !object(input.issue.outcome)
      || (Object.hasOwn(input.issue.outcome, 'work') && !Array.isArray(input.issue.outcome.work))
      || (Object.hasOwn(input.issue.outcome, 'evidence') && !Array.isArray(input.issue.outcome.evidence))
      || (input.verification !== undefined && (!Array.isArray(input.verification) || !input.verification.length
        || input.verification.some(check => !keys(check, ['command', 'targets', 'observation', 'kind'])
          || !Array.isArray(check.command) || !check.command.length || check.command.some(arg => typeof arg !== 'string') || !check.command[0].trim()
          || !Array.isArray(check.targets) || !check.targets.length || check.targets.some(id => typeof id !== 'string' || !id.trim())
          || typeof check.observation !== 'string' || !check.observation.trim()
          || check.kind !== undefined && (typeof check.kind !== 'string' || !check.kind.trim()))))
      || input.designs.some(design => !keys(design, ['id', 'change_kind', 'patch'])
        || !/^DESIGN-\d{4,}$/.test(design.id || '') || !object(design.patch)
        || design.change_kind !== undefined && !CHANGE_KINDS.has(design.change_kind))
      || new Set(input.designs.map(design => design.id)).size !== input.designs.length) {
    throw writerError('record-input-invalid', 'Supply unique designs [{id,change_kind?,patch}] and issue {id,outcome}');
  }
  const progress = { designs: [], issue: { id: input.issue.id, status: 'not-written' } };
  try {
    const verifiedEvidence = [];
    if (input.verification) {
      progress.verification = [];
      for (const check of input.verification) {
        const checked = spawnSync(check.command[0], check.command.slice(1), {
          cwd: canonicalProjectRoot(options.project_root), encoding: 'utf8', windowsHide: true,
          shell: false, timeout: 60000, maxBuffer: MAX_RECORD_BYTES,
        });
        const stdout = checked.stdout || '', stderr = checked.stderr || '';
        progress.verification.push({ command: check.command, exit_code: checked.status,
          stdout: stdout.slice(-4000), stderr: stderr.slice(-4000),
          ...(stdout.length > 4000 || stderr.length > 4000 ? { output_truncated: true } : {}),
          ...(checked.error ? { error: checked.error.message } : {}) });
        if (checked.error || checked.status !== 0) throw writerError('record-verification-failed', 'Verification did not exit successfully; no record writes were started');
        verifiedEvidence.push({ kind: check.kind || 'test', location: JSON.stringify(check.command),
          observation: `${check.observation}\nCommand exit code: 0.`, targets: check.targets });
      }
    }
    if (input.designs.length) withDocumentLock({ ...options, kind:'design' }, () => {
      // This catalog is valid only while the existing project write lock is held.
      const catalog = readDesigns(canonicalProjectRoot(options.project_root));
      for (const design of input.designs) {
        progress.designs.push(formatSuccess(patchDocumentUnlocked({ ...options, command: 'patch', kind:'design', id: design.id,
          change_kind: design.change_kind || 'edit', related_issue: input.issue.id }, validatePatch(design.patch), catalog)));
      }
    });
    const outcome = { ...input.issue.outcome,
      ...(verifiedEvidence.length ? { evidence: [...(input.issue.outcome.evidence || []), ...verifiedEvidence] } : {}),
      work: [...(input.issue.outcome.work || []),
      ...progress.designs.map(result => ({ kind: 'design', id: result.write.id, location: result.write.path }))] };
    const child = spawnSync(process.execPath, [path.resolve(__dirname, '../skills/issue-ledger/scripts/issue-ledger.js'),
      'update', input.issue.id, '--project-root', path.resolve(options.project_root), '--input-format', 'brief', '--output-format', 'json', '--operation', '-'],
    { cwd: options.project_root, input: JSON.stringify(outcome), encoding: 'utf8', windowsHide: true, maxBuffer: MAX_RECORD_BYTES });
    if (child.status !== 0) throw writerError('record-issue-update-failed', child.stderr?.trim() || child.error?.message || 'Issue update failed');
    progress.issue = { id: input.issue.id, status: 'updated', ...JSON.parse(child.stdout) };
    return { schema_version: 1, ...progress };
  } catch (error) {
    error.records = progress;
    throw error;
  }
}

function recordInput(options, sourceBuffer) {
  if (sourceBuffer !== undefined) return sourceBuffer;
  if (options.data !== undefined) {
    try { return Buffer.from(decodeURIComponent(options.data),'utf8'); }
    catch (error) { throw writerError('record-input-invalid','--data requires URI-encoded JSON',error); }
  }
  return fs.readFileSync(options.input && options.input !== '-' ? options.input : 0);
}

function recoverDocumentSet(options) {
  return withDocumentLock(options, () => {
    const root = canonicalProjectRoot(options.project_root);
    const storage = roots.designStorage(root);
    const parent = storage.directory;
    const matches = fs.existsSync(parent) ? fs.readdirSync(parent, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && (entry.name === options.id || entry.name.startsWith(`${options.id}-`))) : [];
    if (matches.length !== 1) throw writerError('contract-unavailable', 'Supply an unambiguous Design ID for recovery');
    const directory = path.join(parent, matches[0].name);
    assertSafeExistingPath(storage.root, directory, 'directory');
    return { id: options.id, ...recoverDocumentSetUnlocked(storage.root, directory) };
  });
}

function listDesigns(options) {
  const root = canonicalProjectRoot(options.project_root);
  const storage = roots.designStorage(root);
  const records = [];
  const designs = readDesigns(root, { includeErrors: true }).sort((left, right) => left.id.localeCompare(right.id, 'en')).map(record => {
    if (record.error) return record;
    records.push(record);
    return { id: record.id, title: record.title, kind: record.metadata.kind, status: record.status, revision: record.revision,
      path: record.relativePath, ...(storage.configured ? { absolute_path: record.source.filePath } : {}),
      supersedes: record.metadata.supersedes, superseded_by: record.metadata.superseded_by };
  });
  // Replacement is declared by the successor; derive it for each replaced Design.
  let next = new Map();
  const diagnostics = [];
  try { next = supersessionMap(records); }
  catch (error) { diagnostics.push({ code: error.code, message: error.message }); }
  for (const design of designs) if (next.has(design.id)) design.superseded_by = next.get(design.id);
  return { designs, ...(diagnostics.length ? { diagnostics } : {}) };
}

function updateDocumentStatus(options) {
  if (!/^(?:DESIGN|SPEC)-\d{4,}$/.test(options.id || '') || typeof options.status !== 'string' || !options.status) {
    throw writerError('invalid-argument', 'Supply a Design or legacy Spec ID and status');
  }
  const kind = options.id.startsWith('DESIGN-') ? 'design' : 'spec';
  return withDocumentLock({ ...options, kind }, () => {
    const root = canonicalProjectRoot(options.project_root);
    const record = readDevelopmentRecord(root, options.id);
    const { target, storageRoot } = resolveTarget(root, kind, record.relativePath);
    const existing = readExisting(storageRoot, target);
    if (!existing) throw writerError('contract-unavailable', 'Document not found');
    const content = decodeContent(existing);
    const current = metadataFor(kind, content, options.id);
    let source = existing;
    if (current.status !== options.status) {
      const updated = editMetadata(content, metadata => { metadata.status = options.status; });
      const bom = existing.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? existing.subarray(0, 3) : Buffer.alloc(0);
      source = Buffer.concat([bom, Buffer.from(updated, 'utf8')]);
    }
    const result = writeDocumentUnlocked({ ...options, command: 'status', kind, relative_path: record.relativePath, change_kind: 'operational' }, source, existing);
    return { ...result, document_status: options.status };
  });
}

function formatError(error) {
  return {
    error: {
      code: error.code || 'document-write-failed',
      message: error.message,
    },
    ...(error.records ? { records: error.records } : {}),
  };
}

function formatSuccess(result) {
  if (!result.write) return result;
  const { status, kind, id, path: documentPath, absolute_path, revision, snapshot } = result.write;
  const registration = result.registration && (result.registration.status === 'failed'
    ? result.registration : { status: result.registration.status });
  return {
    schema_version: result.schema_version,
    write: { status, kind, id, path: documentPath, ...(absolute_path ? { absolute_path } : {}), revision, snapshot },
    registration,
    ...(result.memory ? { memory: result.memory } : {}),
    ...(result.document_status !== undefined ? { document_status: result.document_status } : {}),
  };
}

function main(argv = process.argv.slice(2), sourceBuffer) {
  if (argv.includes('--help') || argv.includes('-h')) {
    if (argv[0] === 'context') {
      process.stdout.write(`Usage: document-writer.js ${CONTEXT_USAGE}\n`
        + 'Read bounded Issue briefs and complete matching Design bodies with the ordinary save contract. No record writes or registration.\n'
        + 'Design discovery requires query or path. Query terms match literally as OR; use precise identifiers. --records is required on every call; choose the authorized scope.\n'
        + 'Issue filters are independent of Design query/path; all Issue states are included.\n'
        + '--code-context N optionally attaches rg excerpts with 1 to 40 surrounding lines, excluding record stores. Excerpts are bounded; use normal code tools for missing context or unavailable search.\n'
        + 'It also supplies project inventory, root build files and bounded ancestor AGENTS.md files. Issue-only scope permits no query for inventory and instructions before source selection.\n'
        + '--file PATH repeats to include known source/instruction/configuration files within the project, excluding record stores. Missing/oversized files are reported separately.\n'
        + '--format text presents the same protocol and current sources without JSON string escaping; json is the default.\n'
        + '--format codex-text prints readable context and an inline --data save example without stored execution state. --data accepts encodeURIComponent(JSON.stringify(packet)).replaceAll("\'","%27").\n'
        + 'Continue issues.has_more with --issue-offset, designs.has_more with --offset and --expected-revision.\n'
        + 'Resolve complete:false diagnostics before treating coverage as complete.\n');
      return;
    }
    if (argv[0] === 'record') {
      process.stdout.write(recordHelp());
      return;
    }
    if (argv[0] === 'search') {
      process.stdout.write('Usage: document-writer.js search --project-root DIR [--query TEXT] [--path PATH] [--limit N] [--offset N] [--expected-revision HASH]\n'
        + 'Supply query or path. Query terms use case-insensitive literal OR matching; paths normalize slashes and join the union.\n'
        + 'Start with a specific code identifier. term_matches reports each term\'s Design count across the catalog; refine broad terms before paging.\n'
        + '--include-source overview|documents: attach exact selected/full read source to returned page candidates only; omitted by default.\n'
        + '--limit: integer 1 to 100 (default 10). --offset: nonnegative integer (default 0).\n'
        + 'Continue has_more pages with the same query and --expected-revision source_revision; restart after design-search-changed.\n'
        + 'Resolve complete:false diagnostics before concluding that discovery is complete.\n');
      return;
    }
    process.stdout.write(USAGE + '; ' + CONTEXT_USAGE + '\n\nCreate options: --kind feature|bug|refactor|exact_port|maintenance --status draft|ready|blocked|completed|cancelled --language TAG --memory off\n'
      + 'Create JSON: {"body":"overview","documents":[{"path":"detail.md","body":"text"}]}\n'
      + 'Design write/patch options: --change-kind edit|major|operational (default: edit)\n'
      + 'edit saves within the current revision; major starts a new revision and snapshots the previous one. Use major once per change to the agreed Design contract, then edit for subsequent saves.\n'
      + PATCH_SHAPE + '\n'
      + 'New document JSON: {"documents":[{"path":"new.md","source":"absolute artifact path"}]}\n'
      + 'Use edits for registered documents. An unregistered artifact already in the Design directory can be registered unchanged with source pointing to that file.\n');
    return;
  }
  try {
    const options = parseArgs(argv);
    const result = options.command === 'create' ? createDocument(options, sourceBuffer === undefined ? fs.readFileSync(0) : sourceBuffer)
      : options.command === 'read' ? readDocument(options)
      : options.command === 'recover' ? recoverDocumentSet(options)
      : options.command === 'list' ? listDesigns(options)
      : options.command === 'search' ? searchDesigns(canonicalProjectRoot(options.project_root), options)
      : options.command === 'context' ? workContext(options)
      : options.command === 'record' ? recordWork(options, recordInput(options, sourceBuffer))
      : options.command === 'patch' ? patchDocument(options, sourceBuffer === undefined ? fs.readFileSync(0) : sourceBuffer)
      : options.command === 'status'
      ? updateDocumentStatus(options)
      : writeDocument(options, sourceBuffer === undefined ? fs.readFileSync(0) : sourceBuffer);
    process.stdout.write(options.command==='context'&&['text','codex-text'].includes(options.format)?contextText(result):`${JSON.stringify(formatSuccess(result))}\n`);
    return result;
  } catch (error) {
    process.stderr.write(`${JSON.stringify(formatError(error))}\n`);
    process.exitCode = 1;
    return null;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DocumentWriterError,
  main,
  parseArgs,
  writeDocument,
  createDocument,
  updateDocumentStatus,
  readDocument,
  patchDocument,
  listDesigns,
};
