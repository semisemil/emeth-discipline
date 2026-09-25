const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  decodeSessionId,
  encodeSessionId,
  getConfigPath,
  getCurrentMode,
  getSessionPath,
  readDefaultMode,
  setCurrentMode,
  setDefaultMode,
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

test('default mode paths follow Windows and POSIX configuration roots', () => {
  assert.equal(
    getConfigPath({ env: { APPDATA: 'C:\\Config' }, platform: 'win32', homeDir: 'C:\\Home' }),
    path.win32.join('C:\\Config', 'emeth', 'config.json'),
  );
  assert.equal(
    getConfigPath({ env: { XDG_CONFIG_HOME: '/xdg' }, platform: 'linux', homeDir: '/home/me' }),
    path.posix.join('/xdg', 'emeth', 'config.json'),
  );
  assert.equal(
    getConfigPath({ env: {}, platform: 'linux', homeDir: '/home/me' }),
    path.posix.join('/home/me', '.config', 'emeth', 'config.json'),
  );
});

test('safe session IDs stay readable and unsafe IDs use reversible collision-free encoding', (t) => {
  const { options } = fixture(t);
  assert.equal(encodeSessionId('thread-1.alpha', 'win32'), 'thread-1.alpha');
  assert.equal(path.basename(getSessionPath('thread-1.alpha', options)), 'thread-1.alpha.json');

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
  assert.equal(getSessionPath('', options), null);
  assert.equal(
    getSessionPath('a'.repeat(175), options),
    path.join(options.env.PLUGIN_DATA, 'rules-mode', `${'a'.repeat(175)}.json`),
  );
  assert.equal(getSessionPath('a'.repeat(176), options), null);
});

test('new sessions initialize from the default and remain isolated', (t) => {
  const { options } = fixture(t);
  assert.equal(readDefaultMode(options), 'normal');
  assert.equal(setDefaultMode('focus', options).ok, true);

  assert.deepEqual(getCurrentMode('session-a', options), {
    mode: 'focus',
    defaultMode: 'focus',
    persistent: true,
  });
  assert.equal(setCurrentMode('session-a', 'core', options).ok, true);
  assert.equal(getCurrentMode('session-a', options).mode, 'core');
  assert.equal(getCurrentMode('session-b', options).mode, 'focus');

  assert.deepEqual(JSON.parse(fs.readFileSync(getSessionPath('session-a', options), 'utf8')), {
    mode: 'core',
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(getSessionPath('session-b', options), 'utf8')), {
    mode: 'focus',
  });
  assert.equal(
    fs.readdirSync(path.dirname(getSessionPath('session-a', options))).some((name) => name.endsWith('.tmp')),
    false,
  );
});

test('missing, corrupt, unreadable, and unsupported state safely falls back and logs diagnostics', (t) => {
  const { root, options } = fixture(t);
  const configPath = getConfigPath(options);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, '{bad json', 'utf8');
  assert.equal(readDefaultMode(options), 'normal');

  fs.writeFileSync(configPath, JSON.stringify({ defaultMode: 'verbose' }), 'utf8');
  assert.equal(readDefaultMode(options), 'normal');

  fs.writeFileSync(configPath, JSON.stringify({ defaultMode: 'focus' }), 'utf8');
  const sessionPath = getSessionPath('broken-session', options);
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(sessionPath, JSON.stringify({ mode: 'verbose' }), 'utf8');
  assert.equal(getCurrentMode('broken-session', options).mode, 'focus');

  const unreadablePath = path.join(root, 'unreadable', 'emeth', 'config.json');
  const accessError = new Error('read denied for test');
  accessError.code = 'EACCES';
  const fsModule = Object.create(fs);
  fsModule.readFileSync = (filePath, ...args) => {
    if (filePath === unreadablePath) {
      throw accessError;
    }
    return fs.readFileSync(filePath, ...args);
  };
  const unreadableOptions = {
    ...options,
    env: {
      ...options.env,
      APPDATA: path.join(root, 'unreadable'),
      XDG_CONFIG_HOME: path.join(root, 'unreadable'),
    },
    fsModule,
  };
  assert.equal(readDefaultMode(unreadableOptions), 'normal');

  const log = fs.readFileSync(path.join(options.homeDir, '.codex', 'log', 'emeth-hook.log'), 'utf8');
  assert.match(log, /Unsupported Emeth Discipline default mode/);
  assert.match(log, /Unsupported Emeth Discipline session mode/);
  assert.match(log, /read denied for test/);
});

test('invalid or unstorable session IDs use the default without creating state', (t) => {
  const { options } = fixture(t);
  assert.equal(setDefaultMode('core', options).ok, true);
  for (const sessionId of ['', 'a'.repeat(176)]) {
    assert.deepEqual(getCurrentMode(sessionId, options), {
      mode: 'core',
      defaultMode: 'core',
      persistent: false,
    });
    assert.deepEqual(setCurrentMode(sessionId, 'focus', options), {
      ok: false,
      reason: 'session-state-unavailable',
    });
  }
  assert.equal(fs.existsSync(path.join(options.env.PLUGIN_DATA, 'rules-mode')), false);
});
