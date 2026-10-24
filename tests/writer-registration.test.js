'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const test = require('node:test');

const pluginRoot = path.resolve(__dirname, '../plugins/emeth-discipline');
const issueCli = path.join(pluginRoot, 'skills', 'issue-ledger', 'scripts', 'issue-ledger.js');
const { getRegistryPath } = require('../plugins/emeth-discipline/dashboard/registry.js');

function makeFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-writer-'));
  const projectRoot = path.join(root, 'project');
  const issuesRoot = path.join(projectRoot, '.emeth', 'issues');
  const configRoot = path.join(root, 'config');
  fs.mkdirSync(issuesRoot, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = process.platform === 'win32'
    ? { ...process.env, APPDATA: configRoot }
    : { ...process.env, XDG_CONFIG_HOME: configRoot };
  return { root, projectRoot, issuesRoot, env };
}

function makeIssue() {
  return {
    schema_version: 2,
    identity: {
      id: 'PL-0001', aliases: [], type: 'task', mode: 'simple', title: '등록 테스트', risk: 'low'
    },
    origin: { kind: 'request', summary: 'writer 등록 검증', refs: [] },
    state: { status: 'open', current_summary: '작성 대기', next_action: '작성한다' },
    objective: { summary: '성공한 쓰기 뒤 프로젝트 등록', constraints: [] },
    criteria: [{ id: 'C1', text: '프로젝트가 등록된다', evidence_refs: [] }],
    relations: [], context: [], artifacts: [], evidence: [], events: [],
    created_at: '2026-08-17T00:00:00.000Z',
    updated_at: '2026-08-17T00:00:00.000Z'
  };
}

function runIssue(args, env, source) {
  const prefix = source ? ['-e', source] : [];
  return spawnSync(process.execPath, [...prefix, issueCli, ...args], { encoding: 'utf8', env, windowsHide: true });
}

function registry(fixture) {
  return JSON.parse(fs.readFileSync(getRegistryPath({ env: fixture.env }), 'utf8'));
}

