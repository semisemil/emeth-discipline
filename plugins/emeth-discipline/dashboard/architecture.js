'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const roots = require('../lib/document-roots.js');

const { rootKey } = require('./registry.js');
const { ProjectApiError } = require('./records/project-index.js');

const MANIFEST_RELATIVE_PATH = 'docs/architecture/.architecture-memory/manifest.json';
const MANIFEST_NAME = 'manifest.json';
const MEMORY_DIRECTORY = '.architecture-memory';
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const MAX_DISCOVERY_DEPTH = 8;
const MAX_DISCOVERY_DIRECTORIES = 1024;
const DOCUMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const GIT_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const DOCUMENT_KINDS = new Set([
  'index',
  'system-context',
  'containers',
  'component-index',
  'component',
  'context',
  'decision-index',
  'decision',
]);

function realpath(filePath) {
  const resolve = fs.realpathSync.native || fs.realpathSync;
  return path.normalize(resolve(filePath));
}

function sameIdentity(first, second) {
  return first.dev === second.dev && first.ino === second.ino;
}

function toRelative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function architectureError(code, message, status = 409, cause) {
  return new ProjectApiError(code, message, status, cause);
}

function canonicalProjectRoot(project) {
  try {
    const expected = path.normalize(path.resolve(project.root));
    const canonical = realpath(expected);
    const status = fs.statSync(canonical, { bigint: true });
    if (!status.isDirectory() || rootKey(canonical) !== rootKey(expected)) {
      throw new Error('registered root changed');
    }
    return canonical;
  } catch (error) {
    throw architectureError(
      'project-unavailable',
      '프로젝트를 읽을 수 없습니다.',
      409,
      error,
    );
  }
}

function decodeUtf8(buffer, code, message) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (error) {
    throw architectureError(code, message, 409, error);
  }
}

function readSecureFile(options) {
  let descriptor;
  try {
    const candidate = path.resolve(options.path);
    const storageRoot = options.storageRoot || options.projectRoot;
    if (!roots.inside(storageRoot, candidate)
        || !roots.inside(options.boundaryRoot, candidate)) {
      throw architectureError(
        'architecture-path-outside-project',
        '아키텍처 문서 경로가 프로젝트 밖을 가리킵니다.',
      );
    }

    const canonical = realpath(candidate);
    if (!roots.inside(storageRoot, canonical)
        || !roots.inside(options.boundaryRoot, canonical)) {
      throw architectureError(
        'architecture-path-outside-project',
        '아키텍처 문서 경로가 프로젝트 밖을 가리킵니다.',
      );
    }
    const before = fs.statSync(canonical, { bigint: true });
    if (!before.isFile()) {
      throw architectureError('architecture-not-file', '아키텍처 문서가 파일이 아닙니다.');
    }
    if (before.size > BigInt(options.maxBytes)) {
      throw architectureError('architecture-too-large', options.tooLargeMessage);
    }

    descriptor = fs.openSync(canonical, fs.constants.O_RDONLY);
    const opened = fs.fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || !sameIdentity(before, opened)) {
      throw architectureError('architecture-unavailable', '아키텍처 문서를 읽을 수 없습니다.');
    }
    const buffer = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < buffer.length) {
      const count = fs.readSync(descriptor, buffer, offset, buffer.length - offset, offset);
      if (count === 0) {
        break;
      }
      offset += count;
    }
    if (offset !== buffer.length) {
      throw architectureError('architecture-unavailable', '아키텍처 문서를 읽을 수 없습니다.');
    }

    const currentCanonical = realpath(candidate);
    const current = fs.statSync(currentCanonical, { bigint: true });
    const currentProjectRoot = realpath(options.projectRoot);
    if (rootKey(currentProjectRoot) !== rootKey(options.projectRoot)
        || !roots.inside(storageRoot, currentCanonical)
        || !roots.inside(options.boundaryRoot, currentCanonical)
        || !current.isFile()
        || !sameIdentity(opened, current)
        || current.size !== opened.size
        || current.mtimeNs !== opened.mtimeNs
        || current.ctimeNs !== opened.ctimeNs) {
      throw architectureError('architecture-unavailable', '아키텍처 문서를 읽을 수 없습니다.');
    }

    return {
      content: decodeUtf8(buffer, options.utf8Code, options.utf8Message),
      modifiedAt: new Date(Number(current.mtimeMs)).toISOString(),
    };
  } catch (error) {
    if (error instanceof ProjectApiError) {
      throw error;
    }
    throw architectureError('architecture-unavailable', '아키텍처 문서를 읽을 수 없습니다.', 409, error);
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // The primary read result remains authoritative.
      }
    }
  }
}

