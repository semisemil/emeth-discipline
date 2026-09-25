'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const W = require('../skills/architecture-memory/scripts/workflow.js');
const S = require('../skills/architecture-memory/scripts/storage.js');
const { loadRecords } = require('../skills/architecture-memory/scripts/memory.js');
const { notice } = require('../lib/architecture-memory.js');

function fixture(t, gitEnabled = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-memory-workflow-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  function git(...args) {
    const run = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
    assert.equal(run.status, 0, run.stderr);
    return run.stdout.trim();
  }
  function write(file, content) { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), content); }
  write('src/server.js', 'const store = "memory";\n');
  if (gitEnabled) {
    git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Fixture');
    git('add', '.'); git('commit', '-qm', 'baseline');
  }
  const manifest = () => JSON.parse(fs.readFileSync(path.join(root, 'docs/architecture/.architecture-memory/manifest.json'), 'utf8'));
  return { root, git, write, manifest };
}
function fill(begin, transform = (text) => text) {
  for (const [id, , file] of W.BASE) {
    const target = path.join(begin.draft, file);
    if (!fs.existsSync(target)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, transform(`# ${id}\n\n## ${id}\n<!-- am: {"id":"AM-${id}"} -->\n\n**confirmed/current**\n\nObserved baseline from the captured source.\n`));
    }
  }
}
function initialize(f) { const begun = W.begin(f.root, 'init', { language: 'ko' }); fill(begun); W.apply(f.root); return begun; }

test('init freezes committed evidence while preserving uncommitted code and publishes readiness last', (t) => {
  const f = fixture(t);
  const head = f.git('rev-parse', 'HEAD');
  f.write('src/server.js', 'const store = "uncommitted-database";\n');
  const begun = W.begin(f.root, 'init', { language: 'ko' });
  assert.equal(fs.existsSync(path.join(f.root, S.BINDING)), false);
  assert.equal(fs.existsSync(path.join(f.root, 'docs/architecture/.architecture-memory/manifest.json')), false);
  const evidence = W.source(f.root, { path: 'src/server.js' });
  assert.match(evidence.text, /"memory"/);
  assert.doesNotMatch(evidence.text, /uncommitted/);
  assert.equal(evidence.source_revision, head);
  assert.throws(() => W.apply(f.root), { code: 'memory-baseline-incomplete' });
  assert.equal(fs.existsSync(path.join(f.root, S.BINDING)), false);
  fill(begun);
  assert.equal(W.apply(f.root).status, 'applied');
  assert.equal(f.manifest().git_checkpoint.revision, head);
  assert.equal(S.binding(f.root).root, 'docs/architecture');
  assert.match(fs.readFileSync(path.join(f.root, 'src/server.js'), 'utf8'), /uncommitted-database/);
});

test('repeated init resumes its draft and repairs an incomplete existing baseline', (t) => {
  const f = fixture(t);
  let begun = W.begin(f.root, 'init', { language: 'ko' });
  fill(begun);
  const originalDraft = fs.readFileSync(path.join(begun.draft, '04-context.md'), 'utf8');
  assert.equal(W.begin(f.root, 'init').draft, begun.draft);
  assert.equal(fs.readFileSync(path.join(begun.draft, '04-context.md'), 'utf8'), originalDraft);
  W.apply(f.root);
  fs.unlinkSync(path.join(f.root, 'docs/architecture/02-containers.md'));
  begun = W.begin(f.root, 'init');
  assert.equal(begun.connection_only, false);
  assert.throws(() => W.apply(f.root), { code: 'memory-baseline-incomplete' });
  fill(begun);
  W.apply(f.root);
  assert.equal(loadRecords(f.root).state.manifest.documents.length, 5);
});

test('no-commit init detects source drift and later update seeds the first committed snapshot', (t) => {
  const f = fixture(t, false);
  const begun = W.begin(f.root, 'init');
  W.source(f.root, { path: 'src/server.js' });
  fill(begun);
  f.write('src/server.js', 'const store = "changed";\n');
  assert.throws(() => W.apply(f.root), { code: 'memory-source-changed' });
  f.write('src/server.js', 'const store = "memory";\n');
  W.apply(f.root);
  assert.equal(f.manifest().git_checkpoint.revision, null);
  f.git('init', '-q'); f.git('config', 'user.email', 'test@example.invalid'); f.git('config', 'user.name', 'Fixture');
  f.git('add', 'src'); f.git('commit', '-qm', 'first source commit');
  const update = W.begin(f.root, 'update');
  assert.equal(update.pending_changes, 1);
  W.classify(f.root, { prefix: 'src/', effect: 'none', reason: 'The baseline already records this unchanged source.' });
  W.apply(f.root);
  assert.equal(f.manifest().git_checkpoint.revision, f.git('rev-parse', 'HEAD'));
});

