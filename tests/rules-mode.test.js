const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { composeEmethPrompt } = require('../lib/rules-prompt.js');

const repoRoot = path.resolve(__dirname, '..');
const hookPath = path.join(repoRoot, 'hooks', 'run.js');
const loaderPath = path.join(repoRoot, 'hooks', 'run.js');

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

function runLoader(env, sessionId = 'session-a') {
  return spawnSync(process.execPath, [loaderPath], {
    encoding: 'utf8',
    env,
    input: JSON.stringify({
      hook_event_name: 'SessionStart',
      session_id: sessionId,
      cwd: path.dirname(env.PLUGIN_DATA),
      source: 'startup',
    }),
  });
}

function output(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function statePath(env, sessionId = 'session-a') {
  return path.join(env.PLUGIN_DATA, 'rules-mode', `${sessionId}.json`);
}

test('ordinary prompts and namespaced skill calls emit zero stdout bytes and keep state unchanged', (t) => {
  const { env } = fixture(t);
  const ordinary = runHook(env, 'Please review this file.');
  assert.equal(ordinary.status, 0, ordinary.stderr);
  assert.equal(Buffer.byteLength(ordinary.stdout), 0);
  assert.equal(fs.existsSync(statePath(env)), false);

  const skill = runHook(env, '$emeth-discipline:implementation-spec\nWrite a Spec.');
  assert.equal(skill.status, 0, skill.stderr);
  assert.equal(Buffer.byteLength(skill.stdout), 0);
  assert.equal(fs.existsSync(statePath(env)), false);
});

test('status and default queries report canonical modes without changing state', (t) => {
  const { env } = fixture(t);
  let response = output(runHook(env, '$emeth-discipline'));
  assert.match(response.systemMessage, /현재 모드 normal, 기본 모드 normal/);
  assert.equal(response.hookSpecificOutput, undefined);
  assert.equal(fs.existsSync(statePath(env)), false);

  output(runHook(env, '$emeth-discipline focus'));
  const before = fs.readFileSync(statePath(env), 'utf8');

  response = output(runHook(env, '$emeth-discipline default'));
  assert.match(response.systemMessage, /기본 모드 normal/);
  assert.equal(response.hookSpecificOutput, undefined);
  assert.equal(fs.readFileSync(statePath(env), 'utf8'), before);
});

test('mode changes are ASCII case-insensitive and emit the SessionStart prompt', (t) => {
  const { env } = fixture(t);
  const response = output(runHook(env, '\n  $emeth-discipline FoCuS  '));
  assert.match(response.systemMessage, /focus/);
  const prompt = response.hookSpecificOutput.additionalContext;
  assert.equal(prompt, composeEmethPrompt('focus'));
  const loaded = runLoader(env);
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.equal(prompt, JSON.parse(loaded.stdout).hookSpecificOutput.additionalContext);
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath(env), 'utf8')), { mode: 'focus' });
});

test('a valid command is applied before the remaining task', (t) => {
  const { env } = fixture(t);
  const response = output(runHook(env, '$emeth-discipline core\nDiagnose the failing test.'));
  assert.equal(response.hookSpecificOutput.additionalContext, composeEmethPrompt('core'));
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath(env), 'utf8')), { mode: 'core' });
});

for (const mode of ['normal', 'focus', 'core']) {
  test(`reselecting ${mode} keeps the mode without reinjecting the prompt`, (t) => {
    const { env } = fixture(t);
    output(runLoader(env));
    output(runHook(env, `$emeth-discipline ${mode}`));
    const response = output(runHook(env, `$emeth-discipline ${mode.toUpperCase()}\nContinue the task.`));
    assert.match(response.systemMessage, new RegExp(`현재 모드 ${mode} 유지`));
    assert.equal(response.hookSpecificOutput, undefined);
    assert.deepEqual(JSON.parse(fs.readFileSync(statePath(env), 'utf8')), { mode });
  });
}

test('saving the current mode as default persists it without reinjection, including repeated saves', (t) => {
  const { env } = fixture(t);
  output(runHook(env, '$emeth-discipline focus'));
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = output(runHook(env, '$emeth-discipline default focus'));
    assert.match(response.systemMessage, /기본 모드 focus 저장, 현재 모드 focus 유지/);
    assert.equal(response.hookSpecificOutput, undefined);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(env.APPDATA, 'emeth', 'config.json'), 'utf8')), { defaultMode: 'focus' });
    assert.deepEqual(JSON.parse(fs.readFileSync(statePath(env), 'utf8')), { mode: 'focus' });
  }
  const loaded = output(runLoader(env, 'new-session'));
  assert.equal(loaded.hookSpecificOutput.additionalContext, composeEmethPrompt('focus'));
});

test('reselecting the saved default still injects when the current session mode differs', (t) => {
  const { env } = fixture(t);
  output(runHook(env, '$emeth-discipline default core'));
  output(runHook(env, '$emeth-discipline focus'));
  const response = output(runHook(env, '$emeth-discipline default core'));
  assert.equal(response.hookSpecificOutput.additionalContext, composeEmethPrompt('core'));
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath(env), 'utf8')), { mode: 'core' });
});

