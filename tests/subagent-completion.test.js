'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { CompletionNotifications } = require('../plugins/emeth-discipline/lib/subagent-completion');
const { connect } = require('../plugins/emeth-discipline/lib/codex-rpc');

function fixture(t, parentThread = { canAcceptDirectInput: true }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-completion-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let queue = [], sequence = 0;
  const request = async (method, params) => {
    if (method === 'thread/read') return { thread: parentThread };
    if (method === 'thread/queue/list') return { data: queue.filter(i => i.threadId === params.threadId) };
    if (method === 'thread/queue/add') {
      const item = { ...params, id: String(++sequence) }; queue.push(item); return { queuedSubmission: item };
    }
    if (method === 'thread/queue/delete') {
      const count = queue.length;
      queue = queue.filter(i => i.threadId !== params.threadId || i.id !== params.queuedSubmissionId);
      return { deleted: count !== queue.length };
    }
    throw new Error(method);
  };
  return { create: () => new CompletionNotifications({ directory, request }), queue: () => queue, request };
}

test('acknowledging a processed result cancels only its pending wake-up', async t => {
  const f = fixture(t), inbox = f.create();
  await f.request('thread/queue/add', { threadId: 'parent', clientUserMessageId: 'user-input', input: [] });
  await inbox.perform('notify', { parent: 'parent', task: 'a', message: 'done A' });
  await inbox.perform('notify', { parent: 'parent', task: 'b', message: 'done B' });
  const result = await inbox.perform('ack', { parent: 'parent', task: 'a' });
  assert.equal(result.deleted, 1);
  assert.equal(f.queue().length, 2);
  assert.ok(f.queue().some(i => i.clientUserMessageId === 'user-input'));
  assert.ok(f.queue().some(i => i.input[0]?.text.includes('done B')));
});

test('a correction still wakes the parent after the previous assignment with the same label was acknowledged', async t => {
  const helper = path.resolve(__dirname, '../plugins/emeth-discipline/lib/subagent-completion.js');
  const allocate = () => JSON.parse(execFileSync(process.execPath, [helper, 'allocate',
    '--parent', 'parent', '--task', 'review', '--codex', 'not-needed-for-allocation'], { encoding: 'utf8' }));
  const f = fixture(t), inbox = f.create();
  const first = allocate();
  await inbox.perform('notify', { ...first, message: 'first review ready' });
  await inbox.perform('ack', first);
  const correction = allocate();
  assert.equal(first.parent, 'parent');
  assert.equal(correction.parent, 'parent');
  assert.notEqual(first.task, correction.task);
  const result = await inbox.perform('notify', { ...correction, message: 'correction review ready' });
  assert.equal(result.status, 'registered');
  assert.equal(f.queue().length, 1);
  assert.ok(f.queue()[0].input[0].text.includes('correction review ready'));
});

test('a subagent parent resumes through its native path without queuing direct input', async t => {
  const f = fixture(t, {
    canAcceptDirectInput: false,
    source: { subAgent: { thread_spawn: { agent_path: '/root/owner' } } },
  });
  const result = await f.create().perform('notify', { parent: 'parent', task: 'tests', message: 'tests ready' });
  assert.equal(result.status, 'native-followup-required');
  assert.equal(result.target, '/root/owner');
  assert.equal(result.message, '[Emeth completion: tests]\ntests ready');
  assert.deepEqual(f.queue(), []);
  await f.create().perform('ack', { parent: 'parent', task: 'tests' });
  assert.equal((await f.create().perform('notify', { parent: 'parent', task: 'tests', message: 'tests ready' })).status, 'acknowledged');
});

test('an unacknowledged completion remains queued and retries do not duplicate it', async t => {
  const f = fixture(t);
  const results = await Promise.all([1, 2].map(() => f.create().perform('notify', { parent: 'parent', task: 'a', message: 'done' })));
  assert.equal(f.queue().length, 1);
  assert.equal(results[0].queuedSubmissionId, results[1].queuedSubmissionId);
});

test('completion retries recover the lock of an exited notifier and still support acknowledgement', async t => {
  const f = fixture(t);
  const source = `
    const { CompletionNotifications } = require(process.argv[1]);
    new CompletionNotifications({ directory: process.argv[2], request: async () => process.exit(0) })
      .perform('notify', { parent: 'parent', task: 'interrupted', message: 'done' });
  `;
  execFileSync(process.execPath, ['-e', source,
    require.resolve('../plugins/emeth-discipline/lib/subagent-completion'), f.create().directory], { windowsHide: true });
  const result = await f.create().perform('notify', { parent: 'parent', task: 'interrupted', message: 'done' });
  assert.equal(result.status, 'registered');
  assert.equal(f.queue().length, 1);
  assert.equal((await f.create().perform('ack', { parent: 'parent', task: 'interrupted' })).deleted, 1);
  assert.deepEqual(f.queue(), []);
});

