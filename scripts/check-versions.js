#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function checkVersions(root = path.resolve(__dirname, '..')) {
  const read = (directory) => JSON.parse(fs.readFileSync(path.join(root, directory, 'plugin.json'), 'utf8'));
  const codex = read('.codex-plugin');
  const claude = read('.claude-plugin');
  if (!codex.version || codex.version !== claude.version || codex.name !== claude.name) {
    throw new Error('Codex and Claude plugin names and versions must match the .codex-plugin/plugin.json source.');
  }
  return codex.version;
}

if (require.main === module) {
  try {
    console.log(`Plugin versions match: ${checkVersions()}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { checkVersions };
