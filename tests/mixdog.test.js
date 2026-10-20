'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const host = require('../plugins/emeth-discipline/lib/host');
const { composeMixdogPrompt } = require('../plugins/emeth-discipline/lib/rules-prompt');

const repoRoot = path.resolve(__dirname, '../plugins/emeth-discipline');

function hook(t, event) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-mixdog-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'hooks/run.js')], {
    encoding: 'utf8', cwd: root,
    env: { ...process.env, MIXDOG_PLUGIN_ROOT: repoRoot, MIXDOG_PLUGIN_DATA: path.join(root, 'data'),
      CLAUDE_PLUGIN_ROOT: repoRoot, CLAUDE_PLUGIN_DATA: path.join(root, 'compat'),
      XDG_CONFIG_HOME: path.join(root, 'config'), EMETH_BENCHMARK_DISABLE_DASHBOARD: '1' },
    input: JSON.stringify({ cwd: root, ...event }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(root, '.emeth')), false, 'hooks do not initialize a project');
  return result.stdout ? JSON.parse(result.stdout) : {};
}

test('Mixdog compatibility variables use Mixdog identity and state without changing other hosts', () => {
  const env = { MIXDOG_PLUGIN_ROOT: '/mixdog/plugin', MIXDOG_PLUGIN_DATA: '/mixdog/state',
    PLUGIN_ROOT: '/codex/plugin', CLAUDE_PLUGIN_ROOT: '/compat/plugin', CLAUDE_PLUGIN_DATA: '/compat/state' };
  assert.equal(host.name(env), 'mixdog');
  assert.equal(host.dataDir({ env }), '/mixdog/state');
  assert.equal(host.logDir({ env }), path.join('/mixdog/state', 'log'));
  assert.equal(host.dataDir({ env: { MIXDOG_PLUGIN_ROOT: '/plugin' } }), null);
  assert.equal(host.dataDir({ env: { MIXDOG_PLUGIN_ROOT: '/plugin' }, temporaryFallback: true }),
    path.join(os.tmpdir(), 'emeth-mixdog-plugin-state'));
  assert.equal(host.logDir({ env: { MIXDOG_PLUGIN_ROOT: '/plugin', MIXDOG_DATA_DIR: '/state' } }), path.join('/state', 'log'));
  assert.equal(host.name({ PLUGIN_ROOT: '/codex', CLAUDE_PLUGIN_ROOT: '/compat' }), 'codex');
  assert.equal(host.name({ CLAUDE_PLUGIN_ROOT: '/claude' }), 'claude');
  assert.equal(host.name({ MIXDOG_DATA_DIR: '/mixdog/data' }), 'mixdog');
  assert.equal(host.name({ PLUGIN_ROOT: '/codex', MIXDOG_DATA_DIR: '/mixdog/data' }), 'codex');
  assert.equal(host.name({}), 'codex');
});

test('Mixdog sessions apply complete shared rules and restore them on user submissions', t => {
  const baseline = composeMixdogPrompt();
  const shared = fs.readFileSync(path.join(repoRoot, 'skills/rules/codex.md'), 'utf8').replaceAll('{{plugin-root}}', repoRoot).trim();
  assert.ok(baseline.includes(shared));
  assert.equal(baseline.indexOf(shared), baseline.lastIndexOf(shared));
  assert.ok(baseline.includes(repoRoot));
  assert.doesNotMatch(baseline, /\{\{plugin-root\}\}/);
  assert.ok(baseline.length < 10_000, 'Mixdog hook context must not be truncated');
  for (const source of ['startup', 'clear', 'compact']) {
    const response = hook(t, { hook_event_name: 'SessionStart', source });
    assert.equal(response.hookSpecificOutput.additionalContext, baseline);
  }
  assert.deepEqual(hook(t, { hook_event_name: 'SessionStart', source: 'resume' }), {});
  const restored = hook(t, { hook_event_name: 'UserPromptSubmit', prompt: 'Continue after compaction.' });
  assert.equal(restored.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.equal(restored.hookSpecificOutput.additionalContext, baseline);
});

test('Mixdog document requests keep the numbering notice alongside the baseline', t => {
  for (const prompt of ['/development-design write a design', '$emeth-discipline:development-design write a design',
    'figure-it-out implement the change', '/issue-ledger register this bug']) {
    const response = hook(t, { hook_event_name: 'UserPromptSubmit', prompt });
    assert.match(response.hookSpecificOutput.additionalContext, /Next (design|issue) number: (DESIGN|PL)-0001/);
    assert.ok(response.hookSpecificOutput.additionalContext.includes(composeMixdogPrompt()));
  }
});

test('Mixdog agent spawns receive rules without losing task, route, file, or user context', t => {
  const args = { type: 'spawn', agent: 'worker', tag: 'stable', cwd: '/project',
    file: '/project/task.md', context: 'User-provided context' };
  const response = hook(t, { hook_event_name: 'PreToolUse', tool_name: 'agent', tool_input: args });
  const updated = response.hookSpecificOutput.updatedInput;
  assert.equal(response.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.deepEqual({ ...updated, context: args.context }, args);
  assert.equal(updated.context, `${args.context}\n\n${composeMixdogPrompt()}`);
  assert.deepEqual(hook(t, { hook_event_name: 'PreToolUse', tool_name: 'agent', tool_input: updated }), {},
    'repeat execution does not duplicate rules');
  for (const type of ['send', 'close', 'cancel', 'read', 'status', 'list', 'cleanup']) {
    assert.deepEqual(hook(t, { hook_event_name: 'PreToolUse', tool_name: 'agent', tool_input: { ...args, type } }), {});
  }
  assert.deepEqual(hook(t, { hook_event_name: 'PreToolUse', tool_name: 'shell', tool_input: args }), {});
});

test('Mixdog host references and WebAgent native procedure resolve without Codex-only execution', () => {
  for (const file of ['skills/rules/mixdog.md', 'skills/start-implementation/SKILL.md',
    'skills/dashboard-server/references/mixdog.md', 'skills/webagent/references/mixdog.md']) {
    const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    for (const match of source.matchAll(/\]\(([^)]+\.md)(?:#[^)]*)?\)/g)) {
      assert.ok(fs.statSync(path.resolve(repoRoot, path.dirname(file), match[1])).isFile());
    }
  }
  const webagent = fs.readFileSync(path.join(repoRoot, 'skills/webagent/references/mixdog.md'), 'utf8');
  assert.match(webagent, /browser-use/);
  assert.match(webagent, /never submit a duplicate/);
  assert.match(webagent, /SubagentStart|Codex Node Browser/);
});
