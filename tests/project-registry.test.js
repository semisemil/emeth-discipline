'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const test = require('node:test');

const pluginRoot = path.resolve(__dirname, '../plugins/emeth-discipline');
const registerCli = path.join(pluginRoot, 'dashboard', 'register-project.js');
const {
  getRegistryPath,
  readRegistry,
  registerProject
} = require('../plugins/emeth-discipline/dashboard/registry.js');

function makeRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-registry-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function configEnv(configRoot) {
  return process.platform === 'win32'
    ? { ...process.env, APPDATA: configRoot }
    : { ...process.env, XDG_CONFIG_HOME: configRoot };
}

test('registry normalizes real roots, deduplicates aliases, and atomically retains distinct roots', (t) => {
  const root = makeRoot(t);
  const configRoot = path.join(root, 'config');
  const firstRoot = path.join(root, 'one', 'same-name');
  const secondRoot = path.join(root, 'two', 'same-name');
  const aliasRoot = path.join(root, 'alias');
  fs.mkdirSync(firstRoot, { recursive: true });
  fs.mkdirSync(secondRoot, { recursive: true });
  fs.symlinkSync(firstRoot, aliasRoot, process.platform === 'win32' ? 'junction' : 'dir');

  const relativeFirst = path.relative(process.cwd(), firstRoot);
  const options = { env: configEnv(configRoot) };
  const first = registerProject(relativeFirst, options);
  const duplicate = registerProject(aliasRoot, options);
  const second = registerProject(secondRoot, options);

  assert.equal(first.status, 'registered');
  assert.equal(duplicate.status, 'no-op');
  assert.equal(duplicate.project.id, first.project.id);
  assert.equal(second.status, 'registered');
  assert.notEqual(second.project.root, first.project.root);

  const { registry } = readRegistry(options);
  assert.equal(registry.projects.length, 2);
  assert.equal(new Set(registry.projects.map(project => project.id)).size, 2);

  if (process.platform === 'win32') {
    const caseVariant = registerProject(firstRoot.toUpperCase(), options);
    assert.equal(caseVariant.status, 'no-op');
  }
});

test('concurrent registration retains every distinct project', async (t) => {
  const root = makeRoot(t);
  const configRoot = path.join(root, 'config');
  const env = configEnv(configRoot);
  const registryPath = getRegistryPath({ env });
  const projectRoots = ['alpha', 'beta'].map(name => path.join(root, name));
  for (const projectRoot of projectRoots) {
    fs.mkdirSync(projectRoot, { recursive: true });
  }
  const execute = promisify(execFile);
  await Promise.all(projectRoots.map(projectRoot => execute(process.execPath,
    [registerCli, 'register', '--project-root', projectRoot], { env, windowsHide: true })));

  const { registry } = readRegistry({ env });
  assert.deepEqual(
    registry.projects.map((project) => project.root).sort(),
    projectRoots.map((projectRoot) => fs.realpathSync(projectRoot)).sort()
  );
  assert.equal(fs.existsSync(`${registryPath}.lock`), false);
  assert.equal(fs.existsSync(`${registryPath}.lock.recovery`), false);
});

test('a live registry lock times out without changing projects', (t) => {
  const root = makeRoot(t);
  const configRoot = path.join(root, 'config');
  const projectRoot = path.join(root, 'project');
  const options = { env: configEnv(configRoot), lockTimeoutMs: 0 };
  const registryPath = getRegistryPath(options);
  const lockPath = `${registryPath}.lock`;
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, '{"schema_version":1,"projects":[]}\n', 'utf8');
  fs.writeFileSync(lockPath, JSON.stringify({
    schema_version: 1,
    token: '99999999-9999-4999-8999-999999999999',
    owner_pid: process.pid,
    started_at: new Date().toISOString()
  }), 'utf8');

  assert.throws(
    () => registerProject(projectRoot, options),
    (error) => error.code === 'registry-lock-timeout'
  );
  assert.deepEqual(readRegistry(options).registry.projects, []);
  assert.equal(fs.existsSync(lockPath), true);
});
