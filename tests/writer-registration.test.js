'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
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
  const input = templateInput(fixture);
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
  created.identity.id = 'PL-0042';
  fs.writeFileSync(path.join(fixture.issuesRoot, 'stored-issue.json'), JSON.stringify(created));
  assert.equal(run().stdout.trim().endsWith('PL-0043.json'), true);
});

function templateInput(fixture) {
  const template = fs.readFileSync(path.join(pluginRoot, 'skills/issue-ledger/assets/templates/issue-objective.json'), 'utf8');
  const input = path.join(fixture.root, 'issue.json');
  fs.writeFileSync(input, template.replace(/REPLACE: [^"]*/g, '템플릿 값'), 'utf8');
  return input;
}

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
