#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseManifest, loadArchitecture, readArchitectureDocument } = require('../../../dashboard/architecture.js');
const { recordsFromSources } = require('./memory.js');
const S = require('./storage.js');
const BASE = [
  ['architecture-index', 'index', 'README.md'], ['system-context', 'system-context', '01-system-context.md'],
  ['containers', 'containers', '02-containers.md'], ['context', 'context', '04-context.md'],
  ['decision-index', 'decision-index', 'decisions/README.md'],
];
const MANIFEST = '.architecture-memory/manifest.json';
const MAX_OUTPUT = 12000;

function git(project, args, optional = false) {
  const result = spawnSync('git', ['--no-pager', ...args], { cwd: project, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  if (result.status !== 0 || result.error) {
    if (optional) return null;
    S.fail('memory-git-failed', (result.error?.message || result.stderr || 'Git failed').trim().slice(0, 1200));
  }
  return result.stdout;
}
function snapshot(project) {
  const head = git(project, ['rev-parse', '--verify', 'HEAD^{commit}'], true)?.trim() || null;
  return { revision: head, branch_at_check: head ? git(project, ['symbolic-ref', '--quiet', '--short', 'HEAD'], true)?.trim() || null : null,
    checked_at: head ? new Date().toISOString() : null };
}
function paths(project, revision, root) {
  let names;
  if (revision) names = git(project, ['ls-tree', '-r', '--name-only', '-z', revision]).split('\0').filter(Boolean);
  else {
    names = [];
    const queue = [''];
    while (queue.length) {
      const directory = queue.pop();
      for (const entry of fs.readdirSync(directory ? S.safePath(project, directory) : project, { withFileTypes: true })) {
        const name = directory ? `${directory}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink() || ['.git', 'node_modules', 'vendor', 'dist', 'build', '.cache'].includes(entry.name) || owned(name, root)) continue;
        if (entry.isDirectory()) queue.push(name);
        else if (entry.isFile()) names.push(name);
        if (names.length + queue.length > 100000) S.fail('memory-inventory-limit', 'Inventory exceeds 100,000 entries; use a narrower project root.');
      }
    }
  }
  return names.filter((name) => !owned(name, root)).sort();
}
function owned(name, root) { return name === S.BINDING || name === root || name.startsWith(`${root}/`); }
function delta(project, base, revision, root) {
  if (!base) return null;
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(base)) S.fail('memory-checkpoint-invalid', 'Checkpoint must be a full commit ID.');
  git(project, ['cat-file', '-e', `${base}^{commit}`]);
  const fields = git(project, ['diff', '--name-status', '-z', '--find-renames', base, revision, '--', '.']).split('\0');
  const changes = [];
  for (let index = 0; index < fields.length && fields[index];) {
    const status = fields[index++];
    const names = [fields[index++]];
    if (/^[RC]/.test(status)) names.push(fields[index++]);
    if (names.some((name) => typeof name !== 'string' || !name)) S.fail('memory-diff-invalid', 'Incomplete Git path record.');
    if (!names.every((name) => owned(name, root))) changes.push({ status, paths: names });
  }
  return changes;
}
function locate(project, requested) {
  const linked = S.binding(project);
  let existing = null;
  try { existing = loadArchitecture({ root: project }, { allowDisabled: true }); }
  catch (error) { if (error.code !== 'architecture-not-found') throw error; }
  const found = existing ? path.relative(project, existing.architectureRoot).split(path.sep).join('/') : null;
  const root = requested || linked?.root || found || 'docs/architecture';
  if (!S.relative(root).startsWith('docs/')) S.fail('memory-root-invalid', 'Memory root must be under docs/.');
  if ((found && root !== found) || (linked && root !== linked.root)) S.fail('memory-root-conflict', 'Existing memory belongs to another root.');
  return { root, directory: S.safePath(project, root), existing };
}
function statePath(directory) { return S.safePath(directory, `${S.WORK}/state.json`); }
function loadState(directory) {
  const state = S.jsonFile(statePath(directory), 128 * 1024 * 1024);
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const digest = (value) => value === null || typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
  const revision = (value) => value === null || typeof value === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value);
  if (!state || state.schema_version !== 1 || !['init', 'update'].includes(state.mode)
      || !['draft', 'applying', 'applied'].includes(state.phase) || !Array.isArray(state.inventory)
      || !Array.isArray(state.changes) || !object(state.before) || !object(state.snapshot)
      || !object(state.classifications) || !object(state.observations) || !revision(state.snapshot.revision)
      || !revision(state.base) || typeof state.root !== 'string'
      || !Object.values(state.before).every(digest) || !Object.values(state.observations).every(digest)
      || !state.changes.every((change) => object(change) && typeof change.status === 'string' && Array.isArray(change.paths) && change.paths.length >= 1 && change.paths.length <= 2)
      || !Object.values(state.classifications).every((item) => object(item) && ['none', 'architecture'].includes(item.effect) && typeof item.reason === 'string')) {
    S.fail('memory-state-invalid', 'Missing or invalid work state; do not treat it as a fresh operation.');
  }
  for (const name of [state.root, ...state.inventory, ...state.changes.flatMap((change) => change.paths), ...Object.keys(state.before), ...Object.keys(state.observations), ...Object.keys(state.classifications)]) S.relative(name);
  if (!state.root.startsWith('docs/')) S.fail('memory-state-invalid', 'Invalid memory root in work state.');
  try { parseManifest(JSON.stringify({ ...skeleton('en'), git_checkpoint: state.snapshot })); }
  catch { S.fail('memory-state-invalid', 'Invalid captured checkpoint metadata.'); }
  if (state.phase !== 'draft' && (!Array.isArray(state.entries) || !state.entries.every((entry) => object(entry)
      && typeof entry.file === 'string' && (entry.after === null || typeof entry.after === 'string')
      && digest(entry.before) && digest(entry.after_hash)))) S.fail('memory-state-invalid', 'Invalid publication journal.');
  return state;
}
function saveState(directory, state) { S.saveJson(statePath(directory), state); }
function draftDirectory(directory) { return S.safePath(directory, `${S.WORK}/draft`); }
function skeleton(language) {
  return { schema_version: 2, managed: true, language,
    git_checkpoint: { revision: null, branch_at_check: null, checked_at: null },
    documents: BASE.map(([id, kind, file], index) => ({ id, kind, path: file, order: index * 10, verified_at: null, source_revision: null })) };
}
function baseline(manifest, sources) {
  const missing = BASE.filter(([, kind]) => !manifest.documents.some((document) => document.kind === kind
    && sources.get(document.path)?.replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^#+[^\n]*(?:\n|$)/gm, '').replace(/^\*\*(confirmed|inferred|proposed|unknown)\/(current|planned|historical)\*\*\s*$/gm, '').trim()));
  if (missing.length) S.fail('memory-baseline-incomplete', `Missing nonempty baseline documents: ${missing.map(([, kind]) => kind).join(', ')}`);
}
function candidate(project, directory, requireBaseline = true) {
  const draft = draftDirectory(directory);
  if (S.jsonFile(S.safePath(draft, `${S.WORK}/record.json`), 128 * 1024 * 1024)) S.fail('memory-record-pending', 'Resume author.js recover before applying the draft.');
  const manifest = parseManifest(S.textFile(S.safePath(draft, MANIFEST), 256 * 1024) || '');
  const sources = new Map(manifest.documents.map((document) => [document.path, S.textFile(S.safePath(draft, document.path))]));
  if (requireBaseline) baseline(manifest, sources);
  const corpus = recordsFromSources({ projectRoot: project, architectureRoot: directory, manifest }, sources);
  return { manifest, sources, corpus };
}
function report(state, directory) {
  const pending = state.changes.filter((change) => !change.paths.every((name) => state.classifications[name]));
  return { status: state.phase, mode: state.mode, root: state.root, connection_only: state.connection_only || false, source_revision: state.snapshot.revision, checkpoint: state.base,
    inventory_count: state.inventory.length, pending_changes: pending.length,
    draft: draftDirectory(directory), next: state.phase === 'applied' ? 'done' : state.phase === 'applying' || state.connection_only ? 'apply' : state.mode === 'update' ? 'changes / classify / apply' : 'inventory / source / apply' };
}
function begin(project, mode, options = {}) {
  const found = locate(project, options.root);
  if (mode === 'update' && (!found.existing || !found.existing.manifest.managed || S.binding(project)?.enabled === false)) S.fail('memory-not-initialized', 'Memory must be connected and enabled before Git reconciliation.');
  if (!found.existing && fs.existsSync(found.directory) && !fs.existsSync(statePath(found.directory))
      && fs.readdirSync(found.directory).some((name) => name !== '.architecture-memory')) {
    S.fail('memory-root-conflict', 'Existing documents are not managed; choose an empty --root or establish an integration scope.');
  }
  if (!fs.existsSync(found.directory)) fs.mkdirSync(found.directory, { recursive: true });
  return S.exclusive(found.directory, () => {
    if (S.jsonFile(S.safePath(found.directory, `${S.WORK}/record.json`), 128 * 1024 * 1024)) S.fail('memory-record-pending', 'Resume record.js ensure before starting init/update');
    const old = fs.existsSync(statePath(found.directory)) ? loadState(found.directory) : null;
    if (old && old.root !== found.root) S.fail('memory-state-invalid', 'Work root does not match the selected memory.');
    if (old && old.phase !== 'applied') {
      if (old.mode !== mode) S.fail('memory-work-pending', `Resume pending ${old.mode} work before ${mode}.`);
      return report(old, found.directory);
    }
    if (!found.existing) {
      const conflicting = fs.readdirSync(found.directory).filter((name) => name !== '.architecture-memory');
      if (conflicting.length) S.fail('memory-root-conflict', 'Existing documents are not managed; choose an empty --root or establish an integration scope.');
    }
    const snap = snapshot(project);
    const original = found.existing?.manifest || null;
    const base = original?.git_checkpoint.revision || null;
    if (mode === 'update' && !snap.revision) S.fail('memory-no-commit', 'Git reconciliation requires a committed HEAD.');
    let changes = mode === 'update' ? delta(project, base, snap.revision, found.root) : [];
    if (mode === 'update' && base && changes.length === 0) return { status: base === snap.revision ? 'current' : 'ignored', checkpoint: base };
    const inventory = paths(project, snap.revision, found.root);
    if (changes === null) changes = inventory.map((name) => ({ status: 'seed', paths: [name] }));
    const state = { schema_version: 1, mode, phase: 'draft', snapshot: snap, base, root: found.root,
      inventory, changes, classifications: {}, observations: {}, before: {}, entries: null };
    const draft = draftDirectory(found.directory);
    // The resolved, non-symlink work directory is owned by the completed operation.
    if (fs.existsSync(draft)) fs.rmSync(draft, { recursive: true });
    fs.mkdirSync(draft, { recursive: true });
    const manifest = original ? structuredClone(original) : skeleton(options.language || 'en');
    manifest.managed = true;
    if (mode === 'init') {
      for (const [id, kind, file] of BASE) if (!manifest.documents.some((document) => document.kind === kind)) {
        if (manifest.documents.some((document) => document.id === id || document.path === file)) S.fail('memory-baseline-conflict', `Cannot assign missing ${kind}; existing ID or path is occupied.`);
        manifest.documents.push({ id, kind, path: file, order: manifest.documents.length * 10, verified_at: null, source_revision: null });
      }
    }
    for (const document of original?.documents || []) {
      const target = S.safePath(found.directory, document.path);
      const source = mode === 'init' && !fs.existsSync(target) ? null : readArchitectureDocument(found.existing, document.id).content;
      state.before[`${found.root}/${document.path}`] = S.hash(source);
      if (source !== null) S.atomicWrite(S.safePath(draft, document.path), source);
    }
    state.before[`${found.root}/${MANIFEST}`] = S.hash(S.textFile(S.safePath(found.directory, MANIFEST), 256 * 1024));
    for (const file of state.mode === 'init' ? [S.BINDING, 'AGENTS.md'] : [S.BINDING]) state.before[file] = S.hash(S.textFile(S.safePath(project, file)));
    S.saveJson(S.safePath(draft, MANIFEST), manifest);
    saveState(found.directory, state);
    // An already complete baseline needs only a connection refresh; preserve its original source checkpoint.
    if (mode === 'init' && original) {
      try { candidate(project, found.directory); state.connection_only = true; state.snapshot = original.git_checkpoint; saveState(found.directory, state); }
      catch (error) { if (error.code !== 'memory-baseline-incomplete' && error.code !== 'memory-document-missing') throw error; }
    }
    return report(state, found.directory);
  });
}
function groups(names) {
  const counts = new Map();
  for (const name of names) { const group = name.includes('/') ? name.split('/')[0] + '/' : '(root files)'; counts.set(group, (counts.get(group) || 0) + 1); }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([prefix, count]) => ({ prefix, count }));
}
function page(items, options = {}) {
  const offset = options.offset || 0;
  const limit = options.limit || 30;
  const result = { total: items.length, offset, next_offset: null, items: [] };
  for (const item of items.slice(offset, offset + limit)) {
    result.items.push(item);
    if (JSON.stringify(result).length > 5000) { result.items.pop(); break; }
  }
  result.next_offset = offset + result.items.length < items.length ? offset + result.items.length : null;
  if (!result.items.length && result.next_offset !== null) S.fail('memory-output-budget', 'One path record exceeds the output budget.');
  return result;
}
function work(project, options) {
  const found = locate(project, options.root);
  const state = loadState(found.directory);
  if (state.root !== found.root) S.fail('memory-state-invalid', 'Work root does not match the selected memory.');
  return { ...found, state };
}
function inspect(project, command, options = {}) {
  const { directory, state } = work(project, options);
  if (command === 'status') return report(state, directory);
  if (command === 'inventory') {
    if (options.refresh) return S.exclusive(directory, () => {
      const current = loadState(directory);
      if (current.phase !== 'draft' || current.snapshot.revision) S.fail('memory-phase-invalid', 'Refresh only an uncommitted draft inventory.');
      current.inventory = paths(project, null, current.root);
      for (const name of Object.keys(current.observations)) if (!current.inventory.includes(name)) delete current.observations[name];
      saveState(directory, current);
      return { total: current.inventory.length, groups: groups(current.inventory), next: 'Review added/deleted source responsibilities in the draft.' };
    });
    const names = state.inventory.filter((name) => !options.prefix || name.startsWith(options.prefix));
    return options.prefix || options.offset !== undefined ? page(names, options) : { total: names.length, groups: groups(names), next: 'inventory --prefix <directory/> or --offset 0' };
  }
  const changes = state.changes.filter((change) => !change.paths.every((name) => state.classifications[name]))
    .filter((change) => !options.prefix || change.paths.some((name) => name.startsWith(options.prefix)));
  return { ...page(changes, options), groups: groups(changes.flatMap((change) => change.paths)) };
}
function classify(project, options) {
  const found = work(project, options);
  return S.exclusive(found.directory, () => {
    const state = loadState(found.directory);
    if (state.phase !== 'draft') S.fail('memory-phase-invalid', 'Classify only draft work.');
    if (!['none', 'architecture'].includes(options.effect) || !options.reason?.trim() || options.reason.length > 600
        || (!options.path && !options.prefix)) S.fail('memory-classification-invalid', 'Use --path or --prefix, --effect none|architecture and a short --reason.');
    const names = [...new Set(state.changes.flatMap((change) => change.paths))].filter((name) => options.path ? name === options.path : name.startsWith(options.prefix));
    if (!names.length) S.fail('memory-path-not-in-range', 'No changed paths match this classification.');
    for (const name of names) state.classifications[name] = { effect: options.effect, reason: options.reason.trim() };
    saveState(found.directory, state);
    return { classified: names.length, remaining: state.changes.filter((change) => !change.paths.every((name) => state.classifications[name])).length };
  });
}
function source(project, options) {
  const found = work(project, options);
  const readSource = () => {
    const state = loadState(found.directory);
    if (state.phase !== 'draft') S.fail('memory-phase-invalid', 'Read evidence while preparing the draft.');
    if (options.refresh && (state.snapshot.revision || options.diff)) S.fail('memory-phase-invalid', 'Refresh only uncommitted source evidence.');
    const name = S.relative(options.path);
    const allowed = state.inventory.includes(name) || state.changes.some((change) => change.paths.includes(name));
    if (!allowed) S.fail('memory-path-not-in-range', 'Path is outside this captured inventory or change range.');
    let text;
    if (options.diff) {
      if (!state.base || !state.snapshot.revision) S.fail('memory-diff-unavailable', 'No committed comparison base.');
      text = git(project, ['diff', '--no-ext-diff', '--no-textconv', '--unified=3', state.base, state.snapshot.revision, '--', name]);
    } else if (state.snapshot.revision) {
      if (!state.inventory.includes(name)) S.fail('memory-source-deleted', 'Path is deleted at the captured revision; use --diff.');
      text = git(project, ['show', `${state.snapshot.revision}:${name}`]);
    } else {
      text = S.textFile(S.safePath(project, name));
      if (text === null) S.fail('memory-source-missing', 'Source file disappeared.');
      const existing = state.observations[name];
      if (existing && existing !== S.hash(text) && !options.refresh) S.fail('memory-source-changed', 'A previously read source changed; use source --refresh and reconcile its draft claims.');
      state.observations[name] = S.hash(text);
      saveState(found.directory, state);
    }
    const lines = text.split('\n');
    const offset = options.offset || 0;
    const limit = options.limit || 80;
    let body = '';
    let end = offset;
    while (end < lines.length && end < offset + limit && body.length + lines[end].length + 1 <= 8000) body += lines[end++] + '\n';
    if (end === offset && end < lines.length) S.fail('memory-line-too-large', 'This line exceeds 8,000 characters; use a purpose-built extractor for this exact source.');
    return { path: name, source_revision: state.snapshot.revision, first_line: offset + 1, total_lines: lines.length,
      next_offset: end < lines.length ? end : null, text: body };
  };
  return found.state.snapshot.revision ? readSource() : S.exclusive(found.directory, readSource);
}
function prepareEntries(project, found, state) {
  if (state.mode === 'update' && state.changes.some((change) => !change.paths.every((name) => state.classifications[name]))) {
    S.fail('memory-unclassified', 'Classify the remaining changed paths before applying.');
  }
  if (!state.snapshot.revision && !state.connection_only) {
    const current = paths(project, null, found.root);
    if (JSON.stringify(current) !== JSON.stringify(state.inventory)) S.fail('memory-source-changed', 'Uncommitted inventory changed during initialization.');
    for (const [name, hash] of Object.entries(state.observations)) if (S.hash(S.textFile(S.safePath(project, name))) !== hash) S.fail('memory-source-changed', `Changed source: ${name}`);
  }
  const result = candidate(project, found.directory, state.mode === 'init');
  if (state.connection_only) result.manifest.git_checkpoint = found.existing.manifest.git_checkpoint;
  else result.manifest.git_checkpoint = state.snapshot;
  const files = [...result.sources].map(([name, body]) => [`${found.root}/${name}`, body]);
  // Deletion is explicit: remove a registration and its draft file together.
  for (const file of Object.keys(state.before)) {
    if (file.startsWith(`${found.root}/`) && file !== `${found.root}/${MANIFEST}` && !files.some(([name]) => name === file)) {
      const local = file.slice(found.root.length + 1);
      if (fs.existsSync(S.safePath(draftDirectory(found.directory), local))) S.fail('memory-deletion-ambiguous', `Remove the unregistered draft file to confirm deletion: ${local}`);
      files.push([file, null]);
    }
  }
  files.push([`${found.root}/${MANIFEST}`, JSON.stringify(result.manifest, null, 2) + '\n']);
  if (state.mode === 'init') {
    const instructions = S.textFile(S.safePath(project, 'AGENTS.md'));
    if (instructions !== null) {
      const starts = instructions.split('<!-- architecture-memory:start -->').length - 1;
      const ends = instructions.split('<!-- architecture-memory:end -->').length - 1;
      if (starts !== ends || starts > 1) S.fail('memory-pointer-invalid', 'Existing memory instruction block is ambiguous.');
      if (starts === 1) files.push(['AGENTS.md', instructions.replace(/<!-- architecture-memory:start -->[\s\S]*?<!-- architecture-memory:end -->\r?\n?/, '')]);
    }
    files.push([S.BINDING, JSON.stringify({ schema_version: 1, root: found.root }, null, 2) + '\n']);
  }
  return files.map(([file, after]) => ({ file, before: state.before[file] ?? null, after, after_hash: S.hash(after) }))
    .filter((entry) => entry.before !== entry.after_hash);
}
function apply(project, options = {}, testOptions = {}) {
  const found = work(project, options);
  return S.exclusive(found.directory, () => {
    const state = loadState(found.directory);
    if (state.phase === 'applied') return report(state, found.directory);
    if (state.phase === 'draft') {
      state.entries = prepareEntries(project, found, state);
      // Check all before-images before publishing even the first document.
      for (const [name, before] of Object.entries(state.before)) if (S.hash(S.textFile(S.safePath(project, name))) !== before) S.fail('memory-target-changed', `Target changed since begin: ${name}`);
      for (const entry of state.entries) if (S.hash(S.textFile(S.safePath(project, entry.file))) !== entry.before) S.fail('memory-target-changed', `Target changed since begin: ${entry.file}`);
      state.phase = 'applying'; saveState(found.directory, state);
    }
    if (!Array.isArray(state.entries)) S.fail('memory-state-invalid', 'Applying work has no publication journal.');
    const targets = new Set();
    for (const entry of state.entries) {
      if ((!entry.file.startsWith(`${found.root}/`) && ![S.BINDING, 'AGENTS.md'].includes(entry.file))
          || entry.file.startsWith(`${found.root}/.architecture-memory/`) && entry.file !== `${found.root}/${MANIFEST}`
          || S.hash(entry.after) !== entry.after_hash || targets.has(entry.file)) S.fail('memory-state-invalid', 'Invalid journal target or content.');
      S.safePath(project, entry.file);
      targets.add(entry.file);
      if (entry.file === `${found.root}/${MANIFEST}`) parseManifest(entry.after);
    }
    for (const [name, before] of Object.entries(state.before)) {
      if (!state.entries.some((entry) => entry.file === name) && S.hash(S.textFile(S.safePath(project, name))) !== before) S.fail('memory-target-changed', `Unchanged dependency was edited externally: ${name}`);
    }
    let written = 0;
    for (const entry of state.entries) {
      const file = S.safePath(project, entry.file);
      const currentText = S.textFile(file);
      const current = S.hash(currentText);
      if (current === entry.after_hash) continue;
      if (current !== entry.before) S.fail('memory-target-changed', `External edit preserved; resume only after resolving: ${entry.file}`);
      if (entry.file === 'AGENTS.md' && entry.after !== currentText?.replace(/<!-- architecture-memory:start -->[\s\S]*?<!-- architecture-memory:end -->\r?\n?/, '')) S.fail('memory-state-invalid', 'AGENTS changes may only remove the old memory pointer.');
      if (entry.file === S.BINDING && entry.after !== JSON.stringify({ schema_version: 1, root: found.root }, null, 2) + '\n') S.fail('memory-state-invalid', 'Invalid project connection journal.');
      if (entry.after === null) fs.unlinkSync(file); else S.atomicWrite(file, entry.after);
      written += 1;
      if (testOptions.afterWrite) testOptions.afterWrite(entry.file, written);
    }
    for (const entry of state.entries) if (S.hash(S.textFile(S.safePath(project, entry.file))) !== entry.after_hash) S.fail('memory-target-changed', `Target changed during publication: ${entry.file}`);
    state.phase = 'applied'; saveState(found.directory, state);
    return { status: 'applied', changed_files: state.entries.length, checkpoint: state.snapshot.revision,
      binding: state.mode === 'init' ? S.BINDING : undefined };
  });
}
function parseArgs(args) {
  const [command, ...rest] = args;
  const allowed = {
    init: ['project-root', 'root', 'language'], update: ['project-root', 'root'], status: ['project-root', 'root'],
    inventory: ['project-root', 'root', 'prefix', 'offset', 'limit', 'refresh'], changes: ['project-root', 'root', 'prefix', 'offset', 'limit'],
    source: ['project-root', 'root', 'path', 'offset', 'limit', 'diff', 'refresh'],
    classify: ['project-root', 'root', 'path', 'prefix', 'effect', 'reason'], apply: ['project-root', 'root'],
  };
  if (!allowed[command]) S.fail('memory-command-invalid', 'Commands: init, update, status, inventory, changes, source, classify, apply.');
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index].replace(/^--/, '');
    if (rest[index] !== `--${key}` || !allowed[command].includes(key) || Object.hasOwn(options, key)) S.fail('memory-argument-invalid', `Invalid or duplicate option: ${rest[index]}`);
    if (key === 'diff' || key === 'refresh') { options[key] = true; continue; }
    const value = rest[++index];
    if (value === undefined || value.startsWith('--')) S.fail('memory-argument-invalid', `Missing --${key} value.`);
    if (['offset', 'limit'].includes(key)) {
      if (!/^\d+$/.test(value) || Number(value) < (key === 'limit' ? 1 : 0) || Number(value) > (key === 'limit' ? 200 : 1000000)) S.fail('memory-argument-invalid', `Invalid --${key}.`);
      options[key] = Number(value);
    } else options[key] = value;
  }
  if (!options['project-root']?.trim()) S.fail('memory-project-required', 'Use --project-root.');
  return { command, options, project: fs.realpathSync(options['project-root']) };
}
function main(args = process.argv.slice(2)) {
  try {
    const { command, options, project } = parseArgs(args);
    let result;
    if (['init', 'update'].includes(command)) result = begin(project, command, options);
    else if (command === 'apply') result = apply(project, options);
    else if (command === 'classify') result = classify(project, options);
    else if (command === 'source') result = source(project, options);
    else result = inspect(project, command, options);
    const output = JSON.stringify(result);
    if (output.length > MAX_OUTPUT) S.fail('memory-output-budget', 'Narrow the requested page; output exceeds 12,000 characters.');
    process.stdout.write(output + '\n');
  } catch (error) {
    process.stderr.write(JSON.stringify({ error: { code: error.code || 'memory-work-failed', message: error.message } }) + '\n');
    process.exitCode = 1;
  }
}
if (require.main === module) main();
module.exports = { begin, inspect, classify, source, apply, parseArgs, candidate, baseline, BASE, MANIFEST, locate, loadState, draftDirectory };
