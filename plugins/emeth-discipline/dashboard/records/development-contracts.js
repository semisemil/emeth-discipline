'use strict';

const fs = require('node:fs');
const { migrateProject } = require('../../lib/storage-migration');
const path = require('node:path');
const roots = require('../../lib/document-roots.js');
const { parseCurrentRecord, DEVELOPMENT_ID, DESIGN_ID } = require('./record-parser.js');
const { readDesignDocuments, assertDocumentSetAvailable } = require('../../lib/design-documents.js');

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
function readDesigns(root, { includeErrors = false, requiredId } = {}) {
  migrateProject(root);
  const storage = roots.designStorage(root);
  const directory = storage.directory;
  const entries = fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }) : [];
  const filesById = new Map();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = /^(DESIGN-\d{4,})(?:-|$)/.exec(entry.name)?.[1];
    const file = path.join(directory, entry.name, 'DESIGN.md');
    if (!id || !fs.existsSync(file)) continue;
    if (!filesById.has(id)) filesById.set(id, []);
    filesById.get(id).push(file);
  }
  function readRecord(id, files) {
    try {
      if (files.length !== 1) fail('contract-unavailable', `Ambiguous document ID: ${id}`);
      return parseCurrentRecord({ root: storage.root, directory, filePath: files[0], expectedId: id, kind: 'design',
        relativePath: roots.designReference(root, files[0]) });
    } catch (error) {
      if (error.code === 'record-id-mismatch') error.message = 'Document ID does not match its directory';
      if (!includeErrors) throw error;
      return { id, error: { code: error.code || 'contract-unavailable', message: error.message } };
    }
  }
  if (requiredId && !filesById.has(requiredId)) fail('contract-unavailable', `Document not found: ${requiredId}`);
  const required = requiredId ? readRecord(requiredId, filesById.get(requiredId)) : null;
  return [...filesById].map(([id, files]) => id === requiredId ? required : readRecord(id, files));
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
function assertDesignWrite(root, metadata, relativePath) {
  const others = readDesigns(root).filter(record => {
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
module.exports = { readDevelopmentRecord, readDesigns, supersessionMap, assertDesignWrite, resolveContract };

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
