'use strict';

const net = require('node:net');
const { spawn } = require('node:child_process');

async function connect({ binary = 'codex', env = process.env, timeoutMs = 10000 } = {}) {
  const pending = new Map();
  let sequence = 0, socket, stream, closed = false, stderr = '';
  const proxy = process.platform === 'win32' && binary === 'codex'
    ? spawn(env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'codex app-server proxy'], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    : spawn(binary, ['app-server', 'proxy'], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const bridge = net.createServer(connection => {
    stream = connection;
    bridge.close();
    connection.pipe(proxy.stdin);
    proxy.stdout.pipe(connection);
    connection.on('error', fail);
  });
  function fail(error) {
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error); }
    pending.clear();
  }
  function close() {
    if (closed) return;
    closed = true;
    fail(new Error('Codex connection closed'));
    socket?.close(); stream?.destroy(); bridge.close();
    proxy.stdin.destroy(); proxy.stdout.destroy(); proxy.kill();
  }
  proxy.stderr.on('data', data => { stderr = (stderr + data).slice(-2000); });
  proxy.on('error', fail);
  proxy.on('exit', code => fail(new Error(`Codex proxy exited (${code}): ${stderr}`)));
  proxy.stdin.on('error', fail);
  try {
    await new Promise((resolve, reject) => { bridge.once('error', reject); bridge.listen(0, '127.0.0.1', resolve); });
    socket = new WebSocket(`ws://127.0.0.1:${bridge.address().port}/`);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Codex connection timed out')), timeoutMs);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Codex connection failed: ' + stderr)); }, { once: true });
    });
    socket.addEventListener('message', event => {
      let message;
      try { message = JSON.parse(event.data); } catch (error) { fail(error); return; }
      if (message.id === undefined || message.method) return;
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id); clearTimeout(item.timer);
      message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result);
    });
    socket.addEventListener('close', () => fail(new Error('Codex connection ended')));
    const request = (method, params) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Codex request timed out: ${method}`)); }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
    await request('initialize', { clientInfo: { name: 'emeth-completion', version: '1' }, capabilities: { experimentalApi: true } });
    socket.send(JSON.stringify({ method: 'initialized', params: {} }));
    return { request, close };
  } catch (error) { close(); throw error; }
}

module.exports = { connect };