test('proxy launch failure preserves the original executable path and ENOENT', async t => {
  const f = fixture(t);
  const binary = path.join(f.create().directory, 'missing-codex.exe');
  await assert.rejects(connect({ binary }), error => error.code === 'ENOENT' && error.path === binary);
});

test('proxy startup failure retains its stderr diagnostic', async t => {
  const f = fixture(t);
  const preload = path.join(f.create().directory, 'failed-proxy.cjs');
  fs.writeFileSync(preload, "require('node:fs').writeSync(2, 'fixture proxy startup failure\\n'); process.exit(23);\n");
  await assert.rejects(connect({ binary: process.execPath,
    env: { ...process.env, NODE_OPTIONS: '--require ' + JSON.stringify(preload.split(path.sep).join('/')) },
  }), /fixture proxy startup failure/);
});

test('RPC initialization and later requests complete through the proxy transport', async t => {
  const f = fixture(t), directory = f.create().directory;
  const preload = path.join(directory, 'proxy.mjs');
  fs.writeFileSync(preload, `
    import { createRequire } from 'node:module';
    const require = createRequire(import.meta.url);
    const http = require('node:http'), net = require('node:net');
    const { WebSocketServer } = require(${JSON.stringify(require.resolve('ws'))});
    const server = http.createServer();
    const sockets = new WebSocketServer({ server });
    sockets.on('connection', socket => {
      let initialized = false;
      socket.on('message', bytes => {
        const message = JSON.parse(bytes);
        if (message.method === 'initialized') { initialized = true; return; }
        socket.send(JSON.stringify({ id: message.id, result: message.method === 'initialize' ? {} : { initialized, params: message.params } }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const stream = net.connect(server.address().port, '127.0.0.1');
      process.stdin.pipe(stream); stream.pipe(process.stdout);
    });
    await new Promise(() => {});
  `);
  const rpc = await connect({ binary: process.execPath,
    env: { ...process.env, NODE_OPTIONS: '--import ' + JSON.stringify(pathToFileURL(preload).href) },
  });
  try {
    assert.deepEqual(await rpc.request('fixture/echo', { text: 'kept' }), { initialized: true, params: { text: 'kept' } });
  } finally { rpc.close(); }
});

test('reopening state preserves an early receipt and suppresses later registration', async t => {
  const f = fixture(t);
  await f.create().perform('ack', { parent: 'parent', task: 'a' });
  assert.equal((await f.create().perform('notify', { parent: 'parent', task: 'a', message: 'done' })).status, 'acknowledged');
  assert.deepEqual(f.queue(), []);
});

test('the same assignment name in another parent keeps its own wake-up', async t => {
  const f = fixture(t), inbox = f.create();
  await inbox.perform('notify', { parent: 'first', task: 'a', message: 'done' });
  await inbox.perform('notify', { parent: 'second', task: 'a', message: 'done' });
  await inbox.perform('ack', { parent: 'first', task: 'a' });
  assert.equal(f.queue().length, 1);
  assert.equal(f.queue()[0].threadId, 'second');
});

test('a failed cancellation keeps the completion available for a later acknowledgement', async t => {
  const f = fixture(t);
  await f.create().perform('notify', { parent: 'parent', task: 'a', message: 'done' });
  const failing = new CompletionNotifications({ directory: f.create().directory, request: async (method, params) => {
    if (method === 'thread/queue/delete') throw new Error('Connection lost');
    return f.request(method, params);
  } });
  await assert.rejects(failing.perform('ack', { parent: 'parent', task: 'a' }), /Connection lost/);
  assert.equal(f.queue().length, 1);
  assert.equal((await f.create().perform('ack', { parent: 'parent', task: 'a' })).deleted, 1);
  assert.deepEqual(f.queue(), []);
});

test('a lost registration response is recovered without sending a second completion', async t => {
  const f = fixture(t);
  const failing = new CompletionNotifications({ directory: f.create().directory, request: async (method, params) => {
    const result = await f.request(method, params);
    if (method === 'thread/queue/add') throw new Error('Response lost');
    return result;
  } });
  await assert.rejects(failing.perform('notify', { parent: 'parent', task: 'a', message: 'done' }), /Response lost/);
  await f.create().perform('notify', { parent: 'parent', task: 'a', message: 'done' });
  assert.equal(f.queue().length, 1);
  assert.equal((await f.create().perform('ack', { parent: 'parent', task: 'a' })).deleted, 1);
});
