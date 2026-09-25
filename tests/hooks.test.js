'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { composeEmethPrompt } = require('../lib/rules-prompt');

const repoRoot = path.resolve(__dirname, '..');
const hook = path.join(repoRoot, 'hooks/run.js');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-hooks-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 10 }));
  const env = {
    ...process.env, HOME: root, USERPROFILE: root,
    APPDATA: path.join(root, 'config'), XDG_CONFIG_HOME: path.join(root, 'config'),
    PLUGIN_DATA: path.join(root, 'plugin-data'), EMETH_BENCHMARK_DISABLE_DASHBOARD: '1',
  };
  const write = (name, text) => {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  };
  const memory = () => {
    write('.emeth/architecture.json', JSON.stringify({ schema_version: 1, root: 'docs/architecture' }));
    write('docs/architecture/.architecture-memory/manifest.json', JSON.stringify({ schema_version: 2, managed: true }));
  };
  const run = (event, options = {}) => spawnSync(process.execPath, [options.hook || hook], {
    encoding: 'utf8', windowsHide: true, env: { ...env, ...options.env },
    input: JSON.stringify({ cwd: root, session_id: 'session-a', hook_event_name: 'UserPromptSubmit', ...event }),
  });
  return { root, env, write, memory, run };
}

function output(result) {
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout) : {};
}

test('mode changes and the memory connection share one response without losing either', (t) => {
  const f = fixture(t); f.memory();
  const changed = output(f.run({ prompt: '$emeth-discipline focus' }));
  assert.match(changed.systemMessage, /focus/);
  assert.ok(changed.hookSpecificOutput.additionalContext.startsWith(composeEmethPrompt('focus') + '\n\n'));
  assert.match(changed.hookSpecificOutput.additionalContext, /architecture-dependent work/);
  assert.deepEqual(output(f.run({ prompt: 'Continue.' })), {});
  const next = output(f.run({ prompt: '$emeth-discipline core' }));
  assert.equal(next.hookSpecificOutput.additionalContext, composeEmethPrompt('core'));
});

test('numbering and memory notices compose independently, including a failed number lookup', (t) => {
  const f = fixture(t); f.memory();
  const response = output(f.run({ prompt: '$emeth-discipline:development-design' }));
  assert.match(response.hookSpecificOutput.additionalContext, /^Next design number: DESIGN-0001\n\nWhile /);
  f.write('.emeth/issues', 'This is not a directory.');
  const fallback = output(f.run({ session_id: 'session-b', prompt: '$emeth-discipline:issue-ledger' }));
  assert.match(fallback.hookSpecificOutput.additionalContext, /^While /);
  assert.doesNotMatch(fallback.hookSpecificOutput.additionalContext, /Next issue/);
});

test('startup, resume, compact and subagents keep their prompt and memory lifecycle boundaries', (t) => {
  const f = fixture(t); f.memory();
  output(f.run({ prompt: '$emeth-discipline focus' }));
  const start = output(f.run({ hook_event_name: 'SessionStart', source: 'startup' }));
  assert.ok(start.hookSpecificOutput.additionalContext.startsWith(composeEmethPrompt('focus') + '\n\n'));
  assert.deepEqual(output(f.run({ hook_event_name: 'SessionStart', source: 'resume' })), {});
  const compact = output(f.run({ hook_event_name: 'SessionStart', source: 'compact' }));
  assert.equal(compact.hookSpecificOutput.additionalContext, start.hookSpecificOutput.additionalContext);
  const child = output(f.run({ hook_event_name: 'SubagentStart', agent_id: 'agent-a' }));
  assert.equal(child.hookSpecificOutput.additionalContext, start.hookSpecificOutput.additionalContext);
  assert.equal(fs.existsSync(path.join(f.env.PLUGIN_DATA, 'execution-guard')), false);
});

test('a corrupt memory binding does not suppress a mode change or document number', (t) => {
  const f = fixture(t);
  f.write('.emeth/architecture.json', '{');
  const result = f.run({ prompt: '$emeth-discipline focus' });
  assert.equal(output(result).hookSpecificOutput.additionalContext, composeEmethPrompt('focus'));
  assert.match(result.stderr, /Architecture memory connection unavailable/);
  const number = output(f.run({ prompt: '$emeth-discipline:development-design' }));
  assert.equal(number.hookSpecificOutput.additionalContext, 'Next design number: DESIGN-0001');
});

function copyPlugin(f) {
  const plugin = path.join(f.root, 'plugin');
  for (const directory of ['hooks', 'lib', 'skills/rules', 'skills/architecture-memory']) {
    fs.cpSync(path.join(repoRoot, directory), path.join(plugin, directory), { recursive: true });
  }
  return plugin;
}

test('dashboard startup failure leaves the prompt and memory available', (t) => {
  const f = fixture(t); f.memory();
  const plugin = copyPlugin(f);
  f.write('plugin/dashboard/control.js', 'exports.startServer = async () => { throw new Error("dashboard unavailable"); };');
  const result = f.run({ hook_event_name: 'SessionStart', source: 'startup' }, {
    hook: path.join(plugin, 'hooks/run.js'), env: { EMETH_BENCHMARK_DISABLE_DASHBOARD: '0' },
  });
  const response = output(result);
  assert.ok(response.hookSpecificOutput.additionalContext.startsWith(composeEmethPrompt('normal', { pluginRoot: plugin }) + '\n\n'));
  assert.match(response.hookSpecificOutput.additionalContext, /architecture-dependent work/);
  assert.match(result.stderr, /dashboard unavailable/);
});

test('a prompt failure reports the error without consuming an undelivered memory notice', (t) => {
  const f = fixture(t); f.memory();
  const plugin = copyPlugin(f);
  fs.unlinkSync(path.join(plugin, 'skills/rules/normal.md'));
  const result = f.run({ hook_event_name: 'SessionStart', source: 'startup' }, { hook: path.join(plugin, 'hooks/run.js') });
  const response = output(result);
  assert.match(response.systemMessage, /Emeth Discipline prompt unavailable/);
  assert.match(response.hookSpecificOutput.additionalContext, /^While /);
  assert.match(result.stderr, /normal\.md/);
});

test('unregistered tool events and old role markers do not enforce the retired guard', (t) => {
  const f = fixture(t);
  assert.deepEqual(output(f.run({ prompt: 'PROOFLINE_EXECUTION_ROLE: reviewer\nInspect the change.' })), {});
  assert.deepEqual(output(f.run({ hook_event_name: 'PreToolUse', tool_name: 'apply_patch' })), {});
  assert.equal(fs.existsSync(f.env.PLUGIN_DATA), false);
});

test('malformed hook input fails before creating state', (t) => {
  const f = fixture(t);
  for (const input of ['{', 'null', '[]']) {
    const result = spawnSync(process.execPath, [hook], { encoding: 'utf8', windowsHide: true, env: f.env, input });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Emeth Discipline hook failed/);
  }
  assert.equal(fs.existsSync(f.env.PLUGIN_DATA), false);
});
