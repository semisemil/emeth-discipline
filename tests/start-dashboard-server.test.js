const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const {
  dashboardDirectory,
  inspectServer,
  stopServer,
} = require('../plugins/emeth-discipline/dashboard/control');

const { composeEmethPrompt } = require('../plugins/emeth-discipline/lib/rules-prompt');

const pluginRoot = path.resolve(__dirname, '../plugins/emeth-discipline');
const processTimeoutMs = 20_000;

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
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', hook.commandWindows], {
    env, windowsHide: true, encoding: 'utf8', timeout: hook.timeout * 1000,
    input: JSON.stringify({ cwd: root, hook_event_name: 'SessionStart', source: 'startup' }),
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, composeEmethPrompt());
  assert.equal((await inspectServer({ directory })).status, 'stopped');
  assert.equal(fs.existsSync(directory), false);
});

test('Windows Node startup closes its output with only Node on PATH', {
  skip: process.platform !== 'win32',
}, (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "emeth node '한글-"));
  const env = isolatedEnvironment(root);
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === 'path') delete env[key];
  }
  env.PATH = path.dirname(process.execPath);
  const directory = dashboardDirectory({ env });
  const controlPath = path.join(pluginRoot, 'dashboard/control.js');
  const cliOptions = { encoding: 'utf8', env, windowsHide: true, timeout: processTimeoutMs };
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
    timeout: processTimeoutMs,
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
