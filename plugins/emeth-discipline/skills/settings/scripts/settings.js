#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { VALUES, readSettings, writeSetting } = require(path.join(__dirname, '../../../lib/settings.js'));

const USAGE = ['Usage: node settings.js status',
  ...Object.entries(VALUES).map(([name, values]) => `       node settings.js ${name} <${Object.keys(values).join('|')}>`)].join('\n');

function runCli(argv, options = {}) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === 'status')) return { exitCode: 0, result: readSettings(options) };
  if (argv.length === 2 && Object.hasOwn(VALUES, argv[0]) && Object.hasOwn(VALUES[argv[0]], argv[1])) {
    return { exitCode: 0, result: writeSetting(argv[0], argv[1], options) };
  }
  return { exitCode: 2, error: USAGE };
}

if (require.main === module) {
  try {
    const { exitCode, result, error } = runCli(process.argv.slice(2));
    if (error) process.stderr.write(`${error}\n`);
    else process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = exitCode;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ code: error.code, message: error.message, path: error.path })}\n`);
    process.exitCode = 1;
  }
}

module.exports = { runCli };
