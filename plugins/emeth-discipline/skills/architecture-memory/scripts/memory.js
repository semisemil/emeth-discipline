#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { loadArchitecture, readArchitectureDocument } = require('../../../dashboard/architecture.js');
const { jsonFile, safePath, WORK, hash } = require('./storage.js');

const MAX_CORPUS_BYTES = 32 * 1024 * 1024;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const STATE = /^\*\*(confirmed|inferred|proposed|unknown)\/(current|planned|historical)\*\*(?:\r?\n|$)/;

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

function normalizePath(value) {
  if (typeof value !== 'string' || !value.trim() || /[\0:*?]/.test(value)) return null;
  const normalized = value.replace(/\\/g, '/').replace(/\/$/, '');
  if (normalized.startsWith('/') || normalized.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  return normalized;
}

// Only level 1/2 headings split records. Nested explanations and fenced examples stay together.
function sections(source) {
  const lines = source.split('\n');
  const starts = [];
  let fence = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/\r$/, '');
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (marker) { fence = marker[1]; continue; }
    if (/^#{1,2} /.test(line) && (index > 0 || !line.startsWith('# '))) starts.push(index);
  }
  if (!starts.length) return { intro: '', sections: [{ line: 1, text: source.trim() }] };
  return {
    intro: lines.slice(0, starts[0]).join('\n').trim(),
    sections: starts.map((start, index) => ({
      line: start + 1,
      text: lines.slice(start, starts[index + 1] ?? lines.length).join('\n').trim(),
    })),
  };
}

function routing(text, location) {
  const markers = [...text.matchAll(/<!-- am: ([\s\S]*?) -->/g)];
  if (!markers.length) {
    if (text.includes('<!-- am:')) fail('memory-metadata-invalid', `${location}: unterminated am metadata`);
    return null;
  }
  if (markers.length !== 1 || (text.match(/<!-- am:/g) || []).length !== 1) fail('memory-metadata-invalid', `${location}: one complete am record per section required`);
  const header = text.replace(/^#{1,2} [^\n]*(?:\n|$)/, '').trimStart();
  if (!header.startsWith(markers[0][0])) fail('memory-metadata-invalid', `${location}: am metadata must directly follow the section heading`);
  let value;
  try { value = JSON.parse(markers[0][1]); } catch { fail('memory-metadata-invalid', `${location}: invalid am JSON`); }
  if (!value || Array.isArray(value) || typeof value !== 'object' || typeof value.id !== 'string' || !ID.test(value.id)
      || Object.keys(value).some((key) => !['id', 'paths', 'terms', 'links', 'always'].includes(key))
      || (value.always !== undefined && typeof value.always !== 'boolean')) {
    fail('memory-metadata-invalid', `${location}: invalid am fields`);
  }
  for (const key of ['paths', 'terms', 'links']) {
    if (value[key] !== undefined && (!Array.isArray(value[key])
        || value[key].some((item) => typeof item !== 'string' || !item.trim()))) {
      fail('memory-metadata-invalid', `${location}: invalid ${key}`);
    }
  }
  if ((value.paths || []).some((item) => normalizePath(item) !== item)
      || (value.links || []).some((item) => !ID.test(item))) {
    fail('memory-metadata-invalid', `${location}: invalid path or linked ID`);
  }
  return value;
}

function outsideFences(source) {
  let fence = null;
  return source.split('\n').map((line) => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      return '';
    }
    if (marker) { fence = marker[1]; return ''; }
    return line;
  }).join('\n');
}