test('reselecting an unchanged mode still reports persistence failures', (t) => {
  const { root, env } = fixture(t);
  output(runLoader(env));
  const blocked = path.join(root, 'blocked');
  fs.writeFileSync(blocked, 'file');
  const currentFailure = output(runHook({ ...env, PLUGIN_DATA: blocked }, '$emeth-discipline normal'));
  assert.match(currentFailure.systemMessage, /현재 모드 변경 실패/);
  assert.equal(currentFailure.hookSpecificOutput, undefined);
  const defaultFailure = output(runHook({ ...env, APPDATA: blocked, XDG_CONFIG_HOME: blocked }, '$emeth-discipline default normal'));
  assert.match(defaultFailure.systemMessage, /기본 모드 저장 실패/);
  assert.equal(defaultFailure.hookSpecificOutput, undefined);
});

test('invalid modes, missing shapes, and extra arguments preserve the current mode and continue work', (t) => {
  const { env } = fixture(t);
  output(runHook(env, '$emeth-discipline focus'));
  const invalidPrompts = [
    '$emeth-discipline verbose\nKeep reviewing.',
    '$emeth-discipline caveman\nKeep reviewing.',
    '$emeth-discipline default caveman\nKeep reviewing.',
    '$emeth-discipline focus extra\nKeep reviewing.',
    '$emeth-discipline default focus extra\nKeep reviewing.',
  ];

  for (const prompt of invalidPrompts) {
    const response = output(runHook(env, prompt));
    assert.match(response.systemMessage, /잘못된 명령/);
    assert.doesNotMatch(response.systemMessage, /\r|\n/);
    assert.equal(response.hookSpecificOutput, undefined);
    assert.deepEqual(JSON.parse(fs.readFileSync(statePath(env), 'utf8')), { mode: 'focus' });
  }
});

test('saved caveman preferences load and report as core for existing and new sessions', (t) => {
  const { env } = fixture(t);
  const configPath = path.join(env.APPDATA, 'emeth', 'config.json');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.mkdirSync(path.dirname(statePath(env)), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ defaultMode: 'caveman' }));
  fs.writeFileSync(statePath(env), JSON.stringify({ mode: 'caveman' }));

  const response = output(runHook(env, '$emeth-discipline'));
  assert.match(response.systemMessage, /현재 모드 core, 기본 모드 core/);
  for (const sessionId of ['session-a', 'session-b']) {
    const loaded = runLoader(env, sessionId);
    assert.equal(loaded.status, 0, loaded.stderr);
    assert.equal(JSON.parse(loaded.stdout).hookSpecificOutput.additionalContext, composeEmethPrompt('core'));
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath(env, 'session-b'), 'utf8')), { mode: 'core' });
});

test('default changes persist first and immediately apply to the current session', (t) => {
  const { env } = fixture(t);
  const response = output(runHook(env, '$emeth-discipline default CORE'));
  assert.match(response.systemMessage, /기본 모드와 현재 모드를 core/);
  assert.equal(response.hookSpecificOutput.additionalContext, composeEmethPrompt('core'));
  const loaded = runLoader(env);
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.equal(response.hookSpecificOutput.additionalContext, JSON.parse(loaded.stdout).hookSpecificOutput.additionalContext);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(env.APPDATA, 'emeth', 'config.json'), 'utf8')),
    { defaultMode: 'core' },
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath(env), 'utf8')), { mode: 'core' });

  output(runHook(env, '$emeth-discipline focus', 'session-b'));
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath(env, 'session-b'), 'utf8')), { mode: 'focus' });
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath(env), 'utf8')), { mode: 'core' });
});

for (const [label, sessionId] of [
  ['empty', ''],
  ['oversized', 'a'.repeat(176)],
]) {
  test(`${label} session IDs apply a default change immediately without session state`, (t) => {
    const { env } = fixture(t);
    const changed = output(runHook(env, '$emeth-discipline default focus', sessionId));
    assert.match(changed.systemMessage, /기본 모드와 현재 모드를 focus로 변경/);
    assert.equal(changed.hookSpecificOutput.additionalContext, composeEmethPrompt('focus'));
    assert.equal(fs.existsSync(path.join(env.PLUGIN_DATA, 'rules-mode')), false);

    const queried = output(runHook(env, '$emeth-discipline', sessionId));
    assert.match(queried.systemMessage, /현재 모드 focus, 기본 모드 focus/);
    assert.equal(fs.existsSync(path.join(env.PLUGIN_DATA, 'rules-mode')), false);
  });
}

test('default write failure changes neither mode', (t) => {
  const { root, env } = fixture(t);
  output(runHook(env, '$emeth-discipline focus'));
  const blockedAppData = path.join(root, 'blocked-appdata');
  fs.writeFileSync(blockedAppData, 'file', 'utf8');
  const failedEnv = { ...env, APPDATA: blockedAppData, XDG_CONFIG_HOME: blockedAppData };
  const response = output(runHook(failedEnv, '$emeth-discipline default core'));
  assert.match(response.systemMessage, /기본 모드 저장 실패/);
  assert.equal(response.hookSpecificOutput, undefined);
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath(env), 'utf8')), { mode: 'focus' });
});

test('a current-session write failure preserves a successfully saved default and reports partial failure', (t) => {
  const { root, env } = fixture(t);
  const blockedPluginData = path.join(root, 'blocked-plugin-data');
  fs.writeFileSync(blockedPluginData, 'file', 'utf8');
  const failedEnv = { ...env, PLUGIN_DATA: blockedPluginData };
  const response = output(runHook(failedEnv, '$emeth-discipline default focus'));
  assert.match(response.systemMessage, /현재 모드 변경 실패/);
  assert.equal(response.hookSpecificOutput, undefined);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(env.APPDATA, 'emeth', 'config.json'), 'utf8')),
    { defaultMode: 'focus' },
  );
});
