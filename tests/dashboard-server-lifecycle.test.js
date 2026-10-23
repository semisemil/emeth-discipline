const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');

const {
  health,
  inspectServer,
  openDashboard,
  runCli,
  startServer,
  stopServer,
} = require('../plugins/emeth-discipline/dashboard/control');

function tempDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-server-'));
  t.after(async () => {
    await stopServer({ directory });
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

function listen(server, host = '127.0.0.1', port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host, port }, () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function cannotConnect(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(true));
  });
}

test('startup uses fixed IPv4 port 43127 despite legacy settings and keeps it after restart', async (t) => {
  const directory = tempDirectory(t);
  const settingsPath = path.join(directory, 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify({ schema_version: 1, port: 12345 }));
  const first = await startServer({ directory });

  assert.equal(first.ok, true);
  assert.equal(first.action, 'started');
  assert.equal(first.port, 43127);
  const state = JSON.parse(fs.readFileSync(path.join(directory, 'server.json'), 'utf8'));
  assert.equal(state.instance_id, first.instance_id);
  assert.equal((await health(first.port)).value.instance_id, first.instance_id);
  assert.equal(await cannotConnect('::1', first.port), true);

  const reused = await startServer({ directory });
  assert.equal(reused.action, 'reused');
  assert.equal(reused.instance_id, first.instance_id);
  assert.equal(reused.port, first.port);

  await stopServer({ directory });
  const restarted = await startServer({ directory });
  assert.equal(restarted.ok, true);
  assert.equal(restarted.port, 43127);
  assert.notEqual(restarted.instance_id, first.instance_id);
  assert.equal(JSON.parse(fs.readFileSync(settingsPath, 'utf8')).port, 12345);
});

test('fixed port owned by another process is reported without selecting another port', async (t) => {
  const directory = tempDirectory(t);
  const occupant = net.createServer((socket) => socket.end('occupied'));
  t.after(() => close(occupant));
  await listen(occupant, '127.0.0.1', 43127);

  const result = await startServer({ directory });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'port-unavailable');
  assert.equal(result.port, 43127);
  assert.equal(fs.existsSync(path.join(directory, 'settings.json')), false);
  assert.equal(fs.existsSync(path.join(directory, 'server.json')), false);
  assert.equal(occupant.listening, true);
});

test('open moves a verified legacy server to the fixed port', async (t) => {
  const directory = tempDirectory(t);
  const legacy = await startServer({ directory, port: 0 });
  assert.equal(legacy.ok, true);
  let launchedUrl;

  const opened = await openDashboard({ directory, browserLauncher(url) { launchedUrl = url; } });

  assert.equal(opened.ok, true);
  assert.equal(opened.action, 'opened');
  assert.equal(opened.port, 43127);
  assert.notEqual(opened.instance_id, legacy.instance_id);
  assert.equal(new URL(launchedUrl).port, '43127');
  assert.throws(() => process.kill(legacy.pid, 0), { code: 'ESRCH' });
  assert.equal((await health(43127)).value.instance_id, opened.instance_id);
});

test('explicit startup replaces an expired lock whose owner PID was reused', async (t) => {
  const directory = tempDirectory(t);
  const lockPath = path.join(directory, 'server-start.lock');
  fs.writeFileSync(lockPath, JSON.stringify({
    schema_version: 1,
    instance_id: randomUUID(),
    owner_pid: process.pid,
    started_at: new Date(Date.now() - 60_000).toISOString(),
  }));

  const result = await runCli(['start'], { directory, port: 0 });

  assert.equal(result.exitCode, 0);
  assert.equal(result.result.action, 'started');
  assert.equal((await inspectServer({ directory })).instance_id, result.result.instance_id);
  assert.equal(fs.existsSync(lockPath), false);
});

test('Windows startup timeout stops the child and removes startup state', {
  skip: process.platform !== 'win32',
}, async (testContext) => {
  const directory = tempDirectory(testContext);
  const serverScript = path.join(directory, 'unready-server.js');
  const pidPath = path.join(directory, 'test-server.pid');
  fs.writeFileSync(serverScript,
    "require('node:fs').writeFileSync(require('node:path').join(process.argv[3], 'test-server.pid'), String(process.pid)); setInterval(() => {}, 1000);");

  const result = await startServer({ directory, port: 0, serverScript });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'start-timeout');
  const pid = Number(fs.readFileSync(pidPath, 'utf8'));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  assert.equal(fs.existsSync(path.join(directory, 'server.json')), false);
  assert.equal(fs.existsSync(path.join(directory, 'server-start.lock')), false);
  assert.equal(fs.readdirSync(directory).some((name) => /^server-start-/.test(name)), false);
});

