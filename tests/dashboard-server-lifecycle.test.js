const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { randomUUID } = require('node:crypto');

const {
  health,
  inspectServer,
  startServer,
  stopServer,
} = require('../dashboard/control');

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

test('first start selects one IPv4 loopback port and reuses its instance', async (t) => {
  const directory = tempDirectory(t);
  const first = await startServer({ directory });

  assert.equal(first.ok, true);
  assert.equal(first.action, 'started');
  const settings = JSON.parse(fs.readFileSync(path.join(directory, 'settings.json'), 'utf8'));
  const state = JSON.parse(fs.readFileSync(path.join(directory, 'server.json'), 'utf8'));
  assert.deepEqual(settings, { schema_version: 1, port: first.port });
  assert.equal(state.instance_id, first.instance_id);
  assert.equal((await health(first.port)).value.instance_id, first.instance_id);
  assert.equal(await cannotConnect('::1', first.port), true);

  const reused = await startServer({ directory });
  assert.equal(reused.action, 'reused');
  assert.equal(reused.instance_id, first.instance_id);
  assert.equal(reused.port, first.port);
});

test('stored port owned by another process is reported and never replaced', async (t) => {
  const directory = tempDirectory(t);
  const occupant = net.createServer((socket) => socket.end('occupied'));
  t.after(() => close(occupant));
  const address = await listen(occupant);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'settings.json'),
    JSON.stringify({ schema_version: 1, port: address.port }),
  );

  const result = await startServer({ directory });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'port-unavailable');
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'settings.json'))).port, address.port);
  assert.equal(fs.existsSync(path.join(directory, 'server.json')), false);
  assert.equal(occupant.listening, true);
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

  const result = await startServer({ directory });

  assert.equal(result.ok, true);
  assert.equal(result.action, 'started');
  assert.notEqual(result.instance_id, staleInstance);
});

test('concurrent starts produce at most one new instance', async (t) => {
  const directory = tempDirectory(t);
  const results = await Promise.all([
    startServer({ directory }),
    startServer({ directory }),
    startServer({ directory }),
    startServer({ directory }),
  ]);
  const started = results.filter((result) => result.action === 'started');
  const status = await inspectServer({ directory });

  assert.equal(started.length, 1);
  assert.equal(status.status, 'running');
  assert.equal(status.instance_id, started[0].instance_id);
  assert.equal(new Set(results.filter((result) => result.instance_id).map((result) => result.instance_id)).size, 1);
});

test('normal and abnormal exits preserve identity cleanup rules', async (t) => {
  const directory = tempDirectory(t);
  const first = await startServer({ directory });
  const normal = await stopServer({ directory });
  assert.equal(normal.action, 'stopped');
  assert.equal(fs.existsSync(path.join(directory, 'server.json')), false);

  const second = await startServer({ directory });
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

  const restarted = await startServer({ directory });
  assert.equal(restarted.action, 'started');
  assert.notEqual(restarted.instance_id, second.instance_id);
  assert.equal(fs.existsSync(path.join(directory, 'server-start.lock')), false);
});