function discoverManifest(projectRoot) {
  const setting = roots.architectureSetting(projectRoot);
  if (setting && (roots.configuredRoot(projectRoot, 'architecture') || !setting.startsWith('docs/'))) {
    const directory = roots.rootPath(projectRoot, setting);
    roots.checkOwner(projectRoot, directory);
    const manifestPath = path.join(directory, MEMORY_DIRECTORY, MANIFEST_NAME);
    if (!fs.existsSync(manifestPath)) throw architectureError('architecture-not-found', '아키텍처 메모리를 찾을 수 없습니다.', 404);
    return { docsRoot: directory, manifestPath, configured: true };
  }
  const docsPath = path.join(projectRoot, 'docs');
  let docsRoot;
  try {
    docsRoot = realpath(docsPath);
    if (!fs.statSync(docsRoot).isDirectory() || !roots.inside(projectRoot, docsRoot)) {
      throw new Error('docs outside project');
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw architectureError('architecture-not-found', '아키텍처 메모리를 찾을 수 없습니다.', 404);
    }
    throw architectureError('architecture-unavailable', '아키텍처 문서 디렉터리를 읽을 수 없습니다.', 409, error);
  }

  const manifests = [];
  const queue = [{ directory: docsRoot, depth: 0 }];
  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    visited += 1;
    if (visited > MAX_DISCOVERY_DIRECTORIES) {
      throw architectureError(
        'architecture-discovery-limit',
        '아키텍처 메모리 탐색 범위를 초과했습니다.',
      );
    }

    let entries;
    try {
      entries = fs.readdirSync(current.directory, { withFileTypes: true });
    } catch (error) {
      throw architectureError(
        'architecture-unavailable',
        '아키텍처 문서 디렉터리를 읽을 수 없습니다.',
        409,
        error,
      );
    }
    for (const entry of entries) {
      if (entry.name === MEMORY_DIRECTORY && entry.isDirectory()) {
        const candidate = path.join(current.directory, entry.name, MANIFEST_NAME);
        if (fs.existsSync(candidate)) {
          manifests.push(candidate);
        }
        continue;
      }
      if (current.depth >= MAX_DISCOVERY_DEPTH || !entry.isDirectory()) {
        continue;
      }
      const child = path.join(current.directory, entry.name);
      let childReal;
      try {
        childReal = realpath(child);
      } catch {
        continue;
      }
      if (roots.inside(docsRoot, childReal)) {
        queue.push({ directory: childReal, depth: current.depth + 1 });
      }
    }
  }

  if (manifests.length === 0) {
    throw architectureError('architecture-not-found', '아키텍처 메모리를 찾을 수 없습니다.', 404);
  }
  if (manifests.length !== 1) {
    throw architectureError('architecture-ambiguous', '아키텍처 메모리 매니페스트가 여러 개입니다.');
  }
  return { docsRoot, manifestPath: manifests[0] };
}

function validNullableString(value, options = {}) {
  return value === null || (typeof value === 'string'
    && value.length > 0
    && value.length <= (options.maxLength || 256)
    && (!options.date || !Number.isNaN(Date.parse(value))));
}

function validGitCheckpoint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== 'branch_at_check,checked_at,revision') {
    return false;
  }
  if (value.revision === null) {
    return value.branch_at_check === null && value.checked_at === null;
  }
  return GIT_OBJECT_ID.test(value.revision)
    && (value.branch_at_check === null
      || (typeof value.branch_at_check === 'string'
        && value.branch_at_check.length > 0
        && value.branch_at_check.length <= 256
        && value.branch_at_check.trim() === value.branch_at_check
        && !/[\u0000-\u001f\u007f]/.test(value.branch_at_check)))
    && typeof value.checked_at === 'string'
    && validNullableString(value.checked_at, { date: true });
}

function normalizeDocumentPath(value) {
  if (typeof value !== 'string'
      || value.length === 0
      || value.length > 512
      || value.includes('\\')
      || value.includes('\0')
      || path.posix.isAbsolute(value)
      || path.posix.normalize(value) !== value
      || value.split('/').some((part) => part === '' || part === '.' || part === '..')
      || path.posix.extname(value).toLowerCase() !== '.md'
      || value.split('/').includes(MEMORY_DIRECTORY)) {
    return null;
  }
  return value;
}