test('PID reuse and another health service are not treated as Emeth Discipline or stopped', async (t) => {
  const directory = tempDirectory(t);
  const otherInstance = randomUUID();
  const service = http.createServer((_request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ schema_version: 1, instance_id: otherInstance, version: 'other' }));
  });
  t.after(() => close(service));
  const address = await listen(service);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'server.json'), JSON.stringify({
    schema_version: 1,
    instance_id: randomUUID(),
    pid: process.pid,
    port: address.port,
    version: '0.6.2',
    started_at: new Date().toISOString(),
  }));

  const status = await inspectServer({ directory });
  const stopped = await stopServer({ directory });

  assert.equal(status.status, 'stopped');
  assert.equal(status.reason, 'instance-mismatch');
  assert.equal(stopped.action, 'unchanged');
  assert.equal(service.listening, true);
});

test('stale PID state is replaced without preserving its identity', async (t) => {
  const directory = tempDirectory(t);
  const staleInstance = randomUUID();
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'server.json'), JSON.stringify({
    schema_version: 1,
    instance_id: staleInstance,
    pid: 2147483647,
    port: 43127,
    version: '0.6.2',
    started_at: new Date().toISOString(),
  }));

  const result = await startServer({ directory, port: 0 });

  assert.equal(result.ok, true);
  assert.equal(result.action, 'started');
  assert.notEqual(result.instance_id, staleInstance);
});

test('concurrent starter processes recover an expired lock without competing servers', async (t) => {
  const directory = tempDirectory(t);
  fs.writeFileSync(path.join(directory, 'server-start.lock'), JSON.stringify({
    schema_version: 1,
    instance_id: randomUUID(),
    owner_pid: process.pid,
    started_at: new Date(Date.now() - 60_000).toISOString(),
  }));
  const control = require.resolve('../plugins/emeth-discipline/dashboard/control');
  const script = `require(process.argv[1]).startServer({ directory: process.argv[2], port: 0 })
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error); process.exitCode = 1; });`;
  const results = await Promise.all(Array.from({ length: 4 }, () => new Promise((resolve, reject) => {
    execFile(process.execPath, ['-e', script, control, directory], { windowsHide: true }, (error, stdout) => {
      if (error) return reject(error);
      const result = JSON.parse(stdout);
      if (result.action === 'started') t.after(() => {
        try { process.kill(result.pid); } catch (failure) { if (failure.code !== 'ESRCH') throw failure; }
      });
      resolve(result);
    });
  })));
  const started = results.filter(result => result.action === 'started');
  const status = await inspectServer({ directory });

  assert.equal(started.length, 1);
  assert.equal(status.status, 'running');
  assert.equal(status.instance_id, started[0].instance_id);
  assert.equal(new Set(results.filter(result => result.instance_id).map(result => result.instance_id)).size, 1);
  assert.equal(fs.existsSync(path.join(directory, 'server-start.lock')), false);
});

test('normal and abnormal exits preserve identity cleanup rules', async (t) => {
  const directory = tempDirectory(t);
  const first = await startServer({ directory, port: 0 });
  const normal = await stopServer({ directory });
  assert.equal(normal.action, 'stopped');
  assert.equal(fs.existsSync(path.join(directory, 'server.json')), false);

  const second = await startServer({ directory, port: 0 });
  process.kill(second.pid, 'SIGKILL');
  let afterKill;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    afterKill = await inspectServer({ directory });
    if (afterKill.status === 'stopped') {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(afterKill.status, 'stopped');
  assert.equal(fs.existsSync(path.join(directory, 'server.json')), true);

  const restarted = await startServer({ directory, port: 0 });
  assert.equal(restarted.action, 'started');
  assert.notEqual(restarted.instance_id, second.instance_id);
  assert.equal(fs.existsSync(path.join(directory, 'server-start.lock')), false);
});
