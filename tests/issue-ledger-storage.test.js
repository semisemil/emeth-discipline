'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const test = require('node:test');

const plugin = path.resolve(__dirname, '../plugins/emeth-discipline');
const cli = path.join(plugin, 'skills/issue-ledger/scripts/issue-ledger.js');

function fixture(t) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-issue-storage-'));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const root = path.join(project, '.emeth/issues');
  fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, 'PL-0001.json');
  const template = fs.readFileSync(path.join(plugin, 'skills/issue-ledger/assets/templates/issue-objective.json'), 'utf8');
  const issue = JSON.parse(template.replace(/REPLACE: [^"]*/g, '저장 계약 검증'));
  issue.identity.id = 'PL-0001';
  issue.created_at = issue.updated_at = '2026-11-02T00:00:00.000Z';
  fs.writeFileSync(file, JSON.stringify(issue, null, 2) + '\n');
  const release = path.join(project, 'release');
  const hook = path.join(project, 'filesystem.cjs');
  fs.writeFileSync(hook, `
const fs = require('node:fs');
const read = fs.readFileSync.bind(fs);
const write = fs.writeFileSync.bind(fs);
const path = require('node:path');
fs.writeFileSync = function(file, ...args) {
  if (process.env.ISSUE_DISK_FULL && typeof file === 'string' &&
      path.dirname(file) === path.dirname(process.env.ISSUE_FILE)) {
    throw Object.assign(new Error('ENOSPC: record store is full'), { code: 'ENOSPC' });
  }
  return write(file, ...args);
};
let paused = false;
function signal(message) { process.send(message); process.disconnect(); }
fs.readFileSync = function(file, ...args) {
  const value = read(file, ...args);
  if (process.env.ISSUE_SIGNAL_INPUT && file === 0) signal('input-read');
  if (process.env.ISSUE_PAUSE_READ && file === process.env.ISSUE_FILE && !paused) {
    paused = true;
    signal('issue-read');
    const deadline = Date.now() + 8000;
    while (!fs.existsSync(process.env.ISSUE_RELEASE)) {
      if (Date.now() > deadline) throw new Error('Test did not release the Issue reader');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  return value;
};
`);
  const env = { ...process.env, APPDATA: path.join(project, '.config'),
    XDG_CONFIG_HOME: path.join(project, '.config'), CODEX_HOME: path.join(project, '.codex'),
    ISSUE_FILE: file, ISSUE_RELEASE: release };
  const args = command => ['--require', hook, cli, ...command, '--root', root, '--project-root', project];
  const update = ['update', 'PL-0001', '--input-format', 'brief', '--operation', '-'];
  function run(command, input, extra = {}) {
    return spawnSync(process.execPath, args(command), { env: { ...env, ...extra }, windowsHide: true,
      encoding: 'utf8', input: input === undefined ? undefined : JSON.stringify(input) });
  }
  function start(command, input, extra) {
    const child = spawn(process.execPath, args(command), { env: { ...env, ...extra }, windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
    t.after(() => { if (child.exitCode === null) child.kill(); });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.stdin.on('error', () => {});
    const done = new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', status => resolve({ status, stdout, stderr }));
    });
    const signal = new Promise((resolve, reject) => {
      child.once('message', resolve);
      child.once('error', reject);
      child.once('exit', () => reject(new Error(`CLI exited before its signal: ${stderr}`)));
    });
    child.stdin.end(input === undefined ? '' : JSON.stringify(input));
    return { done, signal };
  }
  return { root, file, release, update, run, start, read: () => JSON.parse(fs.readFileSync(file, 'utf8')) };
}

function proof(text) {
  return { current_summary: text, evidence: [{ kind: 'test', location: 'tests/storage.test.js', observation: text, targets: ['C1'] }] };
}

test('overlapping updates retain both observations and allocate distinct evidence IDs', { timeout: 15000 }, async t => {
  const f = fixture(t);
  const first = f.start(f.update, proof('첫 번째 관찰'), { ISSUE_PAUSE_READ: '1' });
  assert.equal(await first.signal, 'issue-read');
  const second = f.start(f.update, proof('두 번째 관찰'), { ISSUE_SIGNAL_INPUT: '1' });
  assert.equal(await second.signal, 'input-read');
  fs.writeFileSync(f.release, 'release');
  for (const result of await Promise.all([first.done, second.done])) assert.equal(result.status, 0, result.stderr);
  const saved = f.read();
  assert.deepEqual(saved.evidence.map(item => item.observation).sort(), ['두 번째 관찰', '첫 번째 관찰'].sort());
  assert.equal(new Set(saved.evidence.map(item => item.id)).size, 2);
});

test('a full disk preserves the saved Issue, releases its write lock, and allows a later update', t => {
  const f = fixture(t);
  const before = fs.readFileSync(f.file);
  const result = f.run(f.update, proof('저장할 관찰'), { ISSUE_DISK_FULL: '1' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ENOSPC/);
  assert.deepEqual(fs.readFileSync(f.file), before);
  assert.deepEqual(fs.readdirSync(f.root), ['PL-0001.json']);
  const next = f.run(f.update, proof('후속 검증 결과'));
  assert.equal(next.status, 0, next.stderr);
});
