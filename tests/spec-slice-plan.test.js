'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const repoRoot = path.resolve(__dirname, '..');

test('implementation has one launch skill and a shared internal procedure', () => {
  for (const name of ['implement', 'design-slice', 'implementation-slice']) {
    for (const file of ['SKILL.md', 'agents/openai.yaml']) {
      assert.equal(fs.existsSync(path.join(repoRoot, 'skills', name, file)), false);
    }
  }
  assert.equal(fs.existsSync(path.join(repoRoot, 'skills/start-parallel-implementation/SKILL.md')), false);
  const procedure = path.join(repoRoot, 'skills/start-implementation/implement.md');
  const source = fs.readFileSync(procedure, 'utf8');
  for (const match of source.matchAll(/\]\(([^)]+\.md)(?:#[^)]*)?\)/g)) {
    assert.ok(fs.statSync(path.resolve(path.dirname(procedure), match[1])).isFile());
  }
});
