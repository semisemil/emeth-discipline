const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { withFileLock } = require('../plugins/emeth-discipline/lib/file-lock');

test('recovery preserves a live successor and allows work after it releases the lock', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-lock-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const lock = path.join(directory, 'write.lock');
  const expired = JSON.stringify({ pid: 2147483647 });
  const successor = JSON.stringify({ pid: process.pid });
  const busy = { code: 'locked', message: 'Busy', timeoutMs: 0 };
  fs.writeFileSync(lock, expired);
  const read = fs.readFileSync;
  try {
    fs.readFileSync = (file, ...args) => {
      const content = read(file, ...args);
      if (file === lock && content === expired) {
        fs.renameSync(lock, `${lock}.previous`);
        fs.writeFileSync(lock, successor);
      }
      return content;
    };
    assert.throws(() => withFileLock(lock, () => assert.fail('Successor still owns the lock'), busy), { code: 'locked' });
  } finally { fs.readFileSync = read; }
  assert.equal(fs.readFileSync(lock, 'utf8'), successor);
  fs.unlinkSync(lock);
  assert.equal(withFileLock(lock, () => 'saved', busy), 'saved');
  assert.equal(fs.existsSync(lock), false);
});
