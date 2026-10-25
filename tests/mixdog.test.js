'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../plugins/emeth-discipline');
const hostRules = ['mixdog.md'].map(file => fs.readFileSync(
  path.join(repoRoot, 'skills/rules', file), 'utf8',
).trim().replaceAll('{{plugin-root}}', repoRoot)
  .replace('references/ui-design-codex-mixdog.md', path.join(repoRoot, 'skills/rules/references/ui-design-codex-mixdog.md')));

function hook(t, event) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-mixdog-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'hooks/run.js')], {
    encoding: 'utf8', cwd: root,
    env: { ...process.env, MIXDOG_PLUGIN_ROOT: repoRoot, MIXDOG_PLUGIN_DATA: path.join(root, 'data'),
      CLAUDE_PLUGIN_ROOT: repoRoot, CLAUDE_PLUGIN_DATA: path.join(root, 'compat'),
      XDG_CONFIG_HOME: path.join(root, 'config') },
    input: JSON.stringify({ cwd: root, ...event }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(root, '.emeth')), false, 'hooks do not initialize a project');
  return result.stdout ? JSON.parse(result.stdout) : {};
}

test('Mixdog sessions apply host rules and restore them on user submissions', t => {
  const baseline = hook(t, { hook_event_name: 'SessionStart', source: 'startup' }).hookSpecificOutput.additionalContext;
  for (const rules of hostRules) assert.ok(baseline.includes(rules));
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

test('Mixdog agent spawns receive rules without losing task, route, file, or user context', t => {
  const args = { type: 'spawn', agent: 'worker', tag: 'stable', cwd: '/project',
    file: '/project/task.md', context: 'User-provided context' };
  const response = hook(t, { hook_event_name: 'PreToolUse', tool_name: 'agent', tool_input: args });
  const updated = response.hookSpecificOutput.updatedInput;
  assert.equal(response.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.deepEqual({ ...updated, context: args.context }, args);
  assert.ok(updated.context.startsWith(args.context));
  for (const rules of hostRules) assert.ok(updated.context.includes(rules));
  assert.deepEqual(hook(t, { hook_event_name: 'PreToolUse', tool_name: 'agent', tool_input: updated }), {},
    'repeat execution does not duplicate rules');
});
