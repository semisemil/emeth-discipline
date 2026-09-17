#!/usr/bin/env node

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
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
const { assertDesignWrite, readDevelopmentRecord } = require('../dashboard/records/development-contracts.js');
const { registerProject, rootKey } = require('../dashboard/registry.js');

const PLAN_PATH = /^\.proofline\/plan\/(PLAN-\d{4,})-([^/\\]+)\/PLAN\.md$/;
const SPEC_PATH = /^\.proofline\/specs\/(SPEC-\d{4,})-([^/\\]+)\/SPEC\.md$/;
const DESIGN_PATH = /^\.proofline\/designs\/(DESIGN-\d{4,})-([^/\\]+)\/DESIGN\.md$/;
const CHANGE_KINDS = new Set(['major', 'operational']);

class DocumentWriterError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'DocumentWriterError';
    this.code = code;
  }
}

function writerError(code, message, cause) {
  return new DocumentWriterError(code, message, cause);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!['create', 'write', 'status', 'read', 'patch'].includes(command)) {
    throw writerError(
      'invalid-command',
      'Usage: document-writer.js create --project-root DIR --title TITLE --slug SLUG; write --kind design|plan|spec --project-root DIR --relative-path PATH; status --project-root DIR --id DESIGN-ID|SPEC-ID --status STATE; read|patch --project-root DIR --id DESIGN-ID'
    );
  }

  const options = command === 'write' ? {} : { command };
  const allowed = new Set(command === 'create' ? ['project_root', 'id', 'title', 'slug', 'kind', 'status', 'memory', 'language']
    : command === 'read' ? ['project_root', 'id']
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
    if (Object.hasOwn(options, key)) {
      throw writerError('invalid-argument', `옵션이 중복되었습니다: ${argument}`);
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw writerError('invalid-argument', `${argument} 값이 필요합니다.`);
    }
    options[key] = value;
    index += 1;
  }

  if (command === 'status') {
    if (!/^(?:DESIGN|SPEC)-\d{4,}$/.test(options.id || '') || !options.status) {
      throw writerError('invalid-argument', 'Supply --id DESIGN-ID|SPEC-ID and --status STATE');
    }
    options.kind = options.id.startsWith('DESIGN-') ? 'design' : 'spec';
  }
  if (command === 'read' || command === 'patch') {
    if (!/^DESIGN-\d{4,}$/.test(options.id || '')) throw writerError('invalid-argument', 'Supply --id DESIGN-ID');
    options.kind = 'design';
  }
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
  if (typeof options.project_root !== 'string' || options.project_root.length === 0) {
    throw writerError('project-root-invalid', '--project-root에는 프로젝트 경로가 필요합니다.');
  }
  if (command === 'write' && (typeof options.relative_path !== 'string' || options.relative_path.length === 0)) {
    throw writerError('document-path-invalid', '--relative-path 값이 필요합니다.');
  }
  if (options.change_kind !== undefined && !CHANGE_KINDS.has(options.change_kind)) {
    throw writerError('change-kind-invalid', '--change-kind는 major 또는 operational이어야 합니다.');
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
  if (relativePath.includes('\0') || relativePath.includes('\\')) {
    throw writerError('document-path-invalid', '문서 경로는 프로젝트 상대 POSIX 경로여야 합니다.');
  }
  const match = ({ plan: PLAN_PATH, spec: SPEC_PATH, design: DESIGN_PATH }[kind]).exec(relativePath);
  if (!match || match[2] === '.' || match[2] === '..') {
    throw writerError('document-path-invalid', `${kind} 문서 경로가 올바르지 않습니다: ${relativePath}`);
  }
  const target = path.join(root, ...relativePath.split('/'));
  if (!isInside(root, target)) {
    throw writerError('document-path-outside-project', '프로젝트 밖의 문서는 쓸 수 없습니다.');
  }
  return { expectedId: match[1], target };
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

function installFile(root, target, buffer, existing) {
  ensureSafeDirectory(root, path.dirname(target));
  const temporary = writeTemporary(target, buffer);
  try {
    if (existing === null) {
      fs.linkSync(temporary, target);
      fs.unlinkSync(temporary);
      return;
    }

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
  if (!CHANGE_KINDS.has(changeKind)) {
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

function ensureSnapshot(root, target, existing, revision) {
  const relativePath = `${path.relative(root, path.dirname(target)).split(path.sep).join('/')}/revisions/REV-${revision}.md`;
  const snapshot = path.join(root, ...relativePath.split('/'));
  const current = readExisting(root, snapshot);
  if (current) {
    if (!current.equals(existing)) {
      throw writerError('snapshot-conflict', `기존 snapshot 내용이 다릅니다: ${relativePath}`);
    }
    return { status: 'reused', path: relativePath };
  }
  installFile(root, snapshot, existing, null);
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

function writeDocumentUnlocked(options, sourceBuffer, expectedSource) {
  const projectRoot = canonicalProjectRoot(options.project_root);
  const content = decodeContent(sourceBuffer);
  const { expectedId, target } = resolveTarget(projectRoot, options.kind, options.relative_path);
  const nextMetadata = metadataFor(options.kind, content, expectedId);
  if (options.kind === 'design') assertDesignWrite(projectRoot, nextMetadata, options.relative_path);
  const existing = readExisting(projectRoot, target);
  if (expectedSource && (!existing || !existing.equals(expectedSource))) {
    throw writerError('document-changed', '문서가 읽은 뒤 변경되어 덮어쓰지 않았습니다.');
  }

  if (existing && existing.equals(sourceBuffer)) {
    return {
      schema_version: 1,
      write: {
        status: 'no-op',
        kind: options.kind,
        id: nextMetadata.id,
        title: nextMetadata.title,
        path: options.relative_path,
        revision: options.kind !== 'plan' ? nextMetadata.revision : undefined,
        snapshot: null,
      },
      registration: null,
      ...(options.kind === 'design' ? { memory: memoryResult(projectRoot, options) } : {}),
    };
  }

  const existingMetadata = existing
    ? metadataFor(options.kind, decodeContent(existing), expectedId)
    : null;
  validateTransition(options.kind, existingMetadata, nextMetadata, options.change_kind);
  if (options.kind === 'design' && existingMetadata) {
    if (existingMetadata.supersedes.some(id => !nextMetadata.supersedes.includes(id))) {
      throw writerError('contract-history-changed', 'Preserve existing supersedes links');
    }
    const oldBody = parseFrontmatter(decodeContent(existing)).body;
    const nextBody = parseFrontmatter(content).body;
    if (options.change_kind === 'operational' && oldBody !== nextBody) {
      throw writerError('contract-revision-required', 'Design body changes require a major revision');
    }
  }

  let snapshot = null;
  if (options.kind !== 'plan' && existing && options.change_kind === 'major') {
    snapshot = ensureSnapshot(projectRoot, target, existing, existingMetadata.revision);
  }

  try {
    installFile(projectRoot, target, sourceBuffer, existing);
  } catch (error) {
    if (error instanceof DocumentWriterError) {
      throw error;
    }
    throw writerError('document-write-failed', `문서를 쓰지 못했습니다: ${error.message}`, error);
  }

  return {
    schema_version: 1,
    write: {
      status: existing ? 'updated' : 'created',
      kind: options.kind,
      id: nextMetadata.id,
      title: nextMetadata.title,
      path: options.relative_path,
      revision: options.kind !== 'plan' ? nextMetadata.revision : undefined,
      snapshot,
    },
    registration: registrationResult(projectRoot),
    ...(options.kind === 'design' ? { memory: memoryResult(projectRoot, options) } : {}),
  };
}

function memoryResult(projectRoot, options) {
  if (options.memory === 'off') return { status: 'disabled' };
  if (options.command === 'status') return require('../lib/architecture-memory.js').connectionStatus(projectRoot);
  try { return require('../skills/architecture-memory/scripts/record.js').ensureMemory(projectRoot, { language: options.language }); }
  catch (error) { return { status: 'failed', error: { code: error.code || 'memory-start-failed', message: error.message } }; }
}

function withDocumentLock(options, operation) {
  if (options.kind !== 'design') return operation();
  const root = canonicalProjectRoot(options.project_root);
  ensureSafeDirectory(root, path.join(root, '.proofline'));
  const lock = path.join(root, '.proofline', '.design-write.lock');
  assertSafeExistingPath(root, lock, 'file');
  if (fs.existsSync(lock)) {
    const owner = Number(fs.readFileSync(lock, 'utf8'));
    if (!Number.isInteger(owner) || owner <= 0) throw writerError('document-locked', 'Invalid Design lock');
    try { process.kill(owner, 0); throw writerError('document-locked', 'Another Design write is active'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    fs.unlinkSync(lock);
  }
  fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
  try { return operation(); }
  finally { fs.unlinkSync(lock); }
}

function writeDocument(options, sourceBuffer) {
  return withDocumentLock(options, () => writeDocumentUnlocked(options, sourceBuffer));
}

function createDocument(options, sourceBuffer) {
  const body = decodeContent(sourceBuffer);
  return withDocumentLock({ ...options, kind: 'design' }, () => {
    const root = canonicalProjectRoot(options.project_root);
    const { nextDocumentId, DOCUMENT_SKILLS } = require('../lib/document-number.js');
    const id = options.id || nextDocumentId(root, DOCUMENT_SKILLS['$emeth-discipline:development-design']);
    const relativePath = `.proofline/designs/${id}-${options.slug}/DESIGN.md`;
    const { target } = resolveTarget(root, 'design', relativePath);
    if (readExisting(root, target)) throw writerError('document-exists', 'Design already exists');
    const metadata = {
      schema_version: 2, id, title: options.title, kind: options.design_kind || 'feature',
      status: options.status || 'draft', revision: 1,
      supersedes: [], superseded_by: null, related_issues: [],
    };
    const content = Buffer.from(`---\n${JSON.stringify(metadata, null, 2)}\n---\n\n${body}`, 'utf8');
    return writeDocumentUnlocked({ ...options, kind: 'design', relative_path: relativePath }, content);
  });
}

function readDesignSource(options) {
  const root = canonicalProjectRoot(options.project_root);
  const record = readDevelopmentRecord(root, options.id);
  const { target } = resolveTarget(root, 'design', record.relativePath);
  const source = readExisting(root, target);
  if (!source) throw writerError('contract-unavailable', 'Document not found');
  const text = decodeContent(source);
  metadataFor('design', text, options.id);
  return { record, source, text };
}

function readDocument(options) {
  const { record, text } = readDesignSource(options);
  return { id: options.id, path: record.relativePath, text };
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

function patchDocument(options, buffer) {
  let patch;
  try { patch = JSON.parse(decodeContent(buffer)); }
  catch (error) {
    if (error instanceof DocumentWriterError) throw error;
    throw writerError('document-patch-invalid', 'Supply UTF-8 JSON with edits');
  }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)
      || Object.keys(patch).some(key => key !== 'edits')
      || !Array.isArray(patch.edits) || !patch.edits.length
      || patch.edits.some(edit => !edit || typeof edit !== 'object' || Array.isArray(edit)
        || Object.keys(edit).some(key => !['old', 'new'].includes(key))
        || typeof edit.old !== 'string' || !edit.old.length || typeof edit.new !== 'string')) {
    throw writerError('document-patch-invalid', 'Supply nonempty edits containing old/new strings');
  }
  return withDocumentLock(options, () => {
    const { record, source, text } = readDesignSource(options);
    let updated = text;
    for (const edit of patch.edits) {
      const start = updated.indexOf(edit.old);
      if (start < 0 || updated.indexOf(edit.old, start + 1) !== -1) {
        throw writerError('document-patch-match', 'Each old string must match exactly once; include enough context');
      }
      updated = updated.slice(0, start) + edit.new + updated.slice(start + edit.old.length);
      if (Buffer.byteLength(updated, 'utf8') > MAX_RECORD_BYTES) throw writerError('document-too-large', 'Patched document exceeds 2 MiB');
    }
    const revision = metadataFor('design', text, options.id).revision;
    updated = withRevision(updated, revision);
    if (updated !== text && options.change_kind === 'major') updated = withRevision(updated, revision + 1);
    const bom = source.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? source.subarray(0, 3) : Buffer.alloc(0);
    const next = Buffer.concat([bom, Buffer.from(updated, 'utf8')]);
    return writeDocumentUnlocked({ ...options, relative_path: record.relativePath }, next, source);
  });
}

function updateDocumentStatus(options) {
  if (!/^(?:DESIGN|SPEC)-\d{4,}$/.test(options.id || '') || typeof options.status !== 'string' || !options.status) {
    throw writerError('invalid-argument', 'Supply a Design or legacy Spec ID and status');
  }
  const kind = options.id.startsWith('DESIGN-') ? 'design' : 'spec';
  return withDocumentLock({ ...options, kind }, () => {
    const root = canonicalProjectRoot(options.project_root);
    const record = readDevelopmentRecord(root, options.id);
    const { target } = resolveTarget(root, kind, record.relativePath);
    const existing = readExisting(root, target);
    if (!existing) throw writerError('contract-unavailable', 'Document not found');
    const content = decodeContent(existing);
    const { metadataText } = parseFrontmatter(content);
    const metadata = JSON.parse(metadataText);
    const current = metadataFor(kind, content, options.id);
    let source = existing;
    if (current.status !== options.status) {
      metadata.status = options.status;
      const opening = /^---\r?\n/.exec(content)[0];
      const newline = opening.endsWith('\r\n') ? '\r\n' : '\n';
      const serialized = JSON.stringify(metadata, null, 2).replace(/\n/g, newline);
      const updated = opening + serialized + content.slice(opening.length + metadataText.length);
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
  };
}

function main(argv = process.argv.slice(2), sourceBuffer) {
  try {
    const options = parseArgs(argv);
    const result = options.command === 'create' ? createDocument(options, sourceBuffer === undefined ? fs.readFileSync(0) : sourceBuffer)
      : options.command === 'read' ? readDocument(options)
      : options.command === 'patch' ? patchDocument(options, sourceBuffer === undefined ? fs.readFileSync(0) : sourceBuffer)
      : options.command === 'status'
      ? updateDocumentStatus(options)
      : writeDocument(options, sourceBuffer === undefined ? fs.readFileSync(0) : sourceBuffer);
    process.stdout.write(`${JSON.stringify(result)}\n`);
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
};
