'use strict';
// Deterministic I/O measurement, not a model execution or billed-usage benchmark.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const W = require('../../skills/architecture-memory/scripts/workflow.js');
const { notice } = require('../../lib/architecture-memory.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-workflow-benchmark-'));
const frames = [];
function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
}
function write(file, value) { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), value); }
function capture(segment, request, action) {
  const response = action();
  frames.push({ segment, request, response: JSON.stringify(response).split(root.replaceAll('\\', '\\\\')).join('<project>') });
  return response;
}
try {
  write('src/server.js', 'exports.store = "memory";\n');
  git('init', '-q'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Fixture'); git('add', '.'); git('commit', '-qm', 'baseline');
  const hookOptions = { dataRoot: path.join(root, '.hook-cache') };
  const event = { cwd: root, session_id: 'benchmark', hook_event_name: 'UserPromptSubmit' };
  const absent = Array.from({ length: 20 }, () => notice(event, hookOptions));
  assert.ok(absent.every((text) => text === ''));
  const begun = capture('init', 'workflow.js init --project-root <project> --language ko', () => W.begin(root, 'init', { language: 'ko' }));
  capture('init', 'workflow.js inventory --project-root <project>', () => W.inspect(root, 'inventory'));
  capture('init', 'workflow.js source --project-root <project> --path src/server.js', () => W.source(root, { path: 'src/server.js' }));
  for (const [id, , name] of W.BASE) { const file = path.join(begun.draft, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `# ${id}\n\n## Baseline\n<!-- am: {"id":"AM-${id}"} -->\n\n**confirmed/current**\n\nObserved in-memory storage at src/server.js.\n`); }
  capture('init', 'workflow.js apply --project-root <project>', () => W.apply(root));
  const notices = Array.from({ length: 20 }, () => notice(event, hookOptions));
  assert.equal(notices.filter(Boolean).length, 1);
  capture('current', 'workflow.js update --project-root <project>', () => W.begin(root, 'update'));
  for (let index = 0; index < 300; index++) write(`fixtures/row-${index}.txt`, 'Fixed test payload.\n');
  git('add', 'fixtures'); git('commit', '-qm', 'fixtures');
  capture('bulk', 'workflow.js update --project-root <project>', () => W.begin(root, 'update'));
  capture('bulk', 'workflow.js changes --project-root <project>', () => W.inspect(root, 'changes'));
  capture('bulk', 'workflow.js classify --project-root <project> --prefix fixtures/ --effect none --reason "Only fixed test payloads; no runtime effect."', () => W.classify(root, { prefix: 'fixtures/', effect: 'none', reason: 'Only fixed test payloads; no runtime effect.' }));
  capture('bulk', 'workflow.js apply --project-root <project>', () => W.apply(root));
  write('src/server.js', 'exports.store = "database";\n'); git('add', 'src'); git('commit', '-qm', 'database');
  const update = capture('update', 'workflow.js update --project-root <project>', () => W.begin(root, 'update'));
  capture('update', 'workflow.js changes --project-root <project>', () => W.inspect(root, 'changes'));
  capture('update', 'workflow.js source --project-root <project> --path src/server.js --diff', () => W.source(root, { path: 'src/server.js', diff: true }));
  capture('update', 'workflow.js classify --project-root <project> --path src/server.js --effect architecture --reason "Storage changed to database."', () => W.classify(root, { path: 'src/server.js', effect: 'architecture', reason: 'Storage changed to database.' }));
  fs.appendFileSync(path.join(update.draft, '02-containers.md'), '\nStorage now uses database.\n');
  capture('interruption', 'workflow.js apply --project-root <project>', () => {
    try { W.apply(root, {}, { afterWrite() { throw new Error('simulated interruption'); } }); }
    catch (error) { return { error: error.message }; }
    throw Error('Expected interruption');
  });
  const resume = capture('resume', 'workflow.js update --project-root <project>', () => W.begin(root, 'update'));
  assert.equal(resume.status, 'applying'); assert.equal(resume.pending_changes, 0);
  capture('resume', 'workflow.js apply --project-root <project>', () => W.apply(root));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/architecture/.architecture-memory/manifest.json')));
  assert.equal(manifest.git_checkpoint.revision, git('rev-parse', 'HEAD'));
  process.stdout.write(JSON.stringify({ frames, uninitialized_notices: absent, initialized_notices: notices }));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
