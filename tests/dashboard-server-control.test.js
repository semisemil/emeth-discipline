const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const {
  inspectServer,
  openDashboard,
  startServer,
  stopServer,
} = require('../dashboard/control');

const repoRoot = path.resolve(__dirname, '..');
const controlPath = path.join(repoRoot, 'dashboard', 'control.js');

function isolatedEnvironment(root) {
  return {
    ...process.env,
    APPDATA: path.join(root, 'appdata'),
    HOME: path.join(root, 'home'),
    USERPROFILE: path.join(root, 'home'),
    XDG_CONFIG_HOME: path.join(root, 'config'),
  };
}

function tempDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-control-'));
  t.after(async () => {
    await stopServer({ directory });
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

test('status, open, and stop do not create a stopped dashboard directory', async (t) => {
  const root = tempDirectory(t);
  const directory = path.join(root, 'missing-dashboard');

  const status = await inspectServer({ directory });
  const opened = await openDashboard({ directory });
  const stopped = await stopServer({ directory });

  assert.equal(status.status, 'stopped');
  assert.equal(opened.ok, false);
  assert.equal(opened.action, 'unchanged');
  assert.equal(stopped.action, 'unchanged');
  assert.equal(fs.existsSync(directory), false);
});
test('open uses expected_version and preserves server and project state', async (t) => {
  const directory = tempDirectory(t);
  fs.mkdirSync(directory, { recursive: true });
  const projectsPath = path.join(directory, 'projects.json');
  fs.writeFileSync(projectsPath, '{"preserve":true}');
  const running = await startServer({ directory });
  const beforeServer = fs.readFileSync(path.join(directory, 'server.json'), 'utf8');
  const beforeSettings = fs.readFileSync(path.join(directory, 'settings.json'), 'utf8');
  let launchedUrl;

  const opened = await openDashboard({
    directory,
    browserLauncher(url) {
      launchedUrl = url;
    },
  });

  assert.equal(opened.action, 'opened');
  assert.equal(new URL(launchedUrl).searchParams.get('expected_version'), running.version);
  assert.equal(fs.readFileSync(path.join(directory, 'server.json'), 'utf8'), beforeServer);
  assert.equal(fs.readFileSync(path.join(directory, 'settings.json'), 'utf8'), beforeSettings);
  assert.equal(fs.readFileSync(projectsPath, 'utf8'), '{"preserve":true}');

  await stopServer({ directory });
  assert.equal(fs.readFileSync(projectsPath, 'utf8'), '{"preserve":true}');
});

test('status reports a running version mismatch without restarting it', async (t) => {
  const directory = tempDirectory(t);
  const running = await startServer({ directory, expectedVersion: 'older-version' });
  const status = await inspectServer({ directory });

  assert.equal(status.status, 'running');
  assert.equal(status.instance_id, running.instance_id);
  assert.equal(status.version, 'older-version');
  assert.equal(status.version_mismatch, true);
});

test('dashboard-server CLI reserves stderr and exit 2 for invalid actions', () => {
  const result = spawnSync(process.execPath, [controlPath, 'register'], { encoding: 'utf8' });

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^Usage: .*<start\|open\|status\|stop>\r?\n$/);
});

test('open, status, and stop have stable stopped stdout, stderr, and exit codes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-control-cli-'));
  const env = isolatedEnvironment(root);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const status = spawnSync(process.execPath, [controlPath, 'status'], { encoding: 'utf8', env });
  const open = spawnSync(process.execPath, [controlPath, 'open'], { encoding: 'utf8', env });
  const stop = spawnSync(process.execPath, [controlPath, 'stop'], { encoding: 'utf8', env });

  assert.equal(status.status, 0);
  assert.equal(JSON.parse(status.stdout).status, 'stopped');
  assert.equal(status.stderr, '');
  assert.equal(open.status, 1);
  assert.equal(JSON.parse(open.stdout).action, 'unchanged');
  assert.equal(open.stderr, '');
  assert.equal(stop.status, 0);
  assert.equal(JSON.parse(stop.stdout).action, 'unchanged');
  assert.equal(stop.stderr, '');
  assert.equal(fs.existsSync(path.join(root, 'appdata', 'emeth', 'dashboard')), false);
});
