'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { MODE_SLOT } = require('../lib/rules-prompt.js');

const repoRoot = path.resolve(__dirname, '..');

test('the shared prompt has one mode slot and all mode components exist', () => {
  const skillPath = path.join(repoRoot, 'skills', 'rules', 'SKILL.md');
  const baseline = fs.readFileSync(skillPath, 'utf8');
  assert.equal(baseline.split(MODE_SLOT).length - 1, 1);

  for (const mode of ['normal', 'focus', 'core']) {
    const modePath = path.join(repoRoot, 'skills', 'rules', `${mode}.md`);
    assert.ok(fs.statSync(modePath).isFile(), mode);
    assert.ok(fs.statSync(modePath).size > 0, mode);
  }
});

test('hook registration keeps lifecycle boundaries and removes legacy owners', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(repoRoot, 'hooks', 'hooks.json'), 'utf8')).hooks;
  assert.deepEqual(Object.keys(hooks), ['SessionStart', 'SubagentStart', 'UserPromptSubmit']);
  assert.equal(hooks.SessionStart[0].matcher, 'startup|resume|clear|compact');
  for (const [event, groups] of Object.entries(hooks)) {
    assert.equal(groups.length, 1, event);
    assert.equal(groups[0].hooks.length, 1, event);
    assert.ok(groups[0].hooks[0].command.includes('/hooks/run.js'), event);
    assert.ok(groups[0].hooks[0].commandWindows.includes('\\hooks\\run.js'), event);
  }
  assert.equal(hooks.PreToolUse, undefined);
  assert.equal(hooks.SessionEnd, undefined);
  assert.equal(fs.existsSync(path.join(repoRoot, 'hooks', 'load-baseline.js')), false);
  assert.equal(fs.existsSync(path.join(repoRoot, 'skills', 'proofline-baseline-quality')), false);
});
