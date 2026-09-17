'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseCurrentRecord, DEVELOPMENT_ID } = require('./record-parser.js');

const FORMATS = {
  DESIGN: { kind: 'design', directory: 'designs', file: 'DESIGN.md' },
  SPEC: { kind: 'spec', directory: 'specs', file: 'SPEC.md' },
  PLAN: { kind: 'plan', directory: 'plan', file: 'PLAN.md' },
};
function fail(code, message) { throw Object.assign(new Error(message), { code }); }
function readDevelopmentRecord(root, id) {
  if (!DEVELOPMENT_ID.test(id)) fail('contract-id-invalid', 'Supply a Design or legacy document ID');
  const format = FORMATS[id.split('-')[0]];
  const directory = path.join(root, '.proofline', format.directory);
  const entries = fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }) : [];
  const matches = entries.filter(entry => entry.isDirectory() && (entry.name === id || entry.name.startsWith(`${id}-`)))
    .map(entry => path.join(directory, entry.name, format.file)).filter(file => fs.existsSync(file));
  if (matches.length !== 1) fail('contract-unavailable', matches.length ? `Ambiguous document ID: ${id}` : `Document not found: ${id}`);
  try {
    return parseCurrentRecord({ root, directory, filePath: matches[0], expectedId: id, kind: format.kind,
      relativePath: path.relative(root, matches[0]).split(path.sep).join('/') });
  } catch (error) {
    if (error.code === 'record-id-mismatch') error.message = 'Document ID does not match its directory';
    throw error;
  }
}
function readDesigns(root) {
  const directory = path.join(root, '.proofline', 'designs');
  if (!fs.existsSync(directory)) return [];
  const ids = new Set(fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => /^(DESIGN-\d{4,})-/.exec(entry.name)?.[1]).filter(Boolean));
  return [...ids].map(id => readDevelopmentRecord(root, id));
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
  const record = readDevelopmentRecord(root, id);
  if (record.kind === 'plan') fail('contract-not-implementable', 'A legacy Plan needs a Design before implementation');
  const next = supersessionMap(readDesigns(root));
  if (next.has(id) || record.metadata.superseded_by) {
    fail('contract-superseded', `${id} is replaced by ${next.get(id) || record.metadata.superseded_by}`);
  }
  if (record.status !== 'ready') fail('contract-not-ready', 'Design or legacy Spec must be ready');
  return record;
}
module.exports = { readDevelopmentRecord, readDesigns, supersessionMap, assertDesignWrite, resolveContract };

if (require.main === module) {
  try {
    const options = {};
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i += 2) {
      if (!['--project-root', '--id'].includes(args[i]) || Object.hasOwn(options, args[i]) || !args[i + 1]) fail('contract-argument-invalid', 'Supply --project-root and --id once');
      options[args[i]] = args[i + 1];
    }
    const root = fs.realpathSync(options['--project-root']);
    const record = resolveContract(root, options['--id']);
    process.stdout.write(JSON.stringify({ id: record.id, title: record.title, path: record.relativePath,
      revision: record.revision, status: record.status, metadata: record.metadata, body: record.body,
      memory: require('../../lib/architecture-memory.js').connectionStatus(root) }) + '\n');
  } catch (error) { process.stderr.write(JSON.stringify({ error: { code: error.code || 'contract-unavailable', message: error.message } }) + '\n'); process.exitCode = 1; }
}
