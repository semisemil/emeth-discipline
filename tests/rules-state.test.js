const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  decodeSessionId,
  encodeSessionId,
  getModelPath,
} = require('../lib/rules-state');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-state-'));
  const configRoot = path.join(root, 'config');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root,
    options: {
      env: {
        APPDATA: configRoot,
        XDG_CONFIG_HOME: configRoot,
        PLUGIN_DATA: path.join(root, 'plugin-data'),
      },
      platform: process.platform,
      homeDir: path.join(root, 'home'),
      hook: 'test',
      event: 'test',
    },
  };
}

test('safe session IDs stay readable and unsafe IDs use reversible collision-free encoding', (t) => {
  const { options } = fixture(t);
  assert.equal(encodeSessionId('thread-1.alpha', 'win32'), 'thread-1.alpha');
  assert.equal(path.basename(getModelPath('thread-1.alpha', options)), 'thread-1.alpha.json');

  const unsafe = 'thread/%:한글';
  const encoded = encodeSessionId(unsafe, 'win32');
  assert.match(encoded, /%2F/);
  assert.match(encoded, /%25/);
  assert.equal(decodeSessionId(encoded), unsafe);
  assert.notEqual(encodeSessionId('a/b', 'win32'), encodeSessionId('a%2Fb', 'win32'));
  assert.equal(decodeSessionId(encodeSessionId('CON', 'win32')), 'CON');
  assert.equal(decodeSessionId(encodeSessionId('trailing.', 'win32')), 'trailing.');
});

test('session ID encoding distinguishes lone surrogates from each other and U+FFFD', () => {
  const sessionIds = ['\ud800', '\ud801', '\udc00', '\ufffd', '\ud83d\ude00'];
  const encoded = sessionIds.map((sessionId) => encodeSessionId(sessionId, 'win32'));

  assert.equal(new Set(encoded).size, sessionIds.length);
  assert.match(encoded[0], /%uD800/);
  assert.match(encoded[1], /%uD801/);
  assert.match(encoded[2], /%uDC00/);
  assert.match(encoded[3], /%EF%BF%BD/);
  assert.notEqual(encodeSessionId('%uD800', 'win32'), encoded[0]);
  for (let index = 0; index < sessionIds.length; index += 1) {
    assert.equal(decodeSessionId(encoded[index]), sessionIds[index]);
  }
});

test('empty and oversized session IDs never create state paths', (t) => {
  const { options } = fixture(t);
  assert.equal(getModelPath('', options), null);
  assert.equal(
    getModelPath('a'.repeat(175), options),
    path.join(options.env.PLUGIN_DATA, 'rules-model', `${'a'.repeat(175)}.json`),
  );
  assert.equal(getModelPath('a'.repeat(176), options), null);
});
