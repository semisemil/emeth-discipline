'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const pluginRoot = path.resolve(__dirname, '../plugins/emeth-discipline');
const starter = path.join(pluginRoot, 'skills', 'issue-ledger', 'assets', 'state-starter');

test('new state starter creates no static dashboard', (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-state-starter-'));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  fs.cpSync(starter, path.join(project, '.emeth'), { recursive: true });
  assert.equal(fs.existsSync(path.join(project, '.emeth', 'dashboard')), false);
});
