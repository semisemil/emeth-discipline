#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const S = require('./storage.js');
const { loadArchitecture, parseManifest, readArchitectureDocument } = require('../../../dashboard/architecture.js');
const { recordsFromSources, receiptFor, sections } = require('./memory.js');
const MANIFEST = '.architecture-memory/manifest.json';
const JOURNAL = `${S.WORK}/record.json`;
const JOURNAL_LIMIT = 128 * 1024 * 1024;
const INITIAL_CONTEXT = '# Project context\n\nThis memory covers recorded topics only. The codebase has not been surveyed.\n';

function publish(directory, entries) {
  const file = S.safePath(directory, JOURNAL);
  let journal = S.jsonFile(file, JOURNAL_LIMIT);
  if (!journal) {
    journal = { entries: entries.filter(entry => S.hash(entry.after) !== entry.before) };
    if (!journal.entries.length) return false;
  }
  if (!Array.isArray(journal.entries) || Buffer.byteLength(JSON.stringify(journal, null, 2)) >= JOURNAL_LIMIT) S.fail('memory-journal-invalid', 'Invalid or oversized record publication journal');
  const targets = new Set();
  for (const entry of journal.entries) {
    if (!entry || typeof entry.path !== 'string' || targets.has(entry.path.toLowerCase())
        || !(entry.before === null || typeof entry.before === 'string' && /^[0-9a-f]{64}$/.test(entry.before))
        || typeof entry.after !== 'string' || entry.path !== MANIFEST && (!entry.path.endsWith('.md') || entry.path.startsWith('.architecture-memory/'))
        || Buffer.byteLength(entry.after) > (entry.path === MANIFEST ? 256 * 1024 : 2 * 1024 * 1024)) {
      S.fail('memory-journal-invalid', 'Invalid record publication target');
    }
    targets.add(entry.path.toLowerCase());
    const target = S.safePath(directory, entry.path);
    const current = S.hash(S.textFile(target));
    if (current !== entry.before && current !== S.hash(entry.after)) S.fail('memory-target-changed', `Concurrent edit preserved: ${entry.path}`);
  }
  if (!fs.existsSync(file)) S.saveJson(file, journal);
  for (const entry of journal.entries) {
    const target = S.safePath(directory, entry.path);
    const current = S.hash(S.textFile(target));
    if (current !== entry.before && current !== S.hash(entry.after)) S.fail('memory-target-changed', `Concurrent edit preserved: ${entry.path}`);
    if (current !== S.hash(entry.after)) S.atomicWrite(target, entry.after);
  }
  fs.unlinkSync(file);
  return true;
}

function ensureMemory(project, options = {}) {
  project = fs.realpathSync(project);
  const binding = S.binding(project);
  if (binding?.enabled === false) return { status: 'disabled' };
  let existing;
  try { existing = loadArchitecture({ root: project }, { allowDisabled: true }); }
  catch (error) { if (error.code !== 'architecture-not-found') throw error; }
  if (existing && !existing.manifest.managed) return { status: 'disabled' };
  const root = binding?.root || (existing && path.relative(project, existing.architectureRoot).split(path.sep).join('/')) || 'docs/architecture';
  const directory = S.safePath(project, root);
  if (existing && path.resolve(directory) !== path.resolve(existing.architectureRoot)) S.fail('memory-root-conflict', 'Memory registration and connection disagree');
  if (!existing && fs.existsSync(directory) && fs.readdirSync(directory).some(name => name !== '.architecture-memory')) {
    if (!fs.existsSync(S.safePath(directory, JOURNAL))) S.fail('memory-root-conflict', 'Preserve existing unregistered architecture documents');
  }
  fs.mkdirSync(directory, { recursive: true });
  return S.exclusive(directory, () => {
    const pending = S.jsonFile(S.safePath(directory, `${S.WORK}/state.json`), 128 * 1024 * 1024);
    if (pending && pending.phase !== 'applied') S.fail('memory-work-pending', 'Finish the pending memory operation before connecting');
    const journal = S.jsonFile(S.safePath(directory, JOURNAL), JOURNAL_LIMIT);
    if (journal) publish(directory, []);
    let manifest = S.jsonFile(S.safePath(directory, MANIFEST), 256 * 1024);
    if (manifest && !parseManifest(JSON.stringify(manifest), { allowDisabled: true }).managed) return { status: 'disabled' };
    const created = !manifest;
    if (!manifest) {
      const language = Intl.getCanonicalLocales(options.language || 'en')[0];
      manifest = { schema_version: 2, managed: true, language,
        git_checkpoint: { revision: null, branch_at_check: null, checked_at: null },
        documents: [{ id: 'context', kind: 'context', path: '04-context.md', order: 0, verified_at: null, source_revision: null }] };
      publish(directory, [
        { path: '04-context.md', before: null, after: language.startsWith('ko') ? '# 프로젝트 맥락\n\n기록한 주제만 포함한다. 코드베이스 전체를 분석한 상태는 아니다.\n' : INITIAL_CONTEXT },
        { path: MANIFEST, before: null, after: JSON.stringify(manifest, null, 2) + '\n' },
      ]);
    }
    // Connection is published last; no source inventory or Git baseline is implied.
    if (!binding) S.saveJson(S.safePath(project, S.BINDING), { schema_version: 1, root });
    return { status: created ? 'created' : 'current', root };
  });
}

