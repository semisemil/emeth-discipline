const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const hookPath = path.join(repoRoot, 'hooks', 'run.js');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-mode-'));
  const configRoot = path.join(root, 'config');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root,
    env: {
      ...process.env,
      EMETH_BENCHMARK_DISABLE_DASHBOARD: '1',
      APPDATA: configRoot,
      XDG_CONFIG_HOME: configRoot,
      PLUGIN_DATA: path.join(root, 'plugin-data'),
      HOME: path.join(root, 'home'),
      USERPROFILE: path.join(root, 'home'),
    },
  };
}

function runHook(env, prompt, sessionId = 'session-a') {
  return spawnSync(process.execPath, [hookPath], {
    encoding: 'utf8',
    env,
    input: JSON.stringify({
      hook_event_name: 'UserPromptSubmit',
      session_id: sessionId,
      cwd: path.dirname(env.PLUGIN_DATA),
      turn_id: 'turn-1',
      prompt,
    }),
  });
}

function statePath(env, sessionId = 'session-a') {
  return path.join(env.PLUGIN_DATA, 'rules-mode', `${sessionId}.json`);
}

test('retired mode commands and namespaced skill calls emit zero stdout bytes and create no mode state', (t) => {
  const { env } = fixture(t);
  const ordinary = runHook(env, '$emeth-discipline focus\nPlease review this file.');
  assert.equal(ordinary.status, 0, ordinary.stderr);
  assert.equal(Buffer.byteLength(ordinary.stdout), 0);
  assert.equal(fs.existsSync(statePath(env)), false);

  const skill = runHook(env, '$emeth-discipline:implementation-spec\nWrite a Spec.');
  assert.equal(skill.status, 0, skill.stderr);
  assert.equal(Buffer.byteLength(skill.stdout), 0);
  assert.equal(fs.existsSync(statePath(env)), false);
});