test('update uses captured commits despite dirty code; classifications survive retry', (t) => {
  const f = fixture(t);
  initialize(f);
  f.write('src/server.js', 'const store = "database";\n');
  f.git('add', 'src'); f.git('commit', '-qm', 'persistent storage');
  const head = f.git('rev-parse', 'HEAD');
  f.write('src/server.js', 'const store = "experimental";\n');
  const begun = W.begin(f.root, 'update');
  assert.match(W.source(f.root, { path: 'src/server.js', diff: true }).text, /database/);
  assert.doesNotMatch(W.source(f.root, { path: 'src/server.js' }).text, /experimental/);
  assert.throws(() => W.apply(f.root), { code: 'memory-unclassified' });
  W.classify(f.root, { path: 'src/server.js', effect: 'architecture', reason: 'Storage unit changed; update containers.' });
  assert.equal(W.begin(f.root, 'update').pending_changes, 0);
  fs.appendFileSync(path.join(begun.draft, '02-containers.md'), '\nStorage is now a database.\n');
  W.apply(f.root);
  assert.equal(f.manifest().git_checkpoint.revision, head);
  assert.match(fs.readFileSync(path.join(f.root, 'src/server.js'), 'utf8'), /experimental/);
});

test('partial publication resumes without reclassification and preserves the old checkpoint until its write', (t) => {
  const f = fixture(t);
  initialize(f);
  const base = f.manifest().git_checkpoint.revision;
  f.write('src/server.js', 'const store = "database";\n'); f.git('add', 'src'); f.git('commit', '-qm', 'changed');
  const begun = W.begin(f.root, 'update');
  W.classify(f.root, { prefix: 'src/', effect: 'architecture', reason: 'New store.' });
  fs.appendFileSync(path.join(begun.draft, '02-containers.md'), '\nNew storage.\n');
  fs.appendFileSync(path.join(begun.draft, '04-context.md'), '\nNew operating implication.\n');
  assert.throws(() => W.apply(f.root, {}, { afterWrite() { throw new Error('simulated interruption'); } }), /simulated interruption/);
  assert.equal(f.manifest().git_checkpoint.revision, base);
  assert.throws(() => loadRecords(f.root), { code: 'memory-applying' });
  assert.equal(W.begin(f.root, 'update').status, 'applying');
  assert.equal(W.apply(f.root).status, 'applied');
  assert.equal(f.manifest().git_checkpoint.revision, f.git('rev-parse', 'HEAD'));
  assert.match(fs.readFileSync(path.join(f.root, 'docs/architecture/04-context.md'), 'utf8'), /New operating implication/);
});

test('foreign edits are preserved both before publication and during interrupted work', (t) => {
  const f = fixture(t);
  initialize(f);
  f.write('src/server.js', 'const store = "new";\n'); f.git('add', 'src'); f.git('commit', '-qm', 'changed');
  const begun = W.begin(f.root, 'update');
  W.classify(f.root, { prefix: 'src/', effect: 'architecture', reason: 'Changed.' });
  const live = path.join(f.root, 'docs/architecture/04-context.md');
  const before = fs.readFileSync(live, 'utf8');
  fs.appendFileSync(path.join(begun.draft, '04-context.md'), '\nPrepared context.\n');
  fs.appendFileSync(live, '\nConcurrent user edit.\n');
  assert.throws(() => W.apply(f.root), { code: 'memory-target-changed' });
  assert.match(fs.readFileSync(live, 'utf8'), /Concurrent user edit/);
  fs.writeFileSync(live, before);
  assert.throws(() => W.apply(f.root, {}, { afterWrite() { throw new Error('interrupted'); } }), /interrupted/);
  fs.appendFileSync(live, '\nLater user edit.\n');
  assert.throws(() => W.apply(f.root), { code: 'memory-target-changed' });
  assert.match(fs.readFileSync(live, 'utf8'), /Later user edit/);
});