function preparePatch(state, sources, options, payload) {
  const directory = state.architectureRoot;
  const project = state.projectRoot;
  const corpus = recordsFromSources(state, new Map([...sources].map(([file, body]) => [file, body ?? ''])));
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) S.fail('memory-patch-invalid', 'Supply a patch object');
  if (payload.documents && (payload.edits || payload.intro || options.document || options.path || options.kind)) S.fail('memory-patch-invalid', 'Use either documents or a single-document patch');
  const patches = payload.documents || [{ ...options, ...payload }];
  if (!Array.isArray(patches) || !patches.length) S.fail('memory-patch-invalid', 'Supply nonempty documents');
  const documents = new Set();
  const touched = new Set();
  const entries = [];
  for (const item of patches) {
    if (!item || typeof item.document !== 'string' || documents.has(item.document)) S.fail('memory-patch-invalid', 'Each document needs a unique ID');
    documents.add(item.document);
    let document = state.manifest.documents.find(doc => doc.id === item.document);
    if (!document) {
      if (!item.path || !item.kind) S.fail('memory-document-required', 'A new document needs path and kind');
      document = { id: item.document, path: item.path, kind: item.kind, order: state.manifest.documents.length * 10, verified_at: null, source_revision: null };
      state.manifest.documents.push(document);
      parseManifest(JSON.stringify(state.manifest));
      if (S.textFile(S.safePath(directory, document.path)) !== null) S.fail('memory-target-exists', 'Preserve the existing unregistered file');
    } else if (item.path && item.path !== document.path || item.kind && item.kind !== document.kind) S.fail('memory-patch-invalid', 'Patch does not move or reclassify an existing document');
    if (!Array.isArray(item.edits) || (!item.edits.length && !item.intro)) S.fail('memory-patch-invalid', 'Supply edits or an intro change');
    const before = sources.get(document.path) ?? null;
    let after = before || '';
    for (const edit of item.edits) {
      if (!edit || typeof edit.id !== 'string' || touched.has(edit.id) || (edit.text !== null && typeof edit.text !== 'string')) S.fail('memory-patch-invalid', 'Each edit needs a unique id and text or null');
      if (edit.text !== null && (!/^## /u.test(edit.text.trim()) || sections(edit.text.trim()).sections.length !== 1)) S.fail('memory-patch-invalid', 'Each replacement contains one routed level-2 section');
      touched.add(edit.id);
      const record = corpus.byId.get(edit.id);
      if (record) {
        const recordPath = path.relative(project, path.join(directory, document.path)).split(path.sep).join('/');
        if (record.path !== recordPath || edit.expected !== receiptFor(record)) S.fail('memory-record-changed', `Read the current record before editing: ${edit.id}`);
        after = after.replace(record.text, () => edit.text?.trim() || '');
      } else {
        if (edit.expected !== null || edit.text === null) S.fail('memory-record-changed', `Record is absent: ${edit.id}`);
        after = `${after.trimEnd()}\n\n${edit.text.trim()}\n`.trimStart();
      }
    }
    if (item.intro) {
      const parsed = sections(before || '');
      const intro = before === null ? null : parsed.intro || (parsed.sections.length === 1 && !/^## /u.test(parsed.sections[0].text) ? before.trim() : '');
      if (item.intro.before !== intro) S.fail('memory-record-changed', `Read the current document introduction: ${document.id}`);
      const replacement = item.intro.after;
      if (typeof replacement !== 'string' || sections(`${replacement.trim()}\n\n## sentinel\n`).intro !== replacement.trim()
          || replacement.includes('<!-- am:')) S.fail('memory-patch-invalid', 'Introduction must precede routed sections');
      after = intro ? after.replace(intro, () => replacement.trim()) : `${replacement.trim()}\n\n${after.trimStart()}`;
    }
    if (Buffer.byteLength(after) > 2 * 1024 * 1024) S.fail('memory-file-invalid', 'Document exceeds 2 MiB');
    sources.set(document.path, after);
    entries.push({ path: document.path, before: S.hash(before), after });
  }
  const next = recordsFromSources(state, new Map([...sources].map(([file, body]) => [file, body ?? ''])));
  for (const item of patches) for (const edit of item.edits) {
    if (edit.replacement_id && (corpus.byId.get(edit.id)?.stable !== false || corpus.byId.has(edit.replacement_id))) S.fail('memory-patch-invalid', 'Only unannotated sections can receive a new routed ID.');
    if (edit.text === null ? next.byId.has(edit.id) : next.byId.get(edit.replacement_id || edit.id)?.text !== edit.text.trim()) S.fail('memory-patch-invalid', `Replacement must retain its routed ID: ${edit.id}`);
  }
  return { entries, documents: [...documents], ids: [...touched] };
}

function patch(project, options, payload) {
  const binding = S.binding(project);
  if (!binding || binding.enabled === false) S.fail('memory-disabled', 'Memory is not connected');
  const directory = S.safePath(project, binding.root);
  return S.exclusive(directory, () => {
    const pending = S.jsonFile(S.safePath(directory, `${S.WORK}/state.json`), 128 * 1024 * 1024);
    if (pending && pending.phase !== 'applied') S.fail('memory-work-pending', 'Patch the operation draft while init/update is pending');
    if (S.jsonFile(S.safePath(directory, JOURNAL), JOURNAL_LIMIT)) publish(directory, []);
    const state = loadArchitecture({ root: project });
    const manifestBefore = S.textFile(S.safePath(directory, MANIFEST), 256 * 1024);
    const sources = new Map(state.manifest.documents.map(doc => [doc.path, readArchitectureDocument(state, doc.id).content]));
    const prepared = preparePatch(state, sources, options, payload);
    const changed = publish(directory, [
      ...prepared.entries,
      { path: MANIFEST, before: S.hash(manifestBefore), after: JSON.stringify(state.manifest, null, 2) + '\n' },
    ]);
    return { status: changed ? 'updated' : 'no-op', documents: prepared.documents, ids: prepared.ids };
  });
}
function main() {
  try {
    const [command, ...args] = process.argv.slice(2);
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i].replace(/^--/, '');
      if (!args[i].startsWith('--') || !['project-root', 'document', 'path', 'kind', 'language'].includes(key) || Object.hasOwn(options, key) || !args[i + 1]) S.fail('memory-argument-invalid', 'Supply each supported option once');
      options[key] = args[i + 1];
    }
    const project = fs.realpathSync(options['project-root']);
    const result = command === 'ensure' ? ensureMemory(project, options) : command === 'patch'
      ? patch(project, options, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(0)))) : S.fail('memory-command-invalid', 'Use ensure or patch');
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) { process.stderr.write(JSON.stringify({ error: { code: error.code || 'memory-record-failed', message: error.message } }) + '\n'); process.exitCode = 1; }
}
if (require.main === module) main();
module.exports = { ensureMemory, patch, preparePatch, publish };
