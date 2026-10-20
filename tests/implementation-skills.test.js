'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pluginRoot = path.resolve(__dirname, '../plugins/emeth-discipline');
function markdownFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(file) : entry.name.endsWith('.md') ? [file] : [];
  });
}

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
  const sources = [
    ...markdownFiles(path.join(pluginRoot, 'skills', 'start-implementation')),
    ...markdownFiles(path.join(pluginRoot, 'references', 'pstack')),
  ];
  for (const skillPath of sources) {
    const source = fs.readFileSync(skillPath, 'utf8');
    for (const match of source.matchAll(/\]\(([^)]+\.md)(?:#[^)]*)?\)/g)) {
      if (/^https?:\/\//i.test(match[1])) continue;
      const target = path.resolve(path.dirname(skillPath), match[1]);
      assert.ok(fs.statSync(target).isFile(), `${skillPath} -> ${match[1]}`);
    }
  }
});
