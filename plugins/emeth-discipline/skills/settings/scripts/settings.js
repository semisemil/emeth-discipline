#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { SETTINGS, readSettings, writeSetting } = require(path.join(__dirname, '../../../lib/settings.js'));

const USAGE = `Usage: node settings.js status | <${Object.keys(SETTINGS).join('|')}> <on|off>`;

function runCli(argv, options = {}) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === 'status')) return { exitCode: 0, result: readSettings(options) };
  if (argv.length === 2 && argv[0] in SETTINGS && ['on', 'off'].includes(argv[1])) {
    return { exitCode: 0, result: writeSetting(argv[0], argv[1] === 'on', options) };
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