test('same commit and document-only commits return without drafting or advancing checkpoints', (t) => {
  const f = fixture(t);
  initialize(f);
  const checkpoint = f.manifest().git_checkpoint.revision;
  assert.equal(W.begin(f.root, 'update').status, 'current');
  f.git('add', 'docs/architecture', S.BINDING); f.git('commit', '-qm', 'memory only');
  assert.equal(W.begin(f.root, 'update').status, 'ignored');
  assert.equal(f.manifest().git_checkpoint.revision, checkpoint);
});

test('rename paths, non-ancestor comparisons and no-document effects are classified without inventing history', (t) => {
  const f = fixture(t);
  initialize(f);
  const base = f.git('rev-parse', 'HEAD');
  f.git('checkout', '-qb', 'alternate');
  f.git('mv', 'src/server.js', 'src/runtime.js'); f.git('commit', '-qm', 'rename');
  let begun = W.begin(f.root, 'update');
  assert.deepEqual(W.inspect(f.root, 'changes').items[0].paths, ['src/server.js', 'src/runtime.js']);
  W.classify(f.root, { prefix: 'src/', effect: 'none', reason: 'Only a filename moved; no registered routing references the old path.' });
  W.apply(f.root);
  f.git('checkout', '-qb', 'other', base);
  f.write('src/server.js', 'const store = "other branch";\n'); f.git('add', 'src'); f.git('commit', '-qm', 'other branch');
  begun = W.begin(f.root, 'update');
  assert.equal(begun.status, 'draft');
  W.classify(f.root, { prefix: 'src/', effect: 'architecture', reason: 'Snapshot boundaries differ.' });
  fs.appendFileSync(path.join(begun.draft, '02-containers.md'), '\nOther branch store.\n');
  W.apply(f.root);
  assert.equal(f.manifest().git_checkpoint.revision, f.git('rev-parse', 'HEAD'));
});

test('unmanaged collections require init; completed init refreshes only the binding and old owned pointer', (t) => {
  const f = fixture(t);
  initialize(f);
  const manifest = f.manifest(); manifest.managed = false;
  f.write('docs/architecture/.architecture-memory/manifest.json', JSON.stringify(manifest));
  f.write('AGENTS.md', 'Keep JavaScript.\n<!-- architecture-memory:start -->\nC:/old-plugin-cache/SKILL.md\n<!-- architecture-memory:end -->\nKeep tests.\n');
  assert.throws(() => W.begin(f.root, 'update'), { code: 'memory-not-initialized' });
  const begun = W.begin(f.root, 'init');
  assert.equal(begun.connection_only, true);
  W.apply(f.root);
  assert.equal(f.manifest().managed, true);
  assert.equal(fs.readFileSync(path.join(f.root, 'AGENTS.md'), 'utf8'), 'Keep JavaScript.\nKeep tests.\n');
  assert.doesNotMatch(fs.readFileSync(path.join(f.root, S.BINDING), 'utf8'), /old-plugin|Users|SKILL/);
});

test('hook emits nothing before init, resolves the current plugin and suppresses repeat notices', (t) => {
  const f = fixture(t);
  const dataRoot = path.join(f.root, '.test-hook-data');
  const event = { cwd: f.root, session_id: 's1', hook_event_name: 'UserPromptSubmit' };
  assert.equal(notice(event, { dataRoot }), '');
  assert.equal(fs.existsSync(dataRoot), false);
  initialize(f);
  const first = notice(event, { dataRoot });
  assert.match(first, /skills.*architecture-memory.*SKILL.md/);
  assert.equal(notice(event, { dataRoot }), '');
  assert.match(notice({ ...event, hook_event_name: 'SessionStart', source: 'compact' }, { dataRoot }), /SKILL.md/);
  assert.match(notice({ ...event, hook_event_name: 'SubagentStart', agent_id: 'a1' }, { dataRoot }), /SKILL.md/);
  const changedPlugin = path.join(f.root, '.test-plugin');
  f.write('.test-plugin/skills/architecture-memory/SKILL.md', 'Current plugin.');
  assert.ok(notice(event, { dataRoot, pluginRoot: changedPlugin }).includes(JSON.stringify(changedPlugin).slice(1, -1)));
  const manifest = f.manifest(); manifest.managed = false;
  f.write('docs/architecture/.architecture-memory/manifest.json', JSON.stringify(manifest));
  assert.match(notice(event, { dataRoot }), /disabled/);
  assert.equal(notice(event, { dataRoot }), '');
});

