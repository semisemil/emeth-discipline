const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');
const skills = ['architecture-memory-init', 'architecture-memory', 'architecture-memory-update'];

test('memory context is implicitly discoverable; initialization and reconciliation require explicit invocation', () => {
  for (const name of skills) {
    const source = read('skills', name, 'SKILL.md');
    const metadata = read('skills', name, 'agents', 'openai.yaml');
    const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    assert.ok(frontmatter, name);
    assert.ok(frontmatter[1].includes('name: ' + name));
    assert.match(frontmatter[1], /^description:\s*\S.+$/m);
    assert.match(metadata, new RegExp('^\\s*allow_implicit_invocation: ' + (name === 'architecture-memory') + '$', 'm'));
    assert.ok(metadata.includes('$' + name));
  }
});

test('description owns selection while the body reuses sufficient context and preserves execution constraints', () => {
  const main = read('skills', 'architecture-memory', 'SKILL.md');
  const description = main.match(/^description: (.*)$/m)[1];
  for (const trigger of ['design', 'implementation', 'project conversation', 'project purpose', 'operating conditions', 'domain meanings', 'reasons for prior decisions', 'preservation for later work']) {
    assert.ok(description.includes(trigger), trigger);
  }
  assert.match(main, /Reuse context from the conversation and inspected materials when it is sufficient for the current decision/);
  assert.match(main, /When context is missing and Memory is connected and enabled/);
  assert.match(main, /read only the sections needed to fill that gap/);
  assert.match(main, /With no connection, do not scan or initialize merely because architecture is mentioned/);
  assert.match(main, /Read-only\/no-memory requests suppress writes; explicit disabled settings stay disabled/);
  assert.doesNotMatch(main, /Enter through|mechanical/);
});

test('all workflow reference pointers resolve', () => {
  const files = [
    ...skills.map((name) => path.join('skills', name, 'SKILL.md')),
    'skills/architecture-memory-init/references/initialization.md',
    'skills/architecture-memory/references/recording.md',
    'skills/architecture-memory/references/retrieval.md',
    'skills/architecture-memory/references/record-format.md',
    'skills/architecture-memory/references/workflow.md',
  ];
  for (const file of files) {
    const source = read(file);
    for (const match of source.matchAll(/\]\(([^)]+\.md)(?:#[^)]*)?\)/g)) {
      const target = path.resolve(repoRoot, path.dirname(file), match[1]);
      assert.ok(fs.existsSync(target), file + ' -> ' + match[1]);
    }
  }
});

test('main discovery and workflow instructions fit a bounded initial context', () => {
  const main = read('skills', 'architecture-memory', 'SKILL.md');
  const description = main.match(/^description: (.*)$/m)[1];
  assert.ok(description.length <= 240);
  assert.ok(main.length <= 3500, main.length + ' characters');
});
