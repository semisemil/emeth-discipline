'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { migrateProject } = require('../../lib/storage-migration');
const path = require('node:path');
const roots = require('../../lib/document-roots.js');
const { parseCurrentRecord, DEVELOPMENT_ID, DESIGN_ID } = require('./record-parser.js');
const { readDesignDocuments, assertDocumentSetAvailable } = require('../../lib/design-documents.js');
const { markdownHeadings } = require('../../lib/markdown-section.js');

const FORMATS = {
  DESIGN: { kind: 'design', directory: 'designs', file: 'DESIGN.md' },
  SPEC: { kind: 'spec', directory: 'specs', file: 'SPEC.md' },
  PLAN: { kind: 'plan', directory: 'plan', file: 'PLAN.md' },
};
function fail(code, message) { throw Object.assign(new Error(message), { code }); }
function readDevelopmentRecord(root, id) {
  migrateProject(root);
  if (!DEVELOPMENT_ID.test(id)) fail('contract-id-invalid', 'Supply a Design or legacy document ID');
  const format = FORMATS[id.split('-')[0]];
  const storage = format.kind === 'design' ? roots.designStorage(root) : { root, directory: path.join(root, '.emeth', format.directory) };
  const directory = storage.directory;
  const entries = fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }) : [];
  const matches = entries.filter(entry => entry.isDirectory() && (entry.name === id || entry.name.startsWith(`${id}-`)))
    .map(entry => path.join(directory, entry.name, format.file)).filter(file => fs.existsSync(file));
  if (matches.length !== 1) fail('contract-unavailable', matches.length ? `Ambiguous document ID: ${id}` : `Document not found: ${id}`);
  try {
    return parseCurrentRecord({ root: storage.root, directory, filePath: matches[0], expectedId: id, kind: format.kind,
      relativePath: format.kind === 'design' ? roots.designReference(root, matches[0]) : path.relative(root, matches[0]).split(path.sep).join('/') });
  } catch (error) {
    if (error.code === 'record-id-mismatch') error.message = 'Document ID does not match its directory';
    throw error;
  }
}
function readDesigns(root, { includeErrors = false, requiredId, includeMissing = false, includeSource = false } = {}) {
  migrateProject(root);
  const storage = roots.designStorage(root);
  const directory = storage.directory;
  const entries = fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }) : [];
  const filesById = new Map();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = /^(DESIGN-\d{4,})(?:-|$)/.exec(entry.name)?.[1];
    const file = path.join(directory, entry.name, 'DESIGN.md');
    if (!id || !fs.existsSync(file) && !includeMissing) continue;
    if (!filesById.has(id)) filesById.set(id, []);
    filesById.get(id).push(file);
  }
  function readRecord(id, files) {
    try {
      if (files.length !== 1) fail('contract-unavailable', `Ambiguous document ID: ${id}`);
      return parseCurrentRecord({ root: storage.root, directory, filePath: files[0], expectedId: id, kind: 'design',
        includeSource,
        relativePath: roots.designReference(root, files[0]) });
    } catch (error) {
      if (error.code === 'record-id-mismatch') error.message = 'Document ID does not match its directory';
      if (!includeErrors) throw error;
      return { id, error: { code: error.code || 'contract-unavailable', message: error.message,
        ...(!fs.existsSync(files[0]) ? { document: 'DESIGN.md' } : {}) } };
    }
  }
  if (requiredId && !filesById.has(requiredId)) fail('contract-unavailable', `Document not found: ${requiredId}`);
  const required = requiredId ? readRecord(requiredId, filesById.get(requiredId)) : null;
  return [...filesById].map(([id, files]) => id === requiredId ? required : readRecord(id, files));
}
function searchDesigns(root, options = {}) {
  const { query, path: sourcePath, expected_revision: expectedRevision } = options;
  const includeSource = options.include_source;
  if (includeSource !== undefined && !['overview', 'documents'].includes(includeSource)) {
    fail('invalid-argument', '--include-source accepts overview or documents');
  }
  if (query === undefined && sourcePath === undefined
      || [query, sourcePath].some(value => value !== undefined && (typeof value !== 'string' || !value.trim()))) {
    fail('invalid-argument', 'Supply a nonempty --query or --path');
  }
  const integer = (value, fallback, minimum, maximum, name) => {
    if (value === undefined) return fallback;
    if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))
        || Number(value) < minimum || Number(value) > maximum) fail('invalid-argument', `${name} must be an integer from ${minimum} to ${maximum}`);
    return Number(value);
  };
  const limit = integer(options.limit, 10, 1, 100, '--limit');
  const offset = integer(options.offset, 0, 0, Number.MAX_SAFE_INTEGER, '--offset');
  if (expectedRevision !== undefined && !/^[a-f0-9]{64}$/i.test(expectedRevision)) fail('invalid-argument', 'Invalid expected revision');
  const terms = [...new Set(query?.toLowerCase().trim().split(/\s+/) || [])];
  const termMatches = new Map(terms.map(term => [term, 0]));
  const needle = sourcePath?.replace(/\\/g, '/').toLowerCase();
  const matchesText = text => terms.some(term => text.toLowerCase().includes(term))
    || needle !== undefined && text.replace(/\\/g, '/').toLowerCase().includes(needle);
  const records = readDesigns(root, { includeErrors: true, includeMissing: true, includeSource: true }).sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const diagnostics = [];
  let successors = new Map();
  try { successors = supersessionMap(records); }
  catch (error) { diagnostics.push({ code: error.code, message: error.message }); }
  const ids = new Set(records.filter(record => !record.error).map(record => record.id));
  for (const record of records.filter(record => !record.error)) {
    for (const previous of record.metadata.supersedes) {
      try {
        if (DESIGN_ID.test(previous)) {
          if (!ids.has(previous)) fail('contract-successor-missing', `Missing replaced Design: ${previous}`);
        } else readDevelopmentRecord(root, previous);
      } catch (error) { diagnostics.push({ id: record.id, code: error.code, message: error.message }); }
    }
    if (record.metadata.superseded_by !== null
        && (!ids.has(record.metadata.superseded_by) || successors.get(record.id) !== record.metadata.superseded_by)) {
      diagnostics.push({ id: record.id, code: 'contract-successor-missing', message: `Invalid successor declaration: ${record.metadata.superseded_by}` });
    }
  }
  const fingerprint = crypto.createHash('sha256');
  const configured = roots.designStorage(root).configured;
  const matches = [];
  for (const record of records) {
    if (record.error) {
      diagnostics.push({ id: record.id, ...record.error });
      fingerprint.update(JSON.stringify([record.id, record.error]));
      continue;
    }
    let sources;
    let documents;
    try {
      assertDocumentSetAvailable(record.source.filePath);
      documents = record.metadata.documents?.length ? readDesignDocuments(root, record) : [];
      sources = [{ document: 'DESIGN.md', text: record.source.text, body: record.body }, ...documents.map(document => ({
        document: path.posix.relative(path.posix.dirname(record.relativePath), document.path), text: document.body, body: document.body,
      }))];
    } catch (error) {
      diagnostics.push({ id: record.id, code: error.code || 'contract-unavailable', message: error.message,
        ...(error.document ? { document: error.document } : {}) });
      fingerprint.update(JSON.stringify([record.id, record.metadata, record.body, error.code, error.message]));
      continue;
    }
    fingerprint.update(JSON.stringify([record.id, record.relativePath, sources.map(source => [source.document, source.text])]));
    const corpus = [record.id, record.title, record.relativePath, ...sources.flatMap(source => [source.document, source.text])].join('\n').toLowerCase();
    for (const term of terms) if (corpus.includes(term)) termMatches.set(term, termMatches.get(term) + 1);
    if (!matchesText(corpus)) continue;
    const hits = [];
    let totalHits = 0;
    let matched = matchesText(`${record.id}\n${record.title}\n${record.relativePath}`);
    for (const source of sources) {
      matched ||= matchesText(source.document);
      const bodyStart = source.text.length - source.body.length;
      const headings = markdownHeadings(source.body);
      let position = 0;
      for (const [index, line] of source.text.split('\n').entries()) {
        if (matchesText(line)) {
          matched = true;
          totalHits++;
          if (hits.length < 3) {
            const selected = headings.findLast(heading => heading.start <= position - bodyStart);
            const section = selected && headings.filter(heading => heading.title === selected.title).length === 1 ? selected.title : undefined;
            const lowered = line.toLowerCase();
            const at = Math.min(...terms.map(term => lowered.indexOf(term)).filter(value => value >= 0),
              ...(needle === undefined ? [] : [line.replace(/\\/g, '/').toLowerCase().indexOf(needle)].filter(value => value >= 0)));
            hits.push({ document: source.document, line: index + 1, ...(section ? { section } : {}),
              excerpt: line.slice(Number.isFinite(at) ? Math.max(0, at - 50) : 0, Number.isFinite(at) ? Math.max(0, at - 50) + 240 : 240) });
          }
        }
        position += line.length + 1;
      }
    }
    if (matched) matches.push({ id: record.id, title: record.title, status: record.status, revision: record.revision,
      path: record.relativePath, ...(configured ? { absolute_path: record.source.filePath } : {}),
      related_issues: record.metadata.related_issues, superseded_by: successors.get(record.id) || record.metadata.superseded_by,
      hits, hits_truncated: totalHits > hits.length,
      ...(includeSource && matches.length >= offset && matches.length < offset + limit ? { source: {
        id: record.id, path: record.relativePath,
        ...(configured ? { absolute_path: record.source.filePath } : {}),
        text: record.source.text,
        ...(includeSource === 'documents' ? { documents } : {}),
      } } : {}) });
  }
  const sourceRevision = fingerprint.digest('hex');
  if (expectedRevision !== undefined && expectedRevision.toLowerCase() !== sourceRevision) fail('design-search-changed', 'Design sources changed; restart search from offset 0');
  const page = matches.slice(offset, offset + limit);
  return { matches: page, total: matches.length, offset, limit, has_more: offset + page.length < matches.length,
    term_matches: [...termMatches].map(([term, total]) => ({ term, total })),
    complete: diagnostics.length === 0, source_revision: sourceRevision, ...(diagnostics.length ? { diagnostics } : {}) };
}

