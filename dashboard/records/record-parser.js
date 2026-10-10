'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');

const issueModel = require('../../skills/issue-ledger/lib/issue-model.js');
const { rootKey } = require('../registry.js');

const MAX_RECORD_BYTES = 2 * 1024 * 1024;
const READ_CHUNK_BYTES = 4096;
const ISSUE_ID = /^PL-\d{4,}$/;
const PLAN_ID = /^PLAN-\d{4,}$/;
const SPEC_ID = /^SPEC-\d{4,}$/;
const DESIGN_ID = /^DESIGN-\d{4,}$/;
const DEVELOPMENT_ID = /^(?:DESIGN|SPEC|PLAN)-\d{4,}$/;
const SPEC_KINDS = new Set(['feature', 'bug', 'refactor', 'exact_port', 'maintenance']);
const SPEC_STATUSES = new Set(['draft', 'ready', 'blocked', 'completed', 'cancelled', 'superseded']);

class RecordError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'RecordError';
    this.code = code;
  }
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!path.isAbsolute(relative)
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`));
}

function realpath(filePath) {
  const resolve = fs.realpathSync.native || fs.realpathSync;
  return path.normalize(resolve(filePath));
}

function decodeUtf8(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (error) {
    throw new RecordError('record-invalid-utf8', '기록이 올바른 UTF-8이 아닙니다.', error);
  }
}

function validateUtf8Chunk(decoder, buffer, stream) {
  try {
    decoder.decode(buffer, { stream });
  } catch (error) {
    throw new RecordError('record-invalid-utf8', '기록이 올바른 UTF-8이 아닙니다.', error);
  }
}

function appendRetainedChunk(state, bytes) {
  if (bytes.length === 0) {
    return;
  }
  const copy = Buffer.from(bytes);
  state.chunks.push(copy);
  state.length += copy.length;
}

function findClosingDelimiter(window) {
  let match = null;
  for (const marker of [Buffer.from('\n---\n'), Buffer.from('\n---\r\n')]) {
    const index = window.indexOf(marker);
    if (index !== -1 && (!match || index < match.index)) {
      match = { index, length: marker.length };
    }
  }
  return match;
}

function retainSummaryMetadata(state, bytes, complete) {
  let remaining = bytes;
  if (state.opening === 'pending') {
    const needed = Math.min(5 - state.openingProbe.length, remaining.length);
    state.openingProbe = Buffer.concat([
      state.openingProbe,
      remaining.subarray(0, needed),
    ]);
    remaining = remaining.subarray(needed);
    const unixOpening = state.openingProbe.length >= 4
      && state.openingProbe.subarray(0, 4).equals(Buffer.from('---\n'));
    const windowsOpening = state.openingProbe.length >= 5
      && state.openingProbe.subarray(0, 5).equals(Buffer.from('---\r\n'));
    if (unixOpening || windowsOpening) {
      state.opening = 'valid';
      appendRetainedChunk(state, state.openingProbe);
      state.searchTail = state.openingProbe.subarray(-5);
    } else if (state.openingProbe.length === 5 || complete) {
      state.opening = 'invalid';
      state.metadataComplete = true;
      appendRetainedChunk(state, state.openingProbe);
    }
  }

  if (state.metadataComplete || state.opening !== 'valid' || remaining.length === 0) {
    return;
  }

  const window = Buffer.concat([state.searchTail, remaining]);
  const closing = findClosingDelimiter(window);
  if (closing) {
    const retainedFromCurrent = Math.max(0, closing.index + closing.length - state.searchTail.length);
    appendRetainedChunk(state, remaining.subarray(0, retainedFromCurrent));
    state.metadataComplete = true;
    return;
  }
  appendRetainedChunk(state, remaining);
  state.searchTail = window.subarray(-5);
}

function readRecordBytes(fileReal, size, retainFrontmatterOnly) {
  const retained = retainFrontmatterOnly ? null : Buffer.alloc(size);
  const summaryState = retainFrontmatterOnly ? {
    chunks: [],
    length: 0,
    metadataComplete: false,
    opening: 'pending',
    openingProbe: Buffer.alloc(0),
    searchTail: Buffer.alloc(0),
  } : null;
  const chunk = Buffer.alloc(Math.min(size || READ_CHUNK_BYTES, READ_CHUNK_BYTES));
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let offset = 0;
  let retainedLength = 0;
  const descriptor = fs.openSync(fileReal, 'r');
  try {
    while (offset < size) {
      const requested = Math.min(READ_CHUNK_BYTES, size - offset);
      const count = fs.readSync(descriptor, chunk, 0, requested, offset);
      if (count === 0) {
        break;
      }
      const bytes = chunk.subarray(0, count);
      validateUtf8Chunk(decoder, bytes, true);

      if (!retainFrontmatterOnly) {
        bytes.copy(retained, retainedLength);
        retainedLength += count;
      } else {
        retainSummaryMetadata(summaryState, bytes, offset + count >= size);
      }
      offset += count;
    }
    validateUtf8Chunk(decoder, undefined, false);
  } finally {
    fs.closeSync(descriptor);
  }
  return retainFrontmatterOnly
    ? Buffer.concat(summaryState.chunks, summaryState.length)
    : retained.subarray(0, retainedLength);
}

function readSecureRecord(filePath, options) {
  let rootReal;
  let directoryReal;
  let fileReal;
  let stat;
  try {
    rootReal = realpath(options.root);
    directoryReal = realpath(options.directory);
    fileReal = realpath(filePath);
    stat = fs.statSync(fileReal);
  } catch (error) {
    throw new RecordError('record-unavailable', '기록을 읽을 수 없습니다.', error);
  }

  const canonicalRoot = path.normalize(path.resolve(options.root));
  if (rootKey(rootReal) !== rootKey(canonicalRoot)) {
    throw new RecordError('project-root-replaced', '등록된 프로젝트 루트가 다른 위치를 가리킵니다.');
  }
  if (!isInside(rootReal, directoryReal)
      || !isInside(rootReal, fileReal)
      || !isInside(directoryReal, fileReal)) {
    throw new RecordError('record-path-outside-project', '등록 프로젝트 밖의 기록은 읽을 수 없습니다.');
  }
  if (!stat.isFile()) {
    throw new RecordError('record-not-file', '기록 후보가 파일이 아닙니다.');
  }
  if (stat.size > MAX_RECORD_BYTES) {
    throw new RecordError('record-too-large', '기록이 2 MiB 한도를 초과합니다.');
  }

  let buffer;
  try {
    const prefixOnly = options.readMode === 'summary'
      && ['plan', 'spec', 'design'].includes(options.kind);
    buffer = readRecordBytes(fileReal, stat.size, prefixOnly);
  } catch (error) {
    if (error instanceof RecordError) {
      throw error;
    }
    throw new RecordError('record-unavailable', '기록을 읽을 수 없습니다.', error);
  }

  return {
    content: decodeUtf8(buffer),
    fileReal,
    stat,
  };
}

function parseFrontmatter(content) {
  const match = String(content).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) {
    throw new RecordError('record-metadata-invalid', '기록 frontmatter가 올바르지 않습니다.');
  }
  return { metadataText: match[1], body: match[2] };
}

function parseYamlScalar(value, field) {
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new RecordError('record-metadata-invalid', `${field} 값이 필요합니다.`);
  }
  if (trimmed.startsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed !== 'string') {
        throw new Error('문자열이 아닙니다.');
      }
      return parsed;
    } catch (error) {
      throw new RecordError('record-metadata-invalid', `${field} 값이 올바르지 않습니다.`, error);
    }
  }
  if (trimmed.startsWith("'")) {
    if (!trimmed.endsWith("'") || trimmed.length < 2) {
      throw new RecordError('record-metadata-invalid', `${field} 값이 올바르지 않습니다.`);
    }
    const inner = trimmed.slice(1, -1);
    if (inner.replace(/''/g, '').includes("'")) {
      throw new RecordError('record-metadata-invalid', `${field} 값이 올바르지 않습니다.`);
    }
    return inner.replace(/''/g, "'");
  }
  if (/^(?:---(?:\s|$)|\.\.\.(?:\s|$)|[-?:](?:\s|$)|[,\[\]{}#&*!|>%@`])/.test(trimmed)
      || /[\r\n\t]/.test(trimmed)
      || /:(?:\s|$)/.test(trimmed)
      || /(?:^|\s)#/.test(trimmed)
      || /^(?:null|~|true|false|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?|\.nan|[-+]?\.inf)$/i.test(trimmed)) {
    throw new RecordError('record-metadata-invalid', `${field} 값이 올바르지 않습니다.`);
  }
  return trimmed;
}

