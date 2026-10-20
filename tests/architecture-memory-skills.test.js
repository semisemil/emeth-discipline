const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pluginRoot = path.resolve(__dirname, '../plugins/emeth-discipline');
const read = (...parts) => fs.readFileSync(path.join(pluginRoot, ...parts), 'utf8');
const skills = ['architecture-memory-init', 'architecture-memory', 'architecture-memory-update'];

test('memory context and updates are implicitly discoverable; initialization requires explicit invocation', () => {
  for (const name of skills) {
    const metadata = read('skills', name, 'agents', 'openai.yaml');
    assert.match(metadata, new RegExp('^\\s*allow_implicit_invocation: ' + (name !== 'architecture-memory-init') + '$', 'm'));
    assert.ok(metadata.includes('$' + name));
  }
});
