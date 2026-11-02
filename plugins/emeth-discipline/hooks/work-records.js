#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { notice } = require('../lib/work-records-policy');

function run(input) {
  if (input.hook_event_name !== 'SessionStart'
      || input.source !== undefined && !['startup', 'clear', 'compact'].includes(input.source)) return {};
  const context = notice(input.cwd);
  return context ? { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } } : {};
}

if (require.main === module) {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    const input = raw.trim() ? JSON.parse(raw) : {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a hook event object.');
    const result = run(input);
    if (Object.keys(result).length) process.stdout.write(JSON.stringify(result));
  } catch (error) {
    process.stderr.write(`Work record reference unavailable: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { run };