function supersessionMap(records) {
  const next = new Map();
  for (const record of records) {
    if (record.kind !== 'design') continue;
    for (const previous of record.metadata.supersedes) {
      if (next.has(previous) && next.get(previous) !== record.id) fail('contract-successor-conflict', `Multiple Designs replace ${previous}`);
      next.set(previous, record.id);
    }
  }
  for (const origin of next.keys()) {
    const visited = new Set();
    for (let current = origin; next.has(current); current = next.get(current)) {
      if (visited.has(current)) fail('contract-successor-cycle', `Cyclic replacement involving ${origin}`);
      visited.add(current);
    }
  }
  return next;
}
function assertDesignWrite(root, metadata, relativePath, records = readDesigns(root)) {
  const others = records.filter(record => {
    if (record.id === metadata.id && record.relativePath !== relativePath) fail('contract-id-conflict', `Design ID already exists: ${metadata.id}`);
    return record.id !== metadata.id;
  });
  for (const id of metadata.supersedes) readDevelopmentRecord(root, id);
  const next = supersessionMap([...others, { kind: 'design', id: metadata.id, metadata }]);
  if (metadata.superseded_by !== null && next.get(metadata.id) !== metadata.superseded_by) {
    fail('contract-successor-missing', 'The replacing Design must declare this Design in supersedes');
  }
  return next;
}
function resolveContract(root, id) {
  if (!DESIGN_ID.test(id)) fail('contract-id-invalid', 'Supply a Design ID');
  const records = readDesigns(root, { requiredId: id });
  const record = records.find(record => record.id === id);
  const next = supersessionMap(records);
  if (next.has(id) || record.metadata.superseded_by) {
    fail('contract-superseded', `${id} is replaced by ${next.get(id) || record.metadata.superseded_by}`);
  }
  if (record.status !== 'ready') fail('contract-not-ready', 'Design must be ready');
  assertDocumentSetAvailable(record.source.filePath);
  return { ...record, documents: readDesignDocuments(root, record) };
}
module.exports = { readDevelopmentRecord, readDesigns, searchDesigns, supersessionMap, assertDesignWrite, resolveContract };