function loadRecords(projectRoot) {
  const root = path.normalize(fs.realpathSync(projectRoot));
  const state = loadArchitecture({ root });
  const pending = jsonFile(safePath(state.architectureRoot, `${WORK}/state.json`), 128 * 1024 * 1024);
  if (pending && (pending.schema_version !== 1 || !['draft', 'applying', 'applied'].includes(pending.phase))) fail('memory-state-invalid', 'Invalid publication state; inspect the pending workflow before retrieval.');
  if (pending?.phase === 'applying') fail('memory-applying', 'Memory publication is incomplete; resume workflow.js apply first.');
  if (jsonFile(safePath(state.architectureRoot, `${WORK}/record.json`), 128 * 1024 * 1024)) fail('memory-record-pending', 'Resume record.js ensure before relying on an interrupted record publication');
  const sources = new Map(state.manifest.documents.map((document) => [document.path, readArchitectureDocument(state, document.id).content]));
  return recordsFromSources(state, sources);
}

function recordsFromSources(state, sources) {
  const root = state.projectRoot;
  const records = [];
  const digest = createHash('sha256').update(JSON.stringify(state.manifest));
  let sourceBytes = 0;
  for (const document of state.manifest.documents) {
    const source = sources.get(document.path);
    if (typeof source !== 'string') fail('memory-document-missing', `Missing document: ${document.path}`);
    sourceBytes += Buffer.byteLength(source);
    if (sourceBytes > MAX_CORPUS_BYTES) fail('memory-corpus-limit', 'Registered Markdown exceeds 32 MiB; narrow the registered collection.');
    digest.update(document.path).update('\0').update(source);
    const parsed = sections(source);
    // A shared preamble is included with every selected section; put routing on sections, not the preamble.
    if (outsideFences(parsed.intro).includes('<!-- am:')) fail('memory-metadata-invalid', `${document.path}: move am metadata under a level-2 heading`);
    for (const section of parsed.sections) {
      const visible = outsideFences(section.text);
      const meta = routing(visible, `${document.path}:${section.line}`);
      const header = visible.replace(/^#{1,2} [^\n]*(?:\n|$)/, '').trimStart()
        .replace(/^<!-- am: [\s\S]*? -->\s*/, '');
      const status = header.match(STATE);
      records.push({
        id: meta?.id || `${document.id}@${section.line}`,
        stable: Boolean(meta),
        path: path.relative(root, path.join(state.architectureRoot, document.path)).split(path.sep).join('/'),
        line: section.line,
        title: section.text.match(/^#{1,2} (.+)/m)?.[1]?.trim() || document.id,
        kind: document.kind,
        confidence: status?.[1] || 'unclassified',
        lifecycle: status?.[2] || (document.kind === 'decision' ? 'historical' : 'unclassified'),
        paths: meta?.paths || [],
        terms: meta?.terms || [],
        links: meta?.links || [],
        always: meta?.always || false,
        intro: parsed.intro,
        text: section.text,
      });
    }
  }
  const byId = new Map();
  for (const record of records) {
    if (byId.has(record.id)) fail('memory-id-duplicate', `Duplicate memory ID: ${record.id}`);
    byId.set(record.id, record);
  }
  for (const record of records) {
    for (const link of record.links) {
      if (!byId.has(link)) fail('memory-link-missing', `${record.id}: missing required record ${link}`);
    }
  }
  return { records, byId, revision: digest.digest('hex'), sourceBytes, state };
}

function pointer(record) {
  return {
    id: record.id, path: record.path, line: record.line, title: record.title,
    confidence: record.confidence, lifecycle: record.lifecycle, stable: record.stable,
  };
}

function folded(text) { return text.normalize('NFKC').toLowerCase(); }
function overlaps(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function search(corpus, options = {}) {
  const query = folded(options.query || '');
  const terms = [...new Set(query.match(/[\p{L}\p{N}_.-]+/gu) || [])];
  const paths = (options.paths || []).map((item) => {
    const normalized = normalizePath(item);
    if (!normalized) fail('memory-query-path-invalid', `Expected repository-relative path: ${item}`);
    return normalized;
  });
  if (!terms.length && !paths.length) fail('memory-query-required', 'Use --query or --path.');
  const ranked = [];
  for (const record of corpus.records) {
    if (!options.history && (record.lifecycle === 'historical' || ['decision', 'decision-index'].includes(record.kind))) continue;
    const reasons = [];
    let score = 0;
    if (paths.some((item) => record.paths.some((scope) => overlaps(item, scope)))) {
      score += 100; reasons.push('path');
    }
    const title = folded(record.title);
    const aliases = folded(record.terms.join(' '));
    const body = folded(record.text);
    for (const term of terms) {
      if (title.includes(term)) score += 12;
      if (aliases.includes(term)) score += 16;
      if (body.includes(term)) score += 1;
    }
    if (query && aliases.includes(query)) score += 20;
    if (score) ranked.push({ record, score, reasons });
  }
  ranked.sort((a, b) => Number(b.reasons.includes('path')) - Number(a.reasons.includes('path'))
    || b.score - a.score || a.record.path.localeCompare(b.record.path) || a.record.line - b.record.line);
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 5;
  const maxChars = options.maxChars ?? 6000;
  const result = {
    revision: corpus.revision, total: ranked.length, offset, next_offset: null,
    global_count: corpus.records.filter((record) => record.always && record.lifecycle !== 'historical').length,
    matches: [],
  };
  for (const entry of ranked.slice(offset, offset + limit)) {
    const match = { ...pointer(entry.record), matched_by: entry.reasons.length ? entry.reasons : ['text'] };
    result.matches.push(match);
    result.next_offset = offset + result.matches.length < ranked.length ? offset + result.matches.length : null;
    if (JSON.stringify(result).length > maxChars) { result.matches.pop(); break; }
  }
  result.next_offset = offset + result.matches.length < ranked.length ? offset + result.matches.length : null;
  if (offset < ranked.length && !result.matches.length) fail('memory-output-budget', 'Increase --max-chars to fit a candidate pointer.');
  return result;
}

function receiptFor(record) {
  return `${record.id}=${hash(JSON.stringify([record.path, record.text, record.intro, record.links, record.confidence, record.lifecycle]))}`;
}

function read(corpus, options = {}) {
  if (options.revision && options.revision !== corpus.revision) fail('memory-changed', 'Memory changed after search; search again before using its IDs.');
  if (!options.ids?.length) fail('memory-id-required', 'Use --id from search, or --id @global to read only shared constraints.');
  const selected = new Map();
  function include(id) {
    const pending = [id];
    while (pending.length) {
      const next = pending.pop();
      if (selected.has(next)) continue;
      const record = corpus.byId.get(next);
      if (!record) fail('memory-id-not-found', `Unknown memory ID: ${next}`);
      selected.set(next, record);
      pending.push(...record.links.toReversed());
    }
  }
  for (const record of corpus.records) if (record.always && record.lifecycle !== 'historical') include(record.id);
  for (const id of options.ids) if (id !== '@global') include(id);
  const seen = new Set(options.seen || []);
  const records = [...selected.values()];
  const cursorPrefix = `${corpus.revision}:${hash(JSON.stringify([options.ids, [...seen].sort()])).slice(0, 16)}:`;
  let start = 0;
  if (options.cursor !== undefined) {
    if (typeof options.cursor !== 'string' || !options.cursor.startsWith(cursorPrefix)) fail('memory-cursor-stale', 'The memory or selection changed; restart this read from the current selection.');
    const position = options.cursor.slice(cursorPrefix.length);
    if (!/^\d+$/.test(position) || Number(position) >= records.length) fail('memory-cursor-invalid', 'Invalid read continuation.');
    start = Number(position);
  }
  const result = { revision: corpus.revision, complete: true, next_cursor: null, documents: [], reused: 0, omitted_count: 0, omitted: [] };
  const maxChars = options.maxChars ?? 12000;
  const omitted = [];
  for (let index = start; index < records.length; index++) {
    const record = records[index];
    const receipt = receiptFor(record);
    if (seen.has(receipt)) { result.reused += 1; continue; }
    let document = result.documents.find((item) => item.path === record.path);
    const addedDocument = !document;
    if (!document) {
      document = { path: record.path, intro: record.intro, sections: [] };
      result.documents.push(document);
    }
    document.sections.push({ id: record.id, receipt, line: record.line, confidence: record.confidence, lifecycle: record.lifecycle, text: record.text });
    // Reserve space for a bounded omission report instead of cutting a condition or exception.
    if (JSON.stringify(result).length + 1200 > maxChars) {
      document.sections.pop();
      if (addedDocument) result.documents.pop();
      result.next_cursor = `${cursorPrefix}${index}`;
      for (const remaining of records.slice(index)) {
        const receipt = receiptFor(remaining);
        if (!seen.has(receipt)) omitted.push({ id: remaining.id, path: remaining.path, line: remaining.line, chars: remaining.intro.length + remaining.text.length });
      }
      break;
    }
  }
  result.complete = omitted.length === 0;
  result.omitted_count = omitted.length;
  for (const item of omitted.slice(0, 5)) {
    result.omitted.push(item);
    if (JSON.stringify(result).length > maxChars) { result.omitted.pop(); break; }
  }
  if (JSON.stringify(result).length > maxChars) fail('memory-output-budget', 'Increase --max-chars to fit the response envelope.');
  return result;
}

function parseArgs(argv) {
  const [command, ...args] = argv;
  const options = { paths: [], ids: [], seen: [] };
  const names = { '--project-root': 'projectRoot', '--query': 'query', '--path': 'paths', '--id': 'ids', '--seen': 'seen', '--cursor': 'cursor', '--revision': 'revision', '--limit': 'limit', '--offset': 'offset', '--max-chars': 'maxChars' };
  const allowed = {
    search: new Set(['projectRoot', 'query', 'paths', 'limit', 'offset', 'maxChars']),
    read: new Set(['projectRoot', 'ids', 'seen', 'cursor', 'revision', 'maxChars']),
    check: new Set(['projectRoot']),
  };
  if (!allowed[command]) fail('memory-command-invalid', 'Usage: memory.js search|read|check --project-root DIR [--query TEXT] [--path PATH] [--id ID]');
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--history' && command === 'search' && !seen.has(flag)) {
      options.history = true; seen.add(flag); continue;
    }
    const name = names[flag];
    if (!name || !allowed[command].has(name)) fail('memory-argument-invalid', `Unknown option: ${flag}`);
    const value = args[++index];
    if (value === undefined || value.startsWith('--')) fail('memory-argument-invalid', `Missing value: ${flag}`);
    if (['paths', 'ids', 'seen'].includes(name)) { options[name].push(value); continue; }
    if (seen.has(flag)) fail('memory-argument-invalid', `Duplicate option: ${flag}`);
    seen.add(flag);
    if (['limit', 'offset', 'maxChars'].includes(name)) {
      const min = name === 'offset' ? 0 : name === 'limit' ? 1 : 1500;
      const max = name === 'limit' ? 50 : name === 'maxChars' ? 32000 : 1000000;
      if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) fail('memory-argument-invalid', `${flag} must be an integer from ${min} to ${max}`);
      options[name] = Number(value);
    } else options[name] = value;
  }
  if (!options.projectRoot?.trim()) fail('memory-project-required', 'Use --project-root DIR.');
  return { command, options };
}

function main(argv = process.argv.slice(2)) {
  try {
    const { command, options } = parseArgs(argv);
    const corpus = loadRecords(options.projectRoot);
    const result = command === 'search' ? search(corpus, options) : command === 'read' ? read(corpus, options) : {
      valid: true, documents: corpus.state.manifest.documents.length, records: corpus.records.length,
      source_bytes: corpus.sourceBytes, revision: corpus.revision,
    };
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: { code: error.code || 'memory-unavailable', message: error.message } })}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = { loadRecords, recordsFromSources, sections, search, read, receiptFor, parseArgs, MAX_CORPUS_BYTES };