function parseRelatedIssuesInline(value) {
  const trimmed = value.trim();
  if (trimmed === '[]') {
    return [];
  }
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    throw new RecordError('record-metadata-invalid', 'related_issues 배열이 올바르지 않습니다.');
  }
  const inner = trimmed.slice(1, -1).trim();
  return inner === '' ? [] : inner.split(',').map((item) => parseYamlScalar(item, 'related_issues'));
}

function validateRelatedIssues(value) {
  if (!Array.isArray(value)
      || value.some((id) => typeof id !== 'string' || !ISSUE_ID.test(id))
      || new Set(value).size !== value.length) {
    throw new RecordError('record-metadata-invalid', 'related_issues가 올바르지 않습니다.');
  }
  return value;
}

function parsePlanMetadata(metadataText) {
  const lines = metadataText.split(/\r?\n/);
  const metadata = {};
  const allowed = new Set(['id', 'title', 'status', 'related_issues']);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^([a-z_]+):(?:\s*(.*))?$/);
    if (!match || !allowed.has(match[1]) || Object.hasOwn(metadata, match[1])) {
      throw new RecordError('record-metadata-invalid', 'Plan frontmatter가 올바르지 않습니다.');
    }
    const key = match[1];
    const value = match[2] || '';
    if (key !== 'related_issues') {
      metadata[key] = parseYamlScalar(value, key);
      continue;
    }
    if (value.trim() !== '') {
      metadata.related_issues = parseRelatedIssuesInline(value);
      continue;
    }
    const related = [];
    while (index + 1 < lines.length && /^\s+-\s+/.test(lines[index + 1])) {
      index += 1;
      related.push(parseYamlScalar(lines[index].replace(/^\s+-\s+/, ''), 'related_issues'));
    }
    metadata.related_issues = related;
  }

  if (!PLAN_ID.test(metadata.id || '')
      || typeof metadata.title !== 'string' || metadata.title.trim() === ''
      || !new Set(['draft', 'ready']).has(metadata.status)
      || (metadata.related_issues !== undefined && !Array.isArray(metadata.related_issues))) {
    throw new RecordError('record-metadata-invalid', 'Plan metadata가 올바르지 않습니다.');
  }
  metadata.related_issues = validateRelatedIssues(metadata.related_issues || []);
  return metadata;
}

