const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pluginRoot = path.resolve(__dirname, '../plugins/emeth-discipline');
const read = (...parts) => fs.readFileSync(path.join(pluginRoot, ...parts), 'utf8');
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
      const target = path.resolve(pluginRoot, path.dirname(file), match[1]);
      assert.ok(fs.existsSync(target), file + ' -> ' + match[1]);
    }
  }
});
