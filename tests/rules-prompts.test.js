'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { composeEmethPrompt, composeClaudePrompt, composeMixdogPrompt } = require('../plugins/emeth-discipline/lib/rules-prompt');

const pluginRoot = path.resolve(__dirname, '../plugins/emeth-discipline');

test('host prompts deliver revised document and UI guidance only to Codex and Mixdog', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-rules-scope-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const rules = path.join(directory, 'skills/rules');
  fs.mkdirSync(rules, { recursive: true });
  fs.writeFileSync(path.join(rules, 'SKILL.md'), `# Rules

Apply the rules for the host running this conversation: fixture

<!-- claude-only -->
## Document writing and revision

<!-- direct-readers -->
Direct readers use their host's document rules.

<!-- /direct-readers -->
Original document instructions.
<!-- /claude-only -->

## Tests

Shared testing instructions.

<!-- claude-only -->
## UI design

Read \`references/ui-design.md\`.
<!-- /claude-only -->
`);
  const revised = 'Revised document instructions.\nRead `references/ui-design-codex-mixdog.md`.';
  for (const file of ['codex.md', 'mixdog.md']) fs.writeFileSync(path.join(rules, file), revised);
  fs.writeFileSync(path.join(rules, 'claude-code.md'), 'Original Claude instructions.');

  const legacyUI = path.join(rules, 'references/ui-design.md');
  assert.equal(composeClaudePrompt({ pluginRoot: directory }), `# Rules

Original Claude instructions.

## Document writing and revision

Original document instructions.

## Tests

Shared testing instructions.

## UI design

Read \`${legacyUI}\`.`);
  for (const compose of [composeEmethPrompt, composeMixdogPrompt]) {
    const prompt = compose({ pluginRoot: directory });
    assert.ok(prompt.includes('Revised document instructions.'));
    assert.ok(prompt.includes(path.join(rules, 'references/ui-design-codex-mixdog.md')));
    assert.ok(prompt.includes('Shared testing instructions.'));
    assert.doesNotMatch(prompt, /Original document instructions|Original Claude instructions|claude-only|Direct readers/);
    assert.equal(prompt.includes(legacyUI), false);
  }
});

test('Codex registers its lifecycle events and platform commands', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.codex-plugin/plugin.json'), 'utf8'));
  const hooks = JSON.parse(fs.readFileSync(path.join(pluginRoot, manifest.hooks), 'utf8')).hooks;
  assert.deepEqual(new Set(Object.keys(hooks)), new Set(['SessionStart', 'SubagentStart', 'UserPromptSubmit']));
  const sessionMatcher = new RegExp(hooks.SessionStart[0].matcher);
  for (const source of ['startup', 'resume', 'clear', 'compact']) assert.ok(sessionMatcher.test(source), source);
  assert.equal(sessionMatcher.test('unrelated'), false);
  for (const [event, groups] of Object.entries(hooks)) {
    assert.equal(groups.length, 1, event);
    assert.equal(groups[0].hooks.length, 1, event);
    assert.ok(groups[0].hooks[0].command.includes('/hooks/run.js'), event);
    assert.ok(groups[0].hooks[0].commandWindows.includes('\\hooks\\run.js'), event);
  }
});

test('Claude registers one exec-form hook per lifecycle event', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.claude-plugin/plugin.json'), 'utf8'));
  const hooks = JSON.parse(fs.readFileSync(path.join(pluginRoot, manifest.hooks), 'utf8')).hooks;
  assert.deepEqual(new Set(Object.keys(hooks)), new Set(['SessionStart', 'SubagentStart', 'UserPromptSubmit']));
  const sessionMatcher = new RegExp(hooks.SessionStart[0].matcher);
  for (const source of ['startup', 'resume', 'clear', 'compact']) assert.ok(sessionMatcher.test(source), source);
  assert.equal(sessionMatcher.test('unrelated'), false);
  for (const groups of Object.values(hooks)) {
    assert.equal(groups.length, 1);
    assert.equal(groups[0].hooks.length, 1);
    const command = groups[0].hooks[0];
    assert.equal(command.command, 'node');
    assert.deepEqual(command.args, ['${CLAUDE_PLUGIN_ROOT}/hooks/run.js']);
    assert.equal(command.commandWindows, undefined);
  }
});
