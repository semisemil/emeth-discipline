'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const repoRoot = path.resolve(__dirname, '..');

test('implementation and slicing are internal documents, with only two launch skills', () => {
  for (const name of ['implement', 'design-slice', 'implementation-slice']) {
    for (const file of ['SKILL.md', 'agents/openai.yaml']) {
      assert.equal(fs.existsSync(path.join(repoRoot, 'skills', name, file)), false);
    }
  }
  for (const name of ['start-implementation', 'start-parallel-implementation']) {
    assert.ok(fs.statSync(path.join(repoRoot, 'skills', name, 'implement.md')).isFile());
  }
  const slice = path.join(repoRoot, 'skills/start-parallel-implementation/design-slice.md');
  const source = fs.readFileSync(slice, 'utf8');
  for (const match of source.matchAll(/\]\(([^)]+\.md)(?:#[^)]*)?\)/g)) {
    assert.ok(fs.statSync(path.resolve(path.dirname(slice), match[1])).isFile());
  }
});