if (require.main === module) {
  try {
    const options = {};
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i += 2) {
      if (!['--project-root', '--id', '--format'].includes(args[i]) || Object.hasOwn(options, args[i]) || !args[i + 1]) fail('contract-argument-invalid', 'Supply --project-root and --id once, with optional --format full|paths');
      options[args[i]] = args[i + 1];
    }
    if (options['--format'] && !['full', 'paths'].includes(options['--format'])) fail('contract-argument-invalid', 'Use --format full|paths');
    const root = fs.realpathSync(options['--project-root']);
    const record = resolveContract(root, options['--id']);
    const pathsOnly = options['--format'] === 'paths';
    process.stdout.write(JSON.stringify({ id: record.id, title: record.title, path: record.relativePath,
      ...(pathsOnly || roots.designStorage(root).configured ? { absolute_path: record.source.filePath } : {}),
      revision: record.revision, status: record.status, metadata: record.metadata,
      ...(!pathsOnly ? { body: record.body } : {}),
      documents: pathsOnly ? record.documents.map((document, index) => ({ path: document.path,
        absolute_path: path.join(path.dirname(record.source.filePath), ...record.metadata.documents[index].split('/')) })) : record.documents,
      memory: require('../../lib/architecture-memory.js').connectionStatus(root) }) + '\n');
  } catch (error) { process.stderr.write(JSON.stringify({ error: { code: error.code || 'contract-unavailable', message: error.message } }) + '\n'); process.exitCode = 1; }
}
