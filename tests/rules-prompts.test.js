'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pluginRoot = path.resolve(__dirname, '../plugins/emeth-discipline');

test('hook registration keeps lifecycle boundaries and removes legacy owners', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.codex-plugin/plugin.json'), 'utf8'));
  const hooks = JSON.parse(fs.readFileSync(path.join(pluginRoot, manifest.hooks), 'utf8')).hooks;
  assert.deepEqual(Object.keys(hooks), ['SessionStart', 'SubagentStart', 'UserPromptSubmit']);
  assert.equal(hooks.SessionStart[0].matcher, 'startup|resume|clear|compact');
  for (const [event, groups] of Object.entries(hooks)) {
    assert.equal(groups.length, 1, event);
    assert.equal(groups[0].hooks.length, 1, event);
    assert.ok(groups[0].hooks[0].command.includes('/hooks/run.js'), event);
    assert.ok(groups[0].hooks[0].commandWindows.includes('\\hooks\\run.js'), event);
  }
  assert.equal(fs.existsSync(path.join(pluginRoot, 'hooks', 'refresh-dashboard.js')), false);
  assert.equal(hooks.PreToolUse, undefined);
  assert.equal(hooks.SessionEnd, undefined);
  assert.equal(fs.existsSync(path.join(pluginRoot, 'hooks', 'load-baseline.js')), false);
  assert.equal(fs.existsSync(path.join(pluginRoot, 'skills', 'proofline-baseline-quality')), false);
});

test('Claude registers one exec-form hook per event without a shared default hook file', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.claude-plugin/plugin.json'), 'utf8'));
  const hooks = JSON.parse(fs.readFileSync(path.join(pluginRoot, manifest.hooks), 'utf8')).hooks;
  assert.equal(fs.existsSync(path.join(pluginRoot, 'hooks/hooks.json')), false);
  assert.deepEqual(Object.keys(hooks), ['SessionStart', 'SubagentStart', 'UserPromptSubmit']);
  assert.equal(hooks.SessionStart[0].matcher, 'startup|resume|clear|compact');
  for (const groups of Object.values(hooks)) {
    assert.equal(groups.length, 1);
    assert.equal(groups[0].hooks.length, 1);
    const command = groups[0].hooks[0];
    assert.equal(command.command, 'node');
    assert.deepEqual(command.args, ['${CLAUDE_PLUGIN_ROOT}/hooks/run.js']);
    assert.equal(command.commandWindows, undefined);
  }
});
