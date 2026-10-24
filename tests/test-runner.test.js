const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-runner-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'tests'));
  fs.copyFileSync(path.join(__dirname, 'run-tests.js'), path.join(root, 'tests/run-tests.js'));
  return {
    write(name, source) { fs.writeFileSync(path.join(root, 'tests', name), source); },
    run() {
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, [path.join(root, 'tests/run-tests.js')], {
        env, encoding: 'utf8', timeout: 20_000, windowsHide: true,
      });
      assert.ifError(result.error);
      return result;
    },
  };
}

test('fixed-port test files never overlap their shared resource ownership', (t) => {
  const suite = fixture(t);
  for (const name of ['dashboard-server-control.test.js', 'dashboard-server-lifecycle.test.js', 'start-dashboard-server.test.js']) {
    suite.write(name, `
      const fs = require('node:fs');
      const test = require('node:test');
      test('exclusive resource', async () => {
        const fd = fs.openSync('shared-resource', 'wx');
        try { await new Promise(resolve => setTimeout(resolve, 200)); }
        finally { fs.closeSync(fd); fs.unlinkSync('shared-resource'); }
      });
    `);
  }
  const result = suite.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

for (const failingFile of ['ordinary.test.js', 'dashboard-server-control.test.js']) {
  test(`runner preserves failures from ${failingFile} while running both groups`, (t) => {
    const suite = fixture(t);
    for (const name of ['ordinary.test.js', 'dashboard-server-control.test.js']) {
      suite.write(name, `console.log(${JSON.stringify(`ran ${name}`)}); process.exitCode = ${name === failingFile ? 1 : 0};`);
    }
    const result = suite.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /ran ordinary\.test\.js/);
    assert.match(result.stdout, /ran dashboard-server-control\.test\.js/);
  });
}