function parseSpecMetadata(metadataText, design = false) {
  let metadata;
  try {
    metadata = JSON.parse(metadataText.replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new RecordError('record-metadata-invalid', 'Spec JSON frontmatter가 올바르지 않습니다.', error);
  }

  const required = [
    'schema_version', 'id', 'title', 'kind', 'status', 'revision',
    'supersedes', 'superseded_by', 'related_issues',
  ];
  if (design && metadata && Object.hasOwn(metadata, 'documents')) required.push('documents');
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)
      || Object.keys(metadata).sort().join(',') !== [...required].sort().join(',')
      || metadata.schema_version !== 2
      || !(design ? DESIGN_ID : SPEC_ID).test(metadata.id || '')
      || typeof metadata.title !== 'string' || metadata.title.trim() === ''
      || !SPEC_KINDS.has(metadata.kind)
      || !SPEC_STATUSES.has(metadata.status)
      || !Number.isInteger(metadata.revision) || metadata.revision < 1
      || !Array.isArray(metadata.supersedes)
      || metadata.supersedes.some((id) => !(design ? DEVELOPMENT_ID : SPEC_ID).test(id) || design && id === metadata.id)
      || new Set(metadata.supersedes).size !== metadata.supersedes.length
      || (metadata.superseded_by !== null && (!(design ? DESIGN_ID : SPEC_ID).test(metadata.superseded_by || '') || design && metadata.superseded_by === metadata.id))) {
    throw new RecordError('record-metadata-invalid', `${design ? 'Design' : 'Spec'} metadata가 올바르지 않습니다.`);
  }
  metadata.related_issues = validateRelatedIssues(metadata.related_issues);
  if (design && Object.hasOwn(metadata, 'documents')) {
    try { require('../../lib/design-documents.js').validateDocumentPaths(metadata.documents); }
    catch (error) { throw new RecordError('record-metadata-invalid', error.message, error); }
  }
  return metadata;
}

