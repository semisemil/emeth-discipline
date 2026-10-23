const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const {
  inspectServer,
  openDashboard,
  runCli,
  startServer,
  stopServer,
} = require('../plugins/emeth-discipline/dashboard/control');

const pluginRoot = path.resolve(__dirname, '../plugins/emeth-discipline');
const controlPath = path.join(pluginRoot, 'dashboard', 'control.js');

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

test('server status rejects missing Windows APPDATA before accessing a fallback directory', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-control-config-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  await assert.rejects(inspectServer({ platform: 'win32', env: {}, homeDir: root }), { code: 'config-unavailable' });
  assert.deepEqual(fs.readdirSync(root), []);
});

test('open uses expected_version and preserves server and project state', async (t) => {
  const directory = tempDirectory(t);
  fs.mkdirSync(directory, { recursive: true });
  const projectsPath = path.join(directory, 'projects.json');
  fs.writeFileSync(projectsPath, '{"preserve":true}');
  const running = await startServer({ directory, port: 0 });
  const beforeServer = fs.readFileSync(path.join(directory, 'server.json'), 'utf8');
  let launchedUrl;

  const opened = await openDashboard({
    directory,
    port: 0,
    browserLauncher(url) {
      launchedUrl = url;
    },
  });

  assert.equal(opened.action, 'opened');
  assert.equal(new URL(launchedUrl).searchParams.get('expected_version'), running.version);
  assert.equal(fs.readFileSync(path.join(directory, 'server.json'), 'utf8'), beforeServer);
  assert.equal(fs.existsSync(path.join(directory, 'settings.json')), false);
  assert.equal(fs.readFileSync(projectsPath, 'utf8'), '{"preserve":true}');

  await stopServer({ directory });
  assert.equal(fs.readFileSync(projectsPath, 'utf8'), '{"preserve":true}');
});

test('open starts a stopped server and launches its verified URL', async (t) => {
  const directory = tempDirectory(t);
  let launchedUrl;

  const opened = await runCli(['open'], {
    directory,
    port: 0,
    browserLauncher(url) { launchedUrl = url; },
  });
  const status = await inspectServer({ directory });

  assert.equal(opened.exitCode, 0);
  assert.equal(opened.result.command, 'open');
  assert.equal(opened.result.action, 'opened');
  assert.equal(status.status, 'running');
  assert.equal(opened.result.instance_id, status.instance_id);
  assert.equal(new URL(launchedUrl).origin, status.url.slice(0, -1));
  assert.equal(new URL(launchedUrl).searchParams.get('expected_version'), status.expected_version);
  assert.equal(fs.existsSync(path.join(directory, 'projects.json')), false);
});

test('open reports a startup failure without launching a browser', async (t) => {
  const directory = tempDirectory(t);
  const occupant = net.createServer(socket => socket.end());
  await new Promise(resolve => occupant.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => occupant.close(resolve)));
  let launched = false;

  const opened = await runCli(['open'], {
    directory,
    port: occupant.address().port,
    browserLauncher() { launched = true; },
  });

  assert.equal(opened.exitCode, 1);
  assert.equal(opened.result.reason, 'port-unavailable');
  assert.equal(opened.result.action, 'unchanged');
  assert.equal(launched, false);
  assert.equal(occupant.listening, true);
});

test('status reports a running version mismatch without restarting it', async (t) => {
  const directory = tempDirectory(t);
  const running = await startServer({ directory, port: 0, expectedVersion: 'older-version' });
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

test('status and stop report stopped without creating dashboard state', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-control-cli-'));
  const env = isolatedEnvironment(root);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const status = spawnSync(process.execPath, [controlPath, 'status'], { encoding: 'utf8', env });
  const stop = spawnSync(process.execPath, [controlPath, 'stop'], { encoding: 'utf8', env });

  assert.equal(status.status, 0);
  assert.equal(JSON.parse(status.stdout).status, 'stopped');
  assert.equal(status.stderr, '');
  assert.equal(stop.status, 0);
  assert.equal(JSON.parse(stop.stdout).action, 'unchanged');
  assert.equal(stop.stderr, '');
  assert.equal(fs.existsSync(path.join(root, 'appdata', 'emeth', 'dashboard')), false);
});
