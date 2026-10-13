'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pluginRoot = path.resolve(__dirname, '../plugins/emeth-discipline');
const skillPaths = [
  path.join(pluginRoot, 'skills', 'start-implementation', 'SKILL.md'),
  path.join(pluginRoot, 'skills', 'start-implementation', 'implement.md'),
  path.join(pluginRoot, 'skills', 'start-implementation', 'references', 'codex.md'),
  path.join(pluginRoot, 'skills', 'start-implementation', 'references', 'claude-code.md'),
];

test('implementation skills are explicit-only', () => {
  for (const name of ['start-implementation']) {
    const metadata = fs.readFileSync(
      path.join(pluginRoot, 'skills', name, 'agents', 'openai.yaml'),
      'utf8',
    );
    assert.match(metadata, /^\s*allow_implicit_invocation:\s*false$/m, name);
  }
});

test('implementation skill Markdown links resolve', () => {
  for (const skillPath of skillPaths) {
    const source = fs.readFileSync(skillPath, 'utf8');
    for (const match of source.matchAll(/\]\(([^)]+\.md)(?:#[^)]*)?\)/g)) {
      const target = path.resolve(path.dirname(skillPath), match[1]);
      assert.ok(fs.statSync(target).isFile(), `${skillPath} -> ${match[1]}`);
    }
  }
});
