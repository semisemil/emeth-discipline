#!/usr/bin/env node

// Exercise the installed CLI, plugin loader, hook trust, and model-request
// boundary against a local deterministic Responses fixture. No real model or
// credentials are used; all Codex configuration is isolated for this test.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, appendFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, relative } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = join(repoRoot, 'plugins/emeth-discipline');
const root = mkdtempSync(join(tmpdir(), 'emeth-codex-integration-'));
const projectRoot = join(root, 'project');
mkdirSync(projectRoot);
mkdirSync(join(root, 'codex'));
// CODEX_HOME is the CLI's supported per-process configuration location.
const env = { ...process.env, CODEX_HOME: join(root, 'codex'),
  APPDATA: join(root, 'config'), XDG_CONFIG_HOME: join(root, 'config') };
for (const name of ['MIXDOG_PLUGIN_ROOT', 'MIXDOG_PLUGIN_DATA', 'MIXDOG_DATA_DIR', 'MIXDOG_ROOT', 'MIXDOG_HOME',
  'PLUGIN_ROOT', 'PLUGIN_DATA', 'CLAUDE_PLUGIN_ROOT', 'CLAUDE_PLUGIN_DATA']) delete env[name];
const cli = process.argv[2] || 'codex';
const requests = [];
const notifications = [];
let child;
let rpc;
let control;
let stopped = false;

function command(args, json = true) {
  const result = spawnSync(cli, args, { env, cwd: projectRoot, encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return json ? JSON.parse(result.stdout) : result.stdout.trim();
}

function connect() {
  child = spawn(cli, ['app-server', '--stdio'], { env, cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.resume();
  let sequence = 0;
  const pending = new Map();
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    const message = JSON.parse(line);
    if (pending.has(message.id)) {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
      else waiter.resolve(message.result);
    } else if (message.method) notifications.push(message);
  });
  child.on('exit', () => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('Codex app-server exited before responding'));
    }
    pending.clear();
  });
  rpc = (method, params) => new Promise((resolveRpc, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 20_000);
    pending.set(id, { resolve: resolveRpc, reject, timer });
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  });
}

async function disconnect() {
  if (!child || child.exitCode !== null) return;
  const closed = new Promise(resolveExit => child.once('exit', resolveExit));
  child.stdin.end();
  const timer = setTimeout(() => child.kill(), 3000);
  await closed;
  clearTimeout(timer);
}

