#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const realpath = fs.realpathSync.native || fs.realpathSync;
const temporaryRoot = path.normalize(realpath(os.tmpdir()));
const testFiles = fs.readdirSync(__dirname, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
  .map((entry) => path.join('tests', entry.name))
  .sort();

if (testFiles.length === 0) {
  console.error('No test files found.');
  process.exitCode = 1;
} else {
  const concurrency = process.platform === 'win32' ? ['--test-concurrency=1'] : [];
  const result = spawnSync(process.execPath, ['--test', ...concurrency, ...testFiles], {
    cwd: repoRoot,
    env: {
      ...process.env,
      TEMP: temporaryRoot,
      TMP: temporaryRoot,
      TMPDIR: temporaryRoot,
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) {
    console.error(`Test runner failed: ${result.error.message}`);
    process.exitCode = 1;
  } else if (result.signal) {
    console.error(`Test runner terminated by ${result.signal}.`);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
}