test('inventory and source output are bounded; bulk classification does not echo thousands of paths', (t) => {
  const f = fixture(t);
  initialize(f);
  for (let i = 0; i < 300; i++) f.write(`assets/data-${i}.txt`, 'irrelevant fixture data\n');
  f.git('add', 'assets'); f.git('commit', '-qm', 'assets');
  W.begin(f.root, 'update');
  const page = W.inspect(f.root, 'changes');
  assert.equal(page.total, 300); assert.ok(page.next_offset); assert.ok(JSON.stringify(page).length < 6000);
  const classification = W.classify(f.root, { prefix: 'assets/', effect: 'none', reason: 'Only fixture payloads; source boundaries unchanged.' });
  assert.equal(classification.classified, 300); assert.ok(JSON.stringify(classification).length < 100);
  W.apply(f.root);
});

test('path boundaries, unregistered drafts and malformed inputs fail without replacing live documents', (t) => {
  const f = fixture(t);
  assert.throws(() => W.begin(f.root, 'init', { root: '../escape' }), { code: 'memory-path-invalid' });
  f.write('docs/manual/README.md', 'Existing manual.');
  assert.throws(() => W.begin(f.root, 'init', { root: 'docs/manual' }), { code: 'memory-root-conflict' });
  assert.equal(fs.existsSync(path.join(f.root, 'docs/manual/.architecture-memory')), false);
  const begun = W.begin(f.root, 'init'); fill(begun);
  const metadata = path.join(begun.draft, '.architecture-memory/manifest.json');
  const malformed = JSON.parse(fs.readFileSync(metadata)); malformed.documents[0].path = '../escape.md';
  fs.writeFileSync(metadata, JSON.stringify(malformed));
  assert.throws(() => W.apply(f.root), { code: 'architecture-manifest-invalid' });
  assert.equal(fs.existsSync(path.join(f.root, S.BINDING)), false);
  assert.throws(() => W.parseArgs(['source', '--project-root', f.root, '--limit', '9999']), { code: 'memory-argument-invalid' });
});

test('init interruption before manifest creation resumes through the public init command', (t) => {
  const f = fixture(t);
  const begun = W.begin(f.root, 'init'); fill(begun);
  assert.throws(() => W.apply(f.root, {}, { afterWrite() { throw new Error('interrupted'); } }), /interrupted/);
  assert.equal(fs.existsSync(path.join(f.root, S.BINDING)), false);
  assert.equal(W.begin(f.root, 'init').status, 'applying');
  W.apply(f.root);
  assert.equal(W.begin(f.root, 'init').connection_only, true);
  W.apply(f.root);
  assert.equal(W.inspect(f.root, 'status').next, 'done');
  const ignored = f.git('status', '--porcelain', '--untracked-files=all');
  assert.doesNotMatch(ignored, /work\/draft|work\/state|work\/lock/);
});

test('metadata-only baseline is not ready; captured HEAD remains authoritative after a new commit', (t) => {
  const f = fixture(t);
  const begun = W.begin(f.root, 'init');
  const head = begun.source_revision;
  fill(begun, (text) => text.replace('Observed baseline from the captured source.', ''));
  assert.throws(() => W.apply(f.root), { code: 'memory-baseline-incomplete' });
  for (const [, , file] of W.BASE) fs.appendFileSync(path.join(begun.draft, file), '\nBaseline evidence.\n');
  f.write('src/server.js', 'const store = "new commit";\n'); f.git('add', 'src'); f.git('commit', '-qm', 'later commit');
  assert.equal(W.source(f.root, { path: 'src/server.js' }).source_revision, head);
  assert.match(W.source(f.root, { path: 'src/server.js' }).text, /"memory"/);
  W.apply(f.root);
  assert.equal(f.manifest().git_checkpoint.revision, head);
  assert.equal(W.begin(f.root, 'update').pending_changes, 1);
});

test('uncommitted evidence can be refreshed without discarding its draft', (t) => {
  const f = fixture(t, false);
  const begun = W.begin(f.root, 'init'); fill(begun);
  W.source(f.root, { path: 'src/server.js' });
  f.write('src/server.js', 'const store = "new evidence";\n');
  assert.throws(() => W.source(f.root, { path: 'src/server.js' }), { code: 'memory-source-changed' });
  assert.match(W.source(f.root, { path: 'src/server.js', refresh: true }).text, /new evidence/);
  f.write('src/new.js', 'New responsibility.');
  assert.throws(() => W.apply(f.root), { code: 'memory-source-changed' });
  W.inspect(f.root, 'inventory', { refresh: true });
  W.source(f.root, { path: 'src/new.js' });
  fs.appendFileSync(path.join(begun.draft, '02-containers.md'), '\nReconciled new evidence and responsibility.\n');
  W.apply(f.root);
  assert.equal(f.manifest().git_checkpoint.revision, null);
});

