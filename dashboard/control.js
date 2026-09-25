#!/usr/bin/env node

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const HOST = '127.0.0.1';
const START_TIMEOUT_MS = 5000;
const STOP_TIMEOUT_MS = 3000;
const HEALTH_TIMEOUT_MS = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dashboardDirectory(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const homeDir = options.homeDir || os.homedir();
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const configRoot = platform === 'win32'
    ? (env.APPDATA || pathApi.join(homeDir, 'AppData', 'Roaming'))
    : (env.XDG_CONFIG_HOME || pathApi.join(homeDir, '.config'));
  return pathApi.join(configRoot, 'emeth', 'dashboard');
}

function dashboardPaths(options = {}) {
  const directory = options.directory || dashboardDirectory(options);
  return {
    directory,
    lock: path.join(directory, 'server-start.lock'),
    server: path.join(directory, 'server.json'),
    settings: path.join(directory, 'settings.json'),
  };
}

function pluginVersion(options = {}) {
  const manifestPath = options.manifestPath
    || path.join(__dirname, '..', '.codex-plugin', 'plugin.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest || typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error(`Invalid Emeth Discipline plugin version: ${manifestPath}`);
  }
  return manifest.version;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isPort(value) {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

function validServerState(value) {
  return value
    && value.schema_version === 1
    && UUID.test(value.instance_id)
    && Number.isInteger(value.pid)
    && value.pid > 0
    && isPort(value.port)
    && typeof value.version === 'string'
    && value.version.length > 0
    && typeof value.started_at === 'string'
    && !Number.isNaN(Date.parse(value.started_at));
}

function readServerState(paths) {
  try {
    const state = readJson(paths.server);
    return validServerState(state)
      ? { ok: true, state }
      : { ok: false, reason: 'server-state-invalid' };
  } catch (error) {
    return error.code === 'ENOENT'
      ? { ok: false, reason: 'stopped' }
      : { ok: false, reason: 'server-state-invalid' };
  }
}

function readSettings(paths) {
  try {
    const settings = readJson(paths.settings);
    if (!settings || settings.schema_version !== 1 || !isPort(settings.port)) {
      return { ok: false, reason: 'settings-invalid' };
    }
    return { ok: true, port: settings.port };
  } catch (error) {
    return error.code === 'ENOENT'
      ? { ok: true, port: 0, firstSelection: true }
      : { ok: false, reason: 'settings-invalid' };
  }
}

function pidExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function health(port, options = {}) {
  const timeoutMs = options.healthTimeoutMs || HEALTH_TIMEOUT_MS;
  return new Promise((resolve) => {
    const request = http.get({
      host: HOST,
      port,
      path: '/api/v1/health',
      family: 4,
      timeout: timeoutMs,
      headers: { Host: `${HOST}:${port}` },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          const value = JSON.parse(body);
          resolve({
            ok: response.statusCode === 200
              && value
              && value.schema_version === 1
              && UUID.test(value.instance_id)
              && typeof value.version === 'string',
            value,
          });
        } catch {
          resolve({ ok: false });
        }
      });
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve({ ok: false }));
  });
}

function serverUrl(port, expectedVersion) {
  const url = new URL(`http://${HOST}:${port}/`);
  if (expectedVersion !== undefined) {
    url.searchParams.set('expected_version', expectedVersion);
  }
  return url.toString();
}

