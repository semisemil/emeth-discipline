'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const registerCli = path.join(repoRoot, 'dashboard', 'register-project.js');
const {
  getDashboardConfigDir,
  getRegistryPath,
  readRegistry,
  registerProject
} = require('../dashboard/registry.js');

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

function registryOptions(configRoot, overrides = {}) {
  return {
    env: configEnv(configRoot),
    randomUUID: () => '11111111-1111-4111-8111-111111111111',
    now: () => '2026-08-17T00:00:00.000Z',
    ...overrides
  };
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
  const first = registerProject(relativeFirst, registryOptions(configRoot));
  const duplicate = registerProject(aliasRoot, registryOptions(configRoot, {
    randomUUID: () => '22222222-2222-4222-8222-222222222222'
  }));
  const second = registerProject(secondRoot, registryOptions(configRoot, {
    randomUUID: () => '33333333-3333-4333-8333-333333333333',
    now: () => '2026-08-17T00:01:00.000Z'
  }));

  assert.equal(first.status, 'registered');
  assert.equal(duplicate.status, 'no-op');
  assert.equal(duplicate.project.id, first.project.id);
  assert.equal(second.status, 'registered');
  assert.notEqual(second.project.root, first.project.root);

  const { registry, registryPath } = readRegistry(registryOptions(configRoot));
  assert.equal(registry.projects.length, 2);
  assert.deepEqual(registry.projects.map((project) => project.id), [
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333'
  ]);
  assert.equal(path.dirname(registryPath), getDashboardConfigDir(registryOptions(configRoot)));
  assert.deepEqual(
    fs.readdirSync(path.dirname(registryPath)).filter((name) => name.endsWith('.tmp')),
    []
  );

  if (process.platform === 'win32') {
    const caseVariant = registerProject(firstRoot.toUpperCase(), registryOptions(configRoot));
    assert.equal(caseVariant.status, 'no-op');
  }
});

test('concurrent registration retains every distinct project', async (t) => {
  const root = makeRoot(t);
  const configRoot = path.join(root, 'config');
  const env = configEnv(configRoot);
  const registryPath = getRegistryPath({ env });
  const projectRoots = Array.from({ length: 12 }, (_, index) => path.join(root, `project-${index}`));
  for (const projectRoot of projectRoots) {
    fs.mkdirSync(projectRoot, { recursive: true });
  }
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, '{"schema_version":1,"projects":[]}\n', 'utf8');

  const workerSource = String.raw`
    const fs = require('node:fs');
    const path = require('node:path');
    const registryPath = process.env.EMETH_TEST_REGISTRY;
    const originalRead = fs.readFileSync;
    const waitState = new Int32Array(new SharedArrayBuffer(4));
    fs.readFileSync = function delayedRegistryRead(filePath, ...args) {
      const result = originalRead.call(this, filePath, ...args);
      if (path.resolve(String(filePath)) === path.resolve(registryPath)) {
        Atomics.wait(waitState, 0, 0, 75);
      }
      return result;
    };
    const { registerProject } = require(process.env.EMETH_TEST_REGISTRY_MODULE);
    process.send('ready');
    process.once('message', () => {
      try {
        process.stdout.write(JSON.stringify(registerProject(process.argv[1])));
      } catch (error) {
        process.stderr.write(JSON.stringify({ code: error.code, message: error.message }));
        process.exitCode = 1;
      } finally {
        process.disconnect();
      }
    });
  `;
  const workers = projectRoots.map((projectRoot) => {
    const child = spawn(process.execPath, ['-e', workerSource, projectRoot], {
      env: {
        ...env,
        EMETH_TEST_REGISTRY: registryPath,
        EMETH_TEST_REGISTRY_MODULE: path.join(repoRoot, 'dashboard', 'registry.js')
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const ready = new Promise((resolve, reject) => {
      child.once('message', resolve);
      child.once('error', reject);
    });
    const completed = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve({ code, stdout, stderr }));
    });
    return { child, ready, completed };
  });

  await Promise.all(workers.map((worker) => worker.ready));
  for (const worker of workers) {
    worker.child.send('start');
  }
  const results = await Promise.all(workers.map((worker) => worker.completed));
  for (const result of results) {
    assert.equal(result.code, 0, result.stderr);
  }

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
  const options = registryOptions(configRoot, { lockTimeoutMs: 0 });
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

test('an abandoned registry lock is recovered before registration', (t) => {
  const root = makeRoot(t);
  const configRoot = path.join(root, 'config');
  const projectRoot = path.join(root, 'project');
  const options = registryOptions(configRoot);
  const registryPath = getRegistryPath(options);
  const lockPath = `${registryPath}.lock`;
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify({
    schema_version: 1,
    token: '99999999-9999-4999-8999-999999999999',
    owner_pid: 2147483647,
    started_at: new Date().toISOString()
  }), 'utf8');

  assert.equal(registerProject(projectRoot, options).status, 'registered');
  assert.equal(readRegistry(options).registry.projects.length, 1);
  assert.equal(fs.existsSync(lockPath), false);
  assert.equal(fs.existsSync(`${lockPath}.recovery`), false);
});