test('external edits to unchanged draft dependencies prevent publication', (t) => {
  const f = fixture(t); initialize(f);
  f.write('src/server.js', 'const store = "new";\n'); f.git('add', 'src'); f.git('commit', '-qm', 'new');
  const begun = W.begin(f.root, 'update');
  W.classify(f.root, { prefix: 'src/', effect: 'architecture', reason: 'New store.' });
  fs.appendFileSync(path.join(begun.draft, '02-containers.md'), '\nChanged storage.\n');
  const live = path.join(f.root, 'docs/architecture/04-context.md');
  const before = fs.readFileSync(live, 'utf8');
  fs.appendFileSync(live, '\nNew constraint from another task.\n');
  assert.throws(() => W.apply(f.root), { code: 'memory-target-changed' });
  fs.writeFileSync(live, before);
  assert.throws(() => W.apply(f.root, {}, { afterWrite() { throw new Error('interrupted'); } }), /interrupted/);
  fs.appendFileSync(live, '\nNew constraint from another task.\n');
  assert.throws(() => W.apply(f.root), { code: 'memory-target-changed' });
  assert.match(fs.readFileSync(live, 'utf8'), /another task/);
});

test('invalid durable states fail closed and reject unsafe journal targets before further writes', (t) => {
  const f = fixture(t);
  const begun = W.begin(f.root, 'init'); fill(begun);
  const stateFile = path.join(f.root, 'docs/architecture', S.WORK, 'state.json');
  const original = JSON.parse(fs.readFileSync(stateFile));
  for (const change of [{ phase: 'unknown' }, { observations: [] }, { snapshot: { ...original.snapshot, revision: '--output=foreign' } }, { root: 'docs/other' }]) {
    fs.writeFileSync(stateFile, JSON.stringify({ ...original, ...change }));
    assert.throws(() => W.apply(f.root), { code: 'memory-state-invalid' });
  }
  fs.writeFileSync(stateFile, JSON.stringify(original));
  assert.throws(() => W.apply(f.root, {}, { afterWrite() { throw new Error('interrupted'); } }), /interrupted/);
  const pending = JSON.parse(fs.readFileSync(stateFile));
  pending.entries.push({ file: 'src/server.js', before: null, after: 'unwanted', after_hash: S.hash('unwanted') });
  fs.writeFileSync(stateFile, JSON.stringify(pending));
  assert.throws(() => W.apply(f.root), { code: 'memory-state-invalid' });
  assert.match(fs.readFileSync(path.join(f.root, 'src/server.js'), 'utf8'), /"memory"/);
  assert.equal(fs.existsSync(path.join(f.root, 'docs/architecture/02-containers.md')), false);
});

test('registered hook CLI emits bounded valid context and stays empty without a binding', (t) => {
  const f = fixture(t);
  const plugin = path.resolve(__dirname, '..');
  const hook = path.join(plugin, 'hooks/run.js');
  const config = JSON.parse(fs.readFileSync(path.join(plugin, 'hooks/hooks.json')));
  for (const event of ['SessionStart', 'SubagentStart', 'UserPromptSubmit']) {
    assert.ok(config.hooks[event].some((group) => group.hooks.some((command) => command.command.includes('/hooks/run.js'))));
  }
  const run = () => spawnSync(process.execPath, [hook], { input: JSON.stringify({ cwd: f.root, session_id: 'cli', hook_event_name: 'UserPromptSubmit' }), encoding: 'utf8', env: { ...process.env, PLUGIN_DATA: path.join(f.root, '.test-hook') } });
  assert.equal(run().stdout, '');
  initialize(f);
  const result = run();
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.ok(result.stdout.length < 1000);
  assert.equal(run().stdout, '');
});

test('committed source CLI reads run concurrently without a write lock or retries', async (t) => {
  const f = fixture(t);
  const begun = W.begin(f.root, 'init');
  const cli = path.resolve(__dirname, '../skills/architecture-memory/scripts/workflow.js');
  const execute = promisify(execFile);
  const results = await Promise.all(Array.from({ length: 4 }, () => execute(process.execPath, [cli, 'source', '--project-root', f.root, '--path', 'src/server.js'], { windowsHide: true })));
  for (const result of results) {
    assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).source_revision, begun.source_revision);
    assert.match(JSON.parse(result.stdout).text, /"memory"/);
  }
});
