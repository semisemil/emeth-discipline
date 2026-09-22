'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const skillPaths = [
  path.join(repoRoot, 'skills', 'start-implementation', 'SKILL.md'),
  path.join(repoRoot, 'skills', 'start-implementation', 'implement.md'),
  path.join(repoRoot, 'skills', 'start-parallel-implementation', 'SKILL.md'),
  path.join(repoRoot, 'skills', 'start-parallel-implementation', 'implement.md'),
  path.join(repoRoot, 'skills', 'start-parallel-implementation', 'design-slice.md'),
];

test('implementation skills are explicit-only', () => {
  for (const name of ['start-implementation', 'start-parallel-implementation']) {
    const metadata = fs.readFileSync(
      path.join(repoRoot, 'skills', name, 'agents', 'openai.yaml'),
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
