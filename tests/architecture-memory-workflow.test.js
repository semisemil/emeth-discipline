'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const W = require('../plugins/emeth-discipline/skills/architecture-memory/scripts/workflow.js');
const S = require('../plugins/emeth-discipline/skills/architecture-memory/scripts/storage.js');
const { loadRecords } = require('../plugins/emeth-discipline/skills/architecture-memory/scripts/memory.js');
const { connectionStatus, notice } = require('../plugins/emeth-discipline/lib/architecture-memory.js');

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

test('the session notice reports commits made after the Memory Git checkpoint', (t) => {
  const f = fixture(t);
  const dataRoot = path.join(f.root, '.test-hook-data');
  const event = { cwd: f.root, session_id: 's1', hook_event_name: 'SessionStart', source: 'startup' };
  initialize(f);
  assert.doesNotMatch(notice(event, { dataRoot }), /architecture-memory-update/);
  f.write('src/server.js', 'const store = "database";\n');
  f.git('add', 'src/server.js'); f.git('commit', '-qm', 'database');
  assert.match(notice(event, { dataRoot }), /architecture-memory-update/);
});