test('Windows recovery-claim EPERM is retried as lock contention', (t) => {
  const root = makeRoot(t);
  const configRoot = path.join(root, 'config');
  const projectRoot = path.join(root, 'project');
  const env = { ...configEnv(configRoot), APPDATA: configRoot };
  const options = registryOptions(configRoot, {
    env,
    platform: 'win32',
    lockRetryMs: 0,
  });
  const registryPath = getRegistryPath(options);
  const lockPath = `${registryPath}.lock`;
  const recoveryPath = `${lockPath}.recovery`;
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify({
    schema_version: 1,
    token: '99999999-9999-4999-8999-999999999999',
    owner_pid: 2147483647,
    started_at: new Date().toISOString(),
  }), 'utf8');

  const originalOpen = fs.openSync;
  let denied = true;
  fs.openSync = function denyFirstRecoveryClaim(filePath, flags, ...args) {
    if (denied && filePath === recoveryPath && flags === 'wx') {
      denied = false;
      const error = new Error('recovery claim is temporarily locked');
      error.code = 'EPERM';
      throw error;
    }
    return originalOpen.call(this, filePath, flags, ...args);
  };
  t.after(() => { fs.openSync = originalOpen; });

  assert.equal(registerProject(projectRoot, options).status, 'registered');
  assert.equal(denied, false);
  assert.equal(fs.existsSync(lockPath), false);
  assert.equal(fs.existsSync(recoveryPath), false);
});

test('missing roots are rejected without creating global state', (t) => {
  const root = makeRoot(t);
  const configRoot = path.join(root, 'config');
  assert.throws(
    () => registerProject(path.join(root, 'missing'), registryOptions(configRoot)),
    (error) => error.code === 'project-root-invalid'
  );
  assert.equal(fs.existsSync(getRegistryPath(registryOptions(configRoot))), false);
});

test('invalid registries are rejected and never overwritten', (t) => {
  const root = makeRoot(t);
  const projectRoot = path.join(root, 'project');
  const configRoot = path.join(root, 'config');
  const options = registryOptions(configRoot);
  const registryPath = getRegistryPath(options);
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });

  const invalidCases = [
    '{bad json',
    JSON.stringify({ schema_version: 2, projects: [] }),
    JSON.stringify({ schema_version: 1, projects: [], extra: true }),
    JSON.stringify({
      schema_version: 1,
      projects: [
        { id: '11111111-1111-4111-8111-111111111111', root: projectRoot, registered_at: '2026-08-17T00:00:00.000Z' },
        { id: '11111111-1111-4111-8111-111111111111', root: path.join(root, 'other'), registered_at: '2026-08-17T00:00:00.000Z' }
      ]
    }),
    JSON.stringify({
      schema_version: 1,
      projects: [
        { id: '11111111-1111-4111-8111-111111111111', root: projectRoot, registered_at: '2026-08-17T00:00:00.000Z' },
        { id: '22222222-2222-4222-8222-222222222222', root: projectRoot, registered_at: '2026-08-17T00:00:00.000Z' }
      ]
    })
  ];

  for (const content of invalidCases) {
    fs.writeFileSync(registryPath, content, 'utf8');
    assert.throws(
      () => registerProject(projectRoot, options),
      (error) => error.code === 'registry-invalid'
    );
    assert.equal(fs.readFileSync(registryPath, 'utf8'), content);
  }
});

test('register CLI reports registered, no-op, and registry-invalid as stable results', (t) => {
  const root = makeRoot(t);
  const projectRoot = path.join(root, 'project');
  const configRoot = path.join(root, 'config');
  const env = configEnv(configRoot);
  fs.mkdirSync(projectRoot, { recursive: true });

  const first = spawnSync(process.execPath, [registerCli, 'register', '--project-root', projectRoot], {
    encoding: 'utf8', env
  });
  const second = spawnSync(process.execPath, [registerCli, 'register', '--project-root', projectRoot], {
    encoding: 'utf8', env
  });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).status, 'registered');
  assert.equal(second.status, 0, second.stderr);
  assert.equal(JSON.parse(second.stdout).status, 'no-op');

  const registryPath = getRegistryPath({ env });
  fs.writeFileSync(registryPath, '{bad json', 'utf8');
  const invalid = spawnSync(process.execPath, [registerCli, 'register', '--project-root', projectRoot], {
    encoding: 'utf8', env
  });
  assert.equal(invalid.status, 1);
  assert.equal(JSON.parse(invalid.stderr).error.code, 'registry-invalid');
  assert.equal(fs.readFileSync(registryPath, 'utf8'), '{bad json');

  const malformed = spawnSync(process.execPath, [registerCli, 'register', '--unknown', projectRoot], {
    encoding: 'utf8', env
  });
  assert.equal(malformed.status, 1);
  assert.equal(JSON.parse(malformed.stderr).error.code, 'invalid-argument');
});
