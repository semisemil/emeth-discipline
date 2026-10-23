const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const test = require('node:test');

const {
  dashboardDirectory,
  inspectServer,
  stopServer,
} = require('../plugins/emeth-discipline/dashboard/control');

const { composeEmethPrompt } = require('../plugins/emeth-discipline/lib/rules-prompt');

const pluginRoot = path.resolve(__dirname, '../plugins/emeth-discipline');
const hookPath = path.join(pluginRoot, 'hooks', 'run.js');

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

test('all four SessionStart sources leave the dashboard stopped without creating state', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-hook-server-'));
  const project = path.join(root, 'project');
  const env = isolatedEnvironment(root);
  const directory = dashboardDirectory({ env });
  fs.mkdirSync(project, { recursive: true });
  t.after(async () => {
    await stopServer({ directory });
    fs.rmSync(root, { recursive: true, force: true });
  });
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
    assert.equal(status.status, 'stopped');
    assert.equal(fs.existsSync(directory), false);
  }

  assert.equal(fs.existsSync(path.join(project, '.emeth')), false);
  assert.equal(fs.existsSync(path.join(directory, 'projects.json')), false);
});

test('Windows PowerShell hook closes its output without starting the dashboard', {
  skip: process.platform !== 'win32',
}, async (testContext) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "emeth powershell '한글-"));
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  const env = { ...isolatedEnvironment(root), PLUGIN_ROOT: pluginRoot };
  const directory = dashboardDirectory({ env });
  testContext.after(async () => {
    await stopServer({ directory });
    fs.rmSync(root, { recursive: true, force: true });
  });
  const config = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'hooks/codex-hooks.json'), 'utf8'));
  const hook = config.hooks.SessionStart[0].hooks[0];
  const command = hook.commandWindows;
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
    const timer = setTimeout(() => reject(new Error('PowerShell hook output did not close.')), hook.timeout * 1000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => { clearTimeout(timer); resolve(code); });
    child.stdin.end(JSON.stringify({ cwd: root, hook_event_name: 'SessionStart', source: 'startup' }));
  });

  assert.equal(exitCode, 0, stderr);
  assert.equal(stderr, '');
  assert.equal(JSON.parse(stdout).hookSpecificOutput.additionalContext, composeEmethPrompt());
  assert.equal((await inspectServer({ directory })).status, 'stopped');
  assert.equal(fs.existsSync(directory), false);
});

for (const environment of ['inherited PATH', 'only Node on PATH']) {
  test(`Windows Node startup exits within five seconds and leaves its server running with ${environment}`, {
    skip: process.platform !== 'win32',
  }, (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "emeth node '한글-"));
    const env = isolatedEnvironment(root);
    if (environment === 'only Node on PATH') {
      for (const key of Object.keys(env)) {
        if (key.toLowerCase() === 'path') delete env[key];
      }
      env.PATH = path.dirname(process.execPath);
    }
    const directory = dashboardDirectory({ env });
    const controlPath = path.join(pluginRoot, 'dashboard/control.js');
    const cliOptions = { encoding: 'utf8', env, windowsHide: true, timeout: 5000 };
    t.after(() => {
      const stopped = spawnSync(process.execPath, [controlPath, 'stop'], cliOptions);
      assert.equal(stopped.status, 0, stopped.stderr);
      fs.rmSync(root, { recursive: true, force: true });
    });

    const result = spawnSync(process.execPath, [controlPath, 'start'], cliOptions);

    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    const started = JSON.parse(result.stdout);
    const inspected = spawnSync(process.execPath, [controlPath, 'status'], cliOptions);
    assert.equal(inspected.status, 0, inspected.stderr);
    const status = JSON.parse(inspected.stdout);
    assert.equal(started.action, 'started');
    assert.equal(status.status, 'running');
    assert.equal(status.instance_id, started.instance_id);
    assert.equal(status.port, 43127);
  });
}

test('Windows PowerShell explicit startup closes its output while the dashboard keeps running', {
  skip: process.platform !== 'win32',
}, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "emeth explicit '한글-"));
  const env = isolatedEnvironment(root);
  const directory = dashboardDirectory({ env });
  t.after(async () => {
    await stopServer({ directory });
    fs.rmSync(root, { recursive: true, force: true });
  });

  const controlPath = path.join(pluginRoot, 'dashboard/control.js');
  const quotedControl = `'${controlPath.replace(/'/g, "''")}'`;
  const result = spawnSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `& node ${quotedControl} start`,
  ], {
    encoding: 'utf8',
    env,
    windowsHide: true,
    timeout: 20_000,
  });
  const status = await inspectServer({ directory });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).action, 'started');
  assert.equal(status.status, 'running');
  assert.equal(status.port, 43127);
  assert.equal(fs.existsSync(path.join(directory, 'server.json')), true);
  assert.equal(fs.readdirSync(directory).some((name) => /^server-start-/.test(name)), false);
});
