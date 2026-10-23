const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pluginRoot = path.resolve(__dirname, '../plugins/emeth-discipline');
const read = (...parts) => fs.readFileSync(path.join(pluginRoot, ...parts), 'utf8');

test('figure-it-out is explicit-only and exposed by the plugin', () => {
  const metadata = read('skills', 'figure-it-out', 'agents', 'openai.yaml');
  const manifest = JSON.parse(read('.codex-plugin', 'plugin.json'));

  assert.match(metadata, /^\s*default_prompt:\s*"[^"\r\n]*\$figure-it-out[^"\r\n]*"$/m);
  assert.match(metadata, /^\s*allow_implicit_invocation:\s*false$/m);
  assert.ok(manifest.interface.defaultPrompt.length <= 3);
  assert.ok(manifest.interface.defaultPrompt.every((prompt) => prompt.length <= 128));
  assert.ok(manifest.interface.defaultPrompt.some((prompt) => prompt.startsWith('/emeth-discipline:figure-it-out')));
});
