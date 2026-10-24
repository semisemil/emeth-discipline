const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const { withFileLock } = require('../plugins/emeth-discipline/lib/file-lock');

test('an exited owner is recovered while a live owner retains its lock', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-lock-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const lock = path.join(directory, 'write.lock');
  const busy = { code: 'locked', message: 'Busy', timeoutMs: 0 };
  execFileSync(process.execPath, ['-e',
    "require(process.argv[1]).withFileLock(process.argv[2], () => process.exit(0), { code: 'locked', timeoutMs: 0 });",
    require.resolve('../plugins/emeth-discipline/lib/file-lock'), lock], { windowsHide: true });
  assert.equal(withFileLock(lock, () => {
    assert.throws(() => withFileLock(lock, () => assert.fail('Live owner still holds the lock'), busy), { code: 'locked' });
    return 'saved';
  }, busy), 'saved');
  assert.equal(fs.existsSync(lock), false);
});
