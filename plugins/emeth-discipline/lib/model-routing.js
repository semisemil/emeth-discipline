#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const host = require('./host');

const policies = {
  codex: 'codex.md',
  claude: 'claude-code.md',
  // Mixdog retains the model defaults previously shared with Codex.
  mixdog: 'codex.md',
};

try {
  if (process.argv.length !== 2) throw new Error('Usage: node model-routing.js');
  const currentHost = host.name(process.env, { fallback: null });
  if (!currentHost) throw new Error('Cannot identify the active agent environment. Run this command from its shell tool.');
  const file = path.join(__dirname, '..', 'references', 'model-routing', policies[currentHost]);
  process.stdout.write(fs.readFileSync(file, 'utf8'));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