async function inspectServer(options = {}) {
  const paths = dashboardPaths(options);
  const expectedVersion = options.expectedVersion || pluginVersion(options);
  const stateResult = readServerState(paths);
  if (!stateResult.ok) {
    return {
      ok: true,
      status: 'stopped',
      reason: stateResult.reason,
      expected_version: expectedVersion,
    };
  }
  const state = stateResult.state;
  if (!pidExists(state.pid)) {
    return {
      ok: true,
      status: 'stopped',
      reason: 'pid-not-running',
      expected_version: expectedVersion,
    };
  }
  const healthResult = await health(state.port, options);
  if (!healthResult.ok) {
    return {
      ok: true,
      status: 'stopped',
      reason: 'health-unavailable',
      expected_version: expectedVersion,
    };
  }
  if (healthResult.value.instance_id !== state.instance_id) {
    return {
      ok: true,
      status: 'stopped',
      reason: 'instance-mismatch',
      expected_version: expectedVersion,
    };
  }
  return {
    ok: true,
    status: 'running',
    instance_id: state.instance_id,
    pid: state.pid,
    port: state.port,
    version: healthResult.value.version,
    expected_version: expectedVersion,
    version_mismatch: healthResult.value.version !== expectedVersion,
    url: serverUrl(state.port),
  };
}

function unlinkIfExists(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

function removeStateForInstance(paths, instanceId) {
  try {
    const current = readJson(paths.server);
    if (current && current.instance_id === instanceId) {
      unlinkIfExists(paths.server);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      unlinkIfExists(paths.server);
    }
  }
}

function readLock(paths) {
  try {
    const value = readJson(paths.lock);
    if (!value
        || !UUID.test(value.instance_id)
        || !Number.isInteger(value.owner_pid)
        || typeof value.started_at !== 'string'
        || Number.isNaN(Date.parse(value.started_at))) {
      return { ok: false };
    }
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

function acquireLock(paths, instanceId) {
  fs.mkdirSync(paths.directory, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = fs.openSync(paths.lock, 'wx');
      fs.writeFileSync(descriptor, JSON.stringify({
        schema_version: 1,
        instance_id: instanceId,
        owner_pid: process.pid,
        started_at: new Date().toISOString(),
      }), 'utf8');
      fs.closeSync(descriptor);
      return { ok: true };
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
      const current = readLock(paths);
      if (current.ok) {
        const age = Math.abs(Date.now() - Date.parse(current.value.started_at));
        if (age < START_TIMEOUT_MS && pidExists(current.value.owner_pid)) {
          return { ok: false, reason: 'start-in-progress' };
        }
      }
      if (!current.ok) {
        try {
          const age = Date.now() - fs.statSync(paths.lock).mtimeMs;
          if (age < START_TIMEOUT_MS) {
            return { ok: false, reason: 'start-in-progress' };
          }
        } catch (statError) {
          if (statError.code === 'ENOENT') {
            continue;
          }
          throw statError;
        }
      }
      unlinkIfExists(paths.lock);
    }
  }
  return { ok: false, reason: 'start-in-progress' };
}

function releaseLock(paths, instanceId) {
  const current = readLock(paths);
  if (current.ok && current.value.instance_id === instanceId) {
    unlinkIfExists(paths.lock);
  }
}

function waitForChild(child, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, reason: 'start-timeout' }), timeoutMs);
    child.once('message', (message) => finish(message));
    child.once('error', (error) => finish({ ok: false, reason: 'start-failed', message: error.message }));
    child.once('exit', (code) => finish({ ok: false, reason: 'start-failed', exit_code: code }));
  });
}

