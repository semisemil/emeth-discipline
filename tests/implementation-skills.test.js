'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pluginRoot = path.resolve(__dirname, '../plugins/emeth-discipline');
test('implementation skills are explicit-only', () => {
  for (const name of ['start-implementation', 'ensemble', 'code-exploration']) {
    const metadata = fs.readFileSync(
      path.join(pluginRoot, 'skills', name, 'agents', 'openai.yaml'),
      'utf8',
    );
    assert.match(metadata, /^\s*allow_implicit_invocation:\s*false$/m, name);
  }
});
