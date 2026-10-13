'use strict';

const { composeEmethPrompt, composeClaudePrompt, composeMixdogPrompt } = require('./rules-prompt');
const host = require('./host');

function load(input) {
  if (input.hook_event_name === 'SessionStart' && input.source === 'resume') return '';
  if (host.name() === 'mixdog') return composeMixdogPrompt();
  if (host.name() === 'claude') return composeClaudePrompt();
  return composeEmethPrompt();
}

module.exports = { load };