async function startServer(options = {}) {
  const paths = dashboardPaths(options);
  const expectedVersion = options.expectedVersion || pluginVersion(options);
  const before = await inspectServer({ ...options, expectedVersion });
  if (before.status === 'running') {
    return { ...before, action: 'reused' };
  }

  const instanceId = randomUUID();
  const lockResult = acquireLock(paths, instanceId);
  if (!lockResult.ok) {
    const duringRace = await inspectServer({ ...options, expectedVersion });
    return duringRace.status === 'running'
      ? { ...duringRace, action: 'reused' }
      : { ok: false, status: 'stopped', reason: 'start-in-progress', expected_version: expectedVersion };
  }

  try {
    const afterLock = await inspectServer({ ...options, expectedVersion });
    if (afterLock.status === 'running') {
      releaseLock(paths, instanceId);
      return { ...afterLock, action: 'reused' };
    }
    const settings = readSettings(paths);
    if (!settings.ok) {
      releaseLock(paths, instanceId);
      return { ok: false, status: 'stopped', reason: settings.reason, expected_version: expectedVersion };
    }
    unlinkIfExists(paths.server);

    const serverScript = options.serverScript || path.join(__dirname, 'server.js');
    const args = [
      serverScript,
      '--directory', paths.directory,
      '--instance-id', instanceId,
      '--port', String(settings.port),
      '--version', expectedVersion,
    ];
    if (settings.firstSelection) {
      args.push('--save-port');
    }
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      windowsHide: true,
    });
    fs.writeFileSync(paths.lock, JSON.stringify({
      schema_version: 1,
      instance_id: instanceId,
      owner_pid: child.pid,
      started_at: new Date().toISOString(),
    }), 'utf8');
    const result = await waitForChild(child, options.startTimeoutMs || START_TIMEOUT_MS);
    child.unref();
    if (!result.ok) {
      try {
        child.kill();
      } catch {
        // The child may already have exited.
      }
      removeStateForInstance(paths, instanceId);
      releaseLock(paths, instanceId);
      return {
        ok: false,
        status: 'stopped',
        reason: result.reason || 'start-failed',
        expected_version: expectedVersion,
      };
    }
    return {
      ok: true,
      status: 'running',
      action: 'started',
      instance_id: instanceId,
      pid: result.pid,
      port: result.port,
      version: expectedVersion,
      expected_version: expectedVersion,
      version_mismatch: false,
      url: serverUrl(result.port),
    };
  } catch (error) {
    releaseLock(paths, instanceId);
    throw error;
  }
}

function defaultBrowserLauncher(url) {
  let command;
  let args;
  if (process.platform === 'win32') {
    command = 'rundll32.exe';
    args = ['url.dll,FileProtocolHandler', url];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

async function openDashboard(options = {}) {
  const result = await inspectServer(options);
  if (result.status !== 'running') {
    return { ...result, ok: false, action: 'unchanged' };
  }
  const url = serverUrl(result.port, result.expected_version);
  await (options.browserLauncher || defaultBrowserLauncher)(url);
  return { ...result, action: 'opened', url };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function stopServer(options = {}) {
  const paths = dashboardPaths(options);
  const before = await inspectServer(options);
  if (before.status !== 'running') {
    return { ...before, action: 'unchanged' };
  }
  process.kill(before.pid, 'SIGTERM');
  const deadline = Date.now() + (options.stopTimeoutMs || STOP_TIMEOUT_MS);
  while (Date.now() < deadline) {
    if (!pidExists(before.pid)) {
      removeStateForInstance(paths, before.instance_id);
      return {
        ok: true,
        status: 'stopped',
        action: 'stopped',
        instance_id: before.instance_id,
        expected_version: before.expected_version,
      };
    }
    await delay(25);
  }
  return {
    ok: false,
    status: 'running',
    action: 'unchanged',
    reason: 'stop-timeout',
    instance_id: before.instance_id,
    pid: before.pid,
    expected_version: before.expected_version,
  };
}

async function runCli(argv = process.argv.slice(2), options = {}) {
  if (argv.length !== 1 || !['start', 'open', 'status', 'stop'].includes(argv[0])) {
    return { exitCode: 2, error: 'Usage: node dashboard/control.js <start|open|status|stop>' };
  }
  const command = argv[0];
  let result;
  if (command === 'start') {
    result = await startServer(options);
  } else if (command === 'open') {
    result = await openDashboard(options);
  } else if (command === 'status') {
    result = await inspectServer(options);
  } else {
    result = await stopServer(options);
  }
  return { exitCode: result.ok ? 0 : 1, result: { command, ...result } };
}

if (require.main === module) {
  runCli().then(({ exitCode, result, error }) => {
    if (result) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else {
      process.stderr.write(`${error}\n`);
    }
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write(`Emeth Discipline dashboard control failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  HOST,
  dashboardDirectory,
  dashboardPaths,
  health,
  inspectServer,
  openDashboard,
  pluginVersion,
  serverUrl,
  startServer,
  stopServer,
};