async function initialize() {
  connect();
  await rpc('initialize', { clientInfo: { name: 'emeth-validation', version: '1.0' }, capabilities: { experimentalApi: true } });
  child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`);
}

async function until(predicate, description) {
  const deadline = Date.now() + 20_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`${description} timed out`);
    await new Promise(resolveWait => setTimeout(resolveWait, 20));
  }
}

const provider = createServer(async (request, response) => {
  try {
    assert.ok(request.url.endsWith('/responses'), request.url);
    assert.equal(request.method, 'POST');
    const parts = [];
    for await (const chunk of request) parts.push(chunk);
    requests.push(JSON.parse(Buffer.concat(parts).toString()));
    const id = `fixture-${requests.length}`;
    const events = [
      { type: 'response.created', response: { id } },
      { type: 'response.output_item.done', item: { type: 'message', role: 'assistant', id: `message-${id}`,
        content: [{ type: 'output_text', text: 'Emeth integration fixture completed.' }] } },
      { type: 'response.completed', response: { id, usage: { input_tokens: 0, input_tokens_details: null,
        output_tokens: 0, output_tokens_details: null, total_tokens: 0 } } },
    ];
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''));
  } catch (error) {
    response.writeHead(500);
    response.end(error.message);
  }
});

try {
  console.log(command(['--version'], false));
  command(['plugin', 'marketplace', 'add', repoRoot, '--json']);
  const installed = command(['plugin', 'add', 'emeth-discipline@emeth-discipline', '--json']);
  const installedRoot = installed.installedPath;
  assert.ok(relative(join(root, 'codex'), installedRoot) && !relative(join(root, 'codex'), installedRoot).startsWith('..'));
  const installedList = command(['plugin', 'list', '--json']).installed;
  assert.equal(installedList.length, 1);
  assert.equal(installedList[0].enabled, true);
  const version = JSON.parse(readFileSync(join(packageRoot, '.codex-plugin/plugin.json'))).version;
  assert.equal(installed.version, version);
  // Validate the exact owned installation before trusting its command hooks.
  for (const file of readdirSync(packageRoot, { recursive: true, withFileTypes: true })) {
    if (!file.isFile()) continue;
    const source = join(file.parentPath, file.name);
    assert.deepEqual(readFileSync(join(installedRoot, relative(packageRoot, source))), readFileSync(source));
  }
  await initialize();
  const listed = (await rpc('skills/list', { cwds: [projectRoot], forceReload: true })).data[0];
  assert.deepEqual(listed.errors || [], []);
  const skills = listed.skills.filter(skill => skill.pluginId === installed.pluginId);
  assert.deepEqual(skills.map(skill => skill.name).sort(),
    readdirSync(join(packageRoot, 'skills')).map(name => `emeth-discipline:${name}`).sort());
  assert.ok(skills.every(skill => skill.enabled && skill.path.startsWith(installedRoot)));
  console.log(`Native Codex installation ${version}: ${skills.length} skills registered`);
  const entry = (await rpc('hooks/list', { cwds: [projectRoot] })).data[0];
  assert.deepEqual(entry.errors, []);
  const hooks = entry.hooks;
  assert.deepEqual(hooks.map(hook => hook.eventName).sort(), ['sessionStart', 'subagentStart', 'userPromptSubmit']);
  for (const hook of hooks) {
    assert.equal(hook.pluginId, installed.pluginId);
    assert.equal(hook.handlerType, 'command');
    assert.equal(hook.command, `node "${installedRoot}/hooks/run.js"`);
    assert.equal(hook.trustStatus, 'untrusted');
    assert.match(hook.currentHash, /^sha256:[a-f0-9]{64}$/);
    // Persist normal digest-specific trust only in this disposable config.
    appendFileSync(join(root, 'codex/config.toml'),
      `\n[hooks.state.${JSON.stringify(hook.key)}]\ntrusted_hash = ${JSON.stringify(hook.currentHash)}\n`);
  }
  await disconnect();
  await new Promise(resolveListen => provider.listen(0, '127.0.0.1', resolveListen));
  appendFileSync(join(root, 'codex/config.toml'), `\n[model_providers.emeth_fixture]\nname = "Emeth fixture"\nbase_url = "http://127.0.0.1:${provider.address().port}/v1"\nwire_api = "responses"\nrequires_openai_auth = false\n`);
  await initialize();
  assert.ok((await rpc('hooks/list', { cwds: [projectRoot] })).data[0].hooks.every(hook => hook.trustStatus === 'trusted'));
  const thread = await rpc('thread/start', { cwd: projectRoot, ephemeral: true, approvalPolicy: 'never',
    sandbox: 'workspace-write', modelProvider: 'emeth_fixture', model: 'gpt-6.1-sol' });
  const skill = skills.find(candidate => candidate.name === 'emeth-discipline:development-design');
  const turn = await rpc('turn/start', { threadId: thread.thread.id, input: [
    { type: 'text', text: '/emeth-discipline:development-design Validate the loaded instructions; do not write files.' },
    { type: 'skill', name: skill.name, path: skill.path },
  ] });
  await until(() => notifications.some(message => message.method === 'turn/completed' && message.params.turn.id === turn.turn.id), 'fixture turn');
  const completed = notifications.find(message => message.method === 'turn/completed' && message.params.turn.id === turn.turn.id);
  assert.equal(completed.params.turn.status, 'completed', JSON.stringify(completed.params.turn.error));
  assert.ok(notifications.some(message => message.method === 'item/completed'
    && message.params.item.type === 'agentMessage'
    && message.params.item.text === 'Emeth integration fixture completed.'),
  'the provider response is returned through the native Codex event stream');
  assert.equal(requests.length, 1);
  const sent = JSON.stringify(requests[0]);
  const sharedRules = readFileSync(join(installedRoot, 'skills/rules/codex.md'), 'utf8').trim();
  assert.ok(sent.includes(JSON.stringify(sharedRules).slice(1, -1)), 'the complete shared baseline reaches Codex');
  assert.ok(sent.includes('Next design number: DESIGN-0001'));
  assert.ok(sent.includes('# Development Design'));
  const runs = notifications.filter(message => message.method === 'hook/completed').map(message => message.params.run);
  assert.ok(runs.length >= 2, 'Codex executes SessionStart and UserPromptSubmit');
  console.log('Native Codex turn: shared rules, document numbering, and selected skill reach the provider boundary');
  control = createRequire(import.meta.url)(join(installedRoot, 'dashboard/control.js'));
  const directory = control.dashboardDirectory({ env });
  assert.equal((await control.inspectServer({ directory })).status, 'stopped');
  let openedUrl;
  const status = await control.openDashboard({ directory, browserLauncher(url) { openedUrl = url; } });
  assert.equal(status.action, 'opened');
  assert.equal(status.status, 'running');
  assert.equal(new URL(openedUrl).port, '43127');
  assert.equal(status.version, version);
  for (const route of ['/api/v1/health', '/', '/dashboard', '/architecture']) {
    const response = await fetch(`http://127.0.0.1:${status.port}${route}`);
    assert.equal(response.status, 200, route);
    assert.ok((await response.text()).length, route);
  }
  await control.stopServer({ directory });
  assert.equal((await control.inspectServer({ directory })).status, 'stopped');
  stopped = true;
  console.log('Native Codex SessionStart leaves dashboard stopped; explicit open and all three pages verified');
} finally {
  await disconnect();
  if (control && !stopped) await control.stopServer({ directory: control.dashboardDirectory({ env }) });
  if (provider.listening) await new Promise(resolveClose => provider.close(resolveClose));
  rmSync(root, { recursive: true, force: true, maxRetries: 10 });
}