function parseDesignMetadata(metadataText) {
  return parseSpecMetadata(metadataText, true);
}

function safeIssueBody(view) {
  return {
    ...view,
    validation: {
      valid: view.validation.valid,
      errors: view.validation.errors,
      warnings: view.validation.warnings,
    },
  };
}

function parseCurrentRecord(options) {
  const includeBody = options.includeBody !== false;
  const { content, stat } = readSecureRecord(options.filePath, {
    kind: options.kind,
    root: options.root,
    directory: options.directory,
    includeBody,
    readMode: options.readMode || 'index',
  });
  const modifiedAt = stat.mtime.toISOString();

  if (options.kind === 'issue') {
    let view;
    try {
      view = issueModel.parseIssueContent(content, path.basename(options.filePath));
    } catch (error) {
      throw new RecordError('record-metadata-invalid', 'Issue metadata가 올바르지 않습니다.', error);
    }
    if (!ISSUE_ID.test(view.id) || (options.expectedId && view.id !== options.expectedId)) {
      throw new RecordError('record-id-mismatch', 'Issue 파일 ID와 본문 ID가 일치하지 않습니다.');
    }
    return {
      kind: 'issue',
      id: view.id,
      title: view.title,
      status: view.status,
      metadata: {
        schema_version: view.schemaVersion,
        type: view.type,
        mode: view.mode,
        risk: view.risk,
        created_at: view.createdAt,
        updated_at: view.updatedAt,
      },
      contentType: 'application/json',
      body: includeBody ? safeIssueBody(view) : undefined,
      relativePath: options.relativePath,
      updatedAt: view.updatedAt || modifiedAt,
      fileModifiedAt: modifiedAt,
      type: view.type,
      risk: view.risk,
      currentSummary: view.currentSummary,
      nextAction: view.nextAction,
      context: Array.isArray(view.context) ? view.context : [],
      relatedIssues: [],
      source: {
        filePath: options.filePath,
        directory: options.directory,
        expectedId: options.expectedId,
      },
    };
  }

  const { metadataText, body } = parseFrontmatter(content);
  const metadata = options.kind === 'plan'
    ? parsePlanMetadata(metadataText)
    : options.kind === 'design' ? parseDesignMetadata(metadataText) : parseSpecMetadata(metadataText);
  if (options.expectedId && metadata.id !== options.expectedId) {
    throw new RecordError('record-id-mismatch', '기록 폴더 ID와 본문 ID가 일치하지 않습니다.');
  }
  return {
    kind: options.kind,
    id: metadata.id,
    title: metadata.title,
    status: metadata.status,
    metadata,
    contentType: 'text/markdown',
    body: includeBody ? body : undefined,
    relativePath: options.relativePath,
    updatedAt: modifiedAt,
    fileModifiedAt: modifiedAt,
    relatedIssues: metadata.related_issues,
    revision: options.kind !== 'plan' ? metadata.revision : undefined,
    specKind: options.kind !== 'plan' ? metadata.kind : undefined,
    source: {
      filePath: options.filePath,
      directory: options.directory,
      expectedId: options.expectedId,
    },
  };
}

module.exports = {
  DESIGN_ID,
  DEVELOPMENT_ID,
  ISSUE_ID,
  MAX_RECORD_BYTES,
  PLAN_ID,
  READ_CHUNK_BYTES,
  RecordError,
  SPEC_ID,
  isInside,
  parseCurrentRecord,
  parseFrontmatter,
  parsePlanMetadata,
  parseSpecMetadata,
  parseDesignMetadata,
  readSecureRecord,
};