test('Issue create from a template assigns IDs and timestamps and starts a missing default store', (t) => {
  const fixture = makeFixture(t);
  fs.rmSync(fixture.issuesRoot, { recursive: true });
  fs.mkdirSync(path.join(fixture.projectRoot, '.emeth', 'designs'));
  const template = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'skills/issue-ledger/assets/templates/issue-objective.json'), 'utf8'));
  const filled = JSON.parse(JSON.stringify(template).replace(/REPLACE: [^"]*/g, '템플릿 값'));
  const input = path.join(fixture.root, 'issue.json');
  fs.writeFileSync(input, JSON.stringify(filled), 'utf8');
  const run = () => spawnSync(process.execPath, [issueCli, 'create', '--input', input], { cwd: fixture.projectRoot, encoding: 'utf8', env: fixture.env });

  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.ok(first.stdout.trim().endsWith('PL-0001.json'));
  const created = JSON.parse(fs.readFileSync(path.join(fixture.issuesRoot, 'PL-0001.json'), 'utf8'));
  assert.equal(created.identity.id, 'PL-0001');
  assert.equal(registry(fixture).projects[0].root, fs.realpathSync(fixture.projectRoot));
  assert.ok(!Number.isNaN(Date.parse(created.created_at)));
  assert.equal(created.updated_at, created.created_at);
  assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.emeth', 'STATE.md')), true);
  assert.equal(run().stdout.trim().endsWith('PL-0002.json'), true);
});

function templateInput(fixture) {
  const template = fs.readFileSync(path.join(pluginRoot, 'skills/issue-ledger/assets/templates/issue-objective.json'), 'utf8');
  const input = path.join(fixture.root, 'issue.json');
  fs.writeFileSync(input, template.replace(/REPLACE: [^"]*/g, '템플릿 값'), 'utf8');
  return input;
}

test('a template Issue gets an ID above stored IDs in a custom issues directory', (t) => {
  const fixture = makeFixture(t);
  const customRoot = path.join(fixture.root, 'custom-issues');
  fs.mkdirSync(customRoot);
  fs.writeFileSync(path.join(customRoot, 'existing-task.json'), `${JSON.stringify(makeIssue(), null, 2)}\n`, 'utf8');
  const result = runIssue(['create', '--input', templateInput(fixture), '--root', customRoot,
    '--project-root', fixture.projectRoot], fixture.env);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.trim().endsWith('PL-0002.json'));
  assert.equal(fs.existsSync(path.join(fixture.issuesRoot, 'PL-0002.json')), false);
});

test('Issue updates persist a validated state transition', (t) => {
  const fixture = makeFixture(t);
  const issuePath = path.join(fixture.issuesRoot, 'PL-0001.json');
  fs.writeFileSync(issuePath, JSON.stringify(makeIssue()));
  const operation = path.join(fixture.root, 'operation.json');
  fs.writeFileSync(operation, JSON.stringify({ type: 'set_state', status: 'doing',
    current_summary: '구현을 시작했다', next_action: '구현한다', updated_at: '2026-08-17T01:00:00.000Z' }));
  const result = runIssue(['update', 'PL-0001', '--operation', operation, '--root', fixture.issuesRoot], fixture.env);
  assert.equal(result.status, 0, result.stderr);
  const issue = JSON.parse(fs.readFileSync(issuePath, 'utf8'));
  assert.equal(issue.state.status, 'doing');
  assert.equal(issue.state.current_summary, '구현을 시작했다');
  assert.equal(issue.state.next_action, '구현한다');
  assert.deepEqual(issue.events.map(event => [event.from, event.to]), [['open', 'doing']]);
});

test('concurrent template creates each publish a distinct complete Issue', async (t) => {
  const fixture = makeFixture(t);
  const input = templateInput(fixture);
  const count = 2;
  const runs = await Promise.all(Array.from({ length: count }, () => new Promise((resolve) => {
    const child = spawn(process.execPath, [issueCli, 'create', '--input', input, '--root', fixture.issuesRoot],
      { env: fixture.env, windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stderr }));
  })));
  assert.deepEqual(runs.filter((run) => run.status !== 0), []);
  const files = fs.readdirSync(fixture.issuesRoot).filter((name) => name.endsWith('.json')).sort();
  assert.deepEqual(files, Array.from({ length: count }, (_, index) => `PL-${String(index + 1).padStart(4, '0')}.json`));
  for (const name of files) assert.equal(JSON.parse(fs.readFileSync(path.join(fixture.issuesRoot, name), 'utf8')).identity.id, name.slice(0, -5));
});

test('a create lock left by an exited process does not block Issue creation', (t) => {
  const fixture = makeFixture(t);
  const exited = spawnSync(process.execPath, ['-e', ''], { windowsHide: true });
  assert.equal(exited.status, 0, exited.stderr);
  const lock = path.join(fixture.issuesRoot, '.create.lock');
  fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: exited.pid }));
  const result = runIssue(['create', '--input', templateInput(fixture), '--root', fixture.issuesRoot], fixture.env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(fixture.issuesRoot, 'PL-0001.json'), 'utf8')).identity.id, 'PL-0001');
  assert.deepEqual(fs.readdirSync(fixture.issuesRoot).filter(name => name.startsWith('.')), []);
});

test('Issue write failure does not register the project', (t) => {
  const fixture = makeFixture(t);
  const target = path.join(fixture.issuesRoot, 'PL-0001.json');
  const source = `const fs = require('node:fs'); const rename = fs.renameSync;
    fs.renameSync = (from, to) => {
      if (to === ${JSON.stringify(target)}) throw Object.assign(new Error('Issue publication failed'), { code: 'EIO' });
      return rename(from, to);
    };
    require(process.argv[1]).main(process.argv.slice(2));`;
  const result = runIssue(['create', '--input', templateInput(fixture), '--root', fixture.issuesRoot], fixture.env, source);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /EIO.*Issue publication failed|Issue publication failed[\s\S]*EIO/);
  assert.deepEqual(fs.readdirSync(fixture.issuesRoot), []);
  assert.equal(fs.existsSync(getRegistryPath({ env: fixture.env })), false);
});

test('registration failure stays separate from a successful Issue write', (t) => {
  const fixture = makeFixture(t);
  const registryPath = getRegistryPath({ env: fixture.env });
  const source = `const fs = require('node:fs'); const open = fs.openSync;
    fs.openSync = (file, ...args) => {
      if (file === ${JSON.stringify(registryPath + '.lock')}) throw Object.assign(new Error('Registration denied'), { code: 'EACCES' });
      return open(file, ...args);
    };
    require(process.argv[1]).main(process.argv.slice(2));`;
  const result = runIssue(['create', '--input', templateInput(fixture), '--root', fixture.issuesRoot], fixture.env, source);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(fixture.issuesRoot, 'PL-0001.json'), 'utf8')).identity.id, 'PL-0001');
  assert.match(result.stderr, /registration-failed:.*registry-lock-failed/);
  assert.match(result.stderr, /Registration denied/);
  assert.equal(fs.existsSync(registryPath), false);
});
