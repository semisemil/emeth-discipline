const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const test = require('node:test');

const {
  dashboardDirectory,
  inspectServer,
  stopServer,
} = require('../dashboard/control');

const { composeEmethPrompt } = require('../lib/rules-prompt');

const repoRoot = path.resolve(__dirname, '..');
const hookPath = path.join(repoRoot, 'hooks', 'run.js');

function isolatedEnvironment(root) {
  return {
    ...process.env,
    PLUGIN_DATA: path.join(root, 'plugin-data'),
    APPDATA: path.join(root, 'appdata'),
    HOME: path.join(root, 'home'),
    USERPROFILE: path.join(root, 'home'),
    XDG_CONFIG_HOME: path.join(root, 'config'),
  };
}

test('all four SessionStart sources reuse one server without project mutation', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-hook-server-'));
  const project = path.join(root, 'project');
  const env = isolatedEnvironment(root);
  const directory = dashboardDirectory({ env });
  fs.mkdirSync(project, { recursive: true });
  t.after(async () => {
    await stopServer({ directory });
    fs.rmSync(root, { recursive: true, force: true });
  });
  const instanceIds = [];

  for (const source of ['startup', 'resume', 'clear', 'compact']) {
    const result = spawnSync(process.execPath, [hookPath], {
      encoding: 'utf8',
      env,
      input: JSON.stringify({
        cwd: project,
        hook_event_name: 'SessionStart',
        source,
      }),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout ? JSON.parse(result.stdout).hookSpecificOutput.additionalContext : '',
      source === 'resume' ? '' : composeEmethPrompt());
    const status = await inspectServer({ directory });
    assert.equal(status.status, 'running');
    instanceIds.push(status.instance_id);
  }

  assert.equal(new Set(instanceIds).size, 1);
  assert.equal(fs.existsSync(path.join(project, '.emeth')), false);
  assert.equal(fs.existsSync(path.join(directory, 'projects.json')), false);
});

test('Windows PowerShell hook closes its output while the dashboard stays running', {
  skip: process.platform !== 'win32',
}, async (testContext) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "emeth powershell '한글-"));
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  const env = { ...isolatedEnvironment(root), PLUGIN_ROOT: repoRoot };
  const directory = dashboardDirectory({ env });
  testContext.after(async () => {
    await stopServer({ directory });
    fs.rmSync(root, { recursive: true, force: true });
  });
  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'hooks/codex-hooks.json'), 'utf8'));
  const command = config.hooks.SessionStart[0].hooks[0].commandWindows;
  const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], {
    env,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('PowerShell hook output did not close.')), 5000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => { clearTimeout(timer); resolve(code); });
    child.stdin.end(JSON.stringify({ cwd: root, hook_event_name: 'SessionStart', source: 'startup' }));
  });

  assert.equal(exitCode, 0, stderr);
  assert.equal(stderr, '');
  assert.equal(JSON.parse(stdout).hookSpecificOutput.additionalContext, composeEmethPrompt());
  assert.equal((await inspectServer({ directory })).status, 'running');
  assert.equal(fs.readdirSync(directory).some((name) => /^server-start-/.test(name)), false);
});

test('hook registration covers SessionStart only and all sources', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, '.codex-plugin/plugin.json'), 'utf8'));
  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, manifest.hooks), 'utf8'));
  const entry = config.hooks.SessionStart.find((candidate) => candidate.hooks.some((hook) => (
    hook.command.includes('run.js')
  )));

  assert.equal(entry.matcher, 'startup|resume|clear|compact');
  assert.equal(config.hooks.SessionEnd, undefined);
  assert.equal(entry.hooks[0].commandWindows.includes('run.js'), true);
});

test('benchmark mode completes without starting a dashboard server', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-hook-benchmark-'));
  const env = {
    ...isolatedEnvironment(root),
    EMETH_BENCHMARK_DISABLE_DASHBOARD: '1',
  };
  const directory = dashboardDirectory({ env });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [hookPath], {
    encoding: 'utf8',
    env,
    input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: root }),
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, composeEmethPrompt());
  assert.equal((await inspectServer({ directory })).status, 'stopped');
  assert.equal(fs.existsSync(directory), false);
});

test('startup replaces an expired lock whose owner PID was reused', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-hook-stale-lock-'));
  const project = path.join(root, 'project');
  const env = isolatedEnvironment(root);
  const directory = dashboardDirectory({ env });
  const lockPath = path.join(directory, 'server-start.lock');
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify({
    schema_version: 1,
    instance_id: randomUUID(),
    owner_pid: process.pid,
    started_at: new Date(Date.now() - 60_000).toISOString(),
  }));
  t.after(async () => {
    await stopServer({ directory });
    fs.rmSync(root, { recursive: true, force: true });
  });

  const result = spawnSync(process.execPath, [hookPath], {
    encoding: 'utf8',
    env,
    input: JSON.stringify({
      cwd: project,
      hook_event_name: 'SessionStart',
      source: 'startup',
    }),
  });
  const status = await inspectServer({ directory });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, composeEmethPrompt());
  assert.equal(status.status, 'running');
  assert.equal(fs.existsSync(path.join(directory, 'server.json')), true);
  assert.equal(fs.existsSync(lockPath), false);
});