function parseManifest(content, options = {}) {
  let value;
  try {
    value = JSON.parse(content.replace(/^\uFEFF/, ''));
  } catch (error) {
    throw architectureError('architecture-manifest-invalid', '아키텍처 매니페스트 JSON이 올바르지 않습니다.', 409, error);
  }
  const keys = value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value).sort().join(',')
    : '';
  if (keys !== 'documents,git_checkpoint,language,managed,schema_version'
      || value.schema_version !== 2
      || typeof value.managed !== 'boolean'
      || typeof value.language !== 'string'
      || value.language.trim() === ''
      || value.language.length > 64
      || !validGitCheckpoint(value.git_checkpoint)
      || !Array.isArray(value.documents)) {
    throw architectureError('architecture-manifest-invalid', '아키텍처 매니페스트 형식이 올바르지 않습니다.');
  }
  if (!value.managed && !options.allowDisabled) {
    throw architectureError('architecture-not-managed', '이 프로젝트의 아키텍처 메모리는 비활성 상태입니다.', 404);
  }

  const ids = new Set();
  const paths = new Set();
  const documents = value.documents.map((document) => {
    const documentKeys = document && typeof document === 'object' && !Array.isArray(document)
      ? Object.keys(document).sort().join(',')
      : '';
    const relativePath = normalizeDocumentPath(document?.path);
    if (documentKeys !== 'id,kind,order,path,source_revision,verified_at'
        || !DOCUMENT_ID.test(document.id || '')
        || !DOCUMENT_KINDS.has(document.kind)
        || !relativePath
        || !Number.isInteger(document.order)
        || document.order < 0
        || !validNullableString(document.verified_at, { date: true })
        || !validNullableString(document.source_revision)) {
      throw architectureError('architecture-manifest-invalid', '아키텍처 문서 등록 정보가 올바르지 않습니다.');
    }
    if (ids.has(document.id) || paths.has(relativePath)) {
      throw architectureError('architecture-manifest-invalid', '아키텍처 문서 ID 또는 경로가 중복됩니다.');
    }
    ids.add(document.id);
    paths.add(relativePath);
    return { ...document, path: relativePath };
  });
  documents.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  return { ...value, documents };
}

function loadArchitecture(project, options = {}) {
  const projectRoot = canonicalProjectRoot(project);
  const { docsRoot, manifestPath, configured } = discoverManifest(projectRoot);
  const architectureRootPath = path.dirname(path.dirname(manifestPath));
  let architectureRoot;
  try {
    architectureRoot = realpath(architectureRootPath);
    if (!fs.statSync(architectureRoot).isDirectory()
        || (!configured && !roots.inside(projectRoot, architectureRoot))
        || !roots.inside(docsRoot, architectureRoot)) {
      throw new Error('architecture root outside docs');
    }
  } catch (error) {
    throw architectureError('architecture-unavailable', '아키텍처 문서 디렉터리를 읽을 수 없습니다.', 409, error);
  }

  const manifestFile = readSecureFile({
    path: manifestPath,
    projectRoot,
    storageRoot: configured ? docsRoot : projectRoot,
    boundaryRoot: docsRoot,
    maxBytes: MAX_MANIFEST_BYTES,
    tooLargeMessage: '아키텍처 매니페스트가 256 KiB 한도를 초과합니다.',
    utf8Code: 'architecture-manifest-invalid-utf8',
    utf8Message: '아키텍처 매니페스트가 올바른 UTF-8이 아닙니다.',
  });
  return {
    architectureRoot,
    manifest: parseManifest(manifestFile.content, options),
    manifestRelativePath: toRelative(projectRoot, manifestPath),
    projectRoot,
  };
}

class ArchitectureService {
  constructor(options) {
    this.projectService = options.projectService;
  }

  getIndex(projectId) {
    const project = this.projectService.findProject(projectId);
    const state = loadArchitecture(project);
    return {
      schema_version: 1,
      project: {
        id: project.id,
        name: path.basename(state.projectRoot) || state.projectRoot,
      },
      language: state.manifest.language,
      git_checkpoint: state.manifest.git_checkpoint,
      manifest_path: state.manifestRelativePath,
      documents: state.manifest.documents,
    };
  }

  getDocument(projectId, documentId) {
    if (!DOCUMENT_ID.test(documentId || '')) {
      throw architectureError('architecture-document-id-invalid', '아키텍처 문서 ID가 올바르지 않습니다.', 400);
    }
    const project = this.projectService.findProject(projectId);
    const state = loadArchitecture(project);
    const registered = state.manifest.documents.find((document) => document.id === documentId);
    if (!registered) {
      throw architectureError('architecture-document-not-found', '아키텍처 문서를 찾을 수 없습니다.', 404);
    }
    const file = readArchitectureDocument(state, documentId);
    return {
      ...registered,
      content_type: 'text/markdown',
      body: file.content,
      modified_at: file.modifiedAt,
    };
  }
}

function readArchitectureDocument(state, documentId) {
  const registered = state.manifest.documents.find((document) => document.id === documentId);
  if (!registered) {
    throw architectureError('architecture-document-not-found', '아키텍처 문서를 찾을 수 없습니다.', 404);
  }
  return readSecureFile({
    path: path.resolve(state.architectureRoot, ...registered.path.split('/')),
    projectRoot: state.projectRoot,
    storageRoot: state.architectureRoot,
    boundaryRoot: state.architectureRoot,
    maxBytes: MAX_DOCUMENT_BYTES,
    tooLargeMessage: '아키텍처 문서가 2 MiB 한도를 초과합니다.',
    utf8Code: 'architecture-document-invalid-utf8',
    utf8Message: '아키텍처 문서가 올바른 UTF-8이 아닙니다.',
  });
}

module.exports = {
  ArchitectureService,
  DOCUMENT_KINDS,
  MANIFEST_RELATIVE_PATH,
  MAX_DOCUMENT_BYTES,
  MAX_MANIFEST_BYTES,
  discoverManifest,
  loadArchitecture,
  parseManifest,
  readArchitectureDocument,
};
