const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { composeProoflinePrompt } = require('../lib/proofline-prompt.js');

const repoRoot = path.resolve(__dirname, '..');
const loaderPath = path.join(repoRoot, 'hooks', 'run.js');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proofline-loader-'));
  const configRoot = path.join(root, 'config');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root,
    env: {
      ...process.env,
      PROOFLINE_BENCHMARK_DISABLE_DASHBOARD: '1',
      APPDATA: configRoot,
      XDG_CONFIG_HOME: configRoot,
      PLUGIN_DATA: path.join(root, 'plugin-data'),
      HOME: path.join(root, 'home'),
      USERPROFILE: path.join(root, 'home'),
    },
  };
}

function runLoader(
  env,
  sessionId,
  source,
  script = loaderPath,
  hookEventName = 'SessionStart',
) {
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env,
    input: JSON.stringify({
      hook_event_name: hookEventName,
      cwd: path.dirname(env.PLUGIN_DATA),
      session_id: sessionId,
      source,
      ...(hookEventName === 'SubagentStart'
        ? { agent_id: 'agent-a', agent_type: 'explorer' }
        : {}),
    }),
  });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value), 'utf8');
}

function context(result) {
  return result.stdout ? JSON.parse(result.stdout).hookSpecificOutput?.additionalContext : '';
}

function copyRuntime(plugin) {
  fs.cpSync(path.join(repoRoot, 'hooks'), path.join(plugin, 'hooks'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'lib'), path.join(plugin, 'lib'), { recursive: true });
  const memory = path.join(plugin, 'skills/architecture-memory/scripts');
  fs.mkdirSync(memory, { recursive: true });
  fs.copyFileSync(path.join(repoRoot, 'skills/architecture-memory/scripts/storage.js'), path.join(memory, 'storage.js'));
}

test('startup inserts normal at the response slot', (t) => {
  const { env } = fixture(t);
  const result = runLoader(env, 'session-a', 'startup');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(context(result), composeProoflinePrompt('normal'));
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(env.PLUGIN_DATA, 'proofline-mode', 'session-a.json'), 'utf8')),
    { mode: 'normal' },
  );
});

test('startup, clear, and compact preserve the stored mode for one session', (t) => {
  const { env } = fixture(t);
  const statePath = path.join(env.PLUGIN_DATA, 'proofline-mode', 'session-a.json');
  writeJson(statePath, { mode: 'focus' });

  for (const source of ['startup', 'clear', 'compact']) {
    const result = runLoader(env, 'session-a', source);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(context(result), composeProoflinePrompt('focus'));
    assert.deepEqual(JSON.parse(fs.readFileSync(statePath, 'utf8')), { mode: 'focus' });
  }
});

test('new session IDs initialize from the latest default without changing existing sessions', (t) => {
  const { env } = fixture(t);
  writeJson(path.join(env.PLUGIN_DATA, 'proofline-mode', 'session-a.json'), { mode: 'core' });
  writeJson(path.join(env.APPDATA, 'proofline', 'config.json'), { defaultMode: 'focus' });

  const existing = runLoader(env, 'session-a', 'startup');
  const fresh = runLoader(env, 'session-b', 'startup');
  assert.equal(existing.status, 0, existing.stderr);
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.equal(context(existing), composeProoflinePrompt('core'));
  assert.equal(context(fresh), composeProoflinePrompt('focus'));
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(env.PLUGIN_DATA, 'proofline-mode', 'session-a.json'), 'utf8')),
    { mode: 'core' },
  );
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(env.PLUGIN_DATA, 'proofline-mode', 'session-b.json'), 'utf8')),
    { mode: 'focus' },
  );
});

test('resume produces no injection and creates no session state', (t) => {
  const { env } = fixture(t);
  const result = runLoader(env, 'session-a', 'resume');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(Buffer.byteLength(result.stdout), 0);
  assert.equal(fs.existsSync(path.join(env.PLUGIN_DATA, 'proofline-mode', 'session-a.json')), false);
});

test('SubagentStart receives the parent session Emeth Discipline mode', (t) => {
  const { env } = fixture(t);
  const statePath = path.join(env.PLUGIN_DATA, 'proofline-mode', 'session-a.json');
  writeJson(statePath, { mode: 'focus' });

  const result = runLoader(env, 'session-a', undefined, loaderPath, 'SubagentStart');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(context(result), composeProoflinePrompt('focus'));
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath, 'utf8')), { mode: 'focus' });
});

test('a missing selected mode fails and records the exact component path', (t) => {
  const { root, env } = fixture(t);
  const tempPlugin = path.join(root, 'plugin');
  const hooksDir = path.join(tempPlugin, 'hooks');
  const skillDir = path.join(tempPlugin, 'skills', 'core');
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.mkdirSync(skillDir, { recursive: true });
  copyRuntime(tempPlugin);
  fs.copyFileSync(path.join(repoRoot, 'skills', 'core', 'SKILL.md'), path.join(skillDir, 'SKILL.md'));

  const result = runLoader(env, 'session-a', 'startup', path.join(hooksDir, 'run.js'));
  assert.equal(result.status, 1);
  const logPath = path.join(env.HOME, '.codex', 'log', 'proofline-hook.log');
  const entries = fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
  assert.match(entries.at(-1).filePath, /core[\\/]normal\.md$/);
});

test('a missing baseline fails and records the exact component path', (t) => {
  const { root, env } = fixture(t);
  const tempPlugin = path.join(root, 'plugin');
  const hooksDir = path.join(tempPlugin, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  copyRuntime(tempPlugin);

  const result = runLoader(env, 'session-a', 'startup', path.join(hooksDir, 'run.js'));
  assert.equal(result.status, 1);

  const logPath = path.join(env.HOME, '.codex', 'log', 'proofline-hook.log');
  const entries = fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
  const entry = entries.at(-1);
  assert.equal(entry.code, 'ENOENT');
  assert.equal(entry.pluginRoot, tempPlugin);
  assert.match(entry.skillPath, /core[\\/]SKILL\.md$/);
  assert.match(entry.filePath, /core[\\/]SKILL\.md$/);
});

test('a missing response slot fails and records the baseline path', (t) => {
  const { root, env } = fixture(t);
  const tempPlugin = path.join(root, 'plugin');
  const hooksDir = path.join(tempPlugin, 'hooks');
  const skillDir = path.join(tempPlugin, 'skills', 'core');
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.mkdirSync(skillDir, { recursive: true });
  copyRuntime(tempPlugin);
  const baseline = fs.readFileSync(path.join(repoRoot, 'skills', 'core', 'SKILL.md'), 'utf8')
    .replace('<!-- proofline-response-mode -->', '');
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), baseline, 'utf8');
  fs.copyFileSync(path.join(repoRoot, 'skills', 'core', 'normal.md'), path.join(skillDir, 'normal.md'));

  const result = runLoader(env, 'session-a', 'startup', path.join(hooksDir, 'run.js'));
  assert.equal(result.status, 1);
  const logPath = path.join(env.HOME, '.codex', 'log', 'proofline-hook.log');
  const entry = JSON.parse(fs.readFileSync(logPath, 'utf8').trim());
  assert.equal(entry.code, 'INVALID_MODE_SLOT');
  assert.match(entry.filePath, /core[\\/]SKILL\.md$/);
});
