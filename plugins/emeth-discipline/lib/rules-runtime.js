'use strict';

const { composeEmethPrompt } = require('./rules-prompt');
const host = require('./host');

function load(input) {
  if (input.hook_event_name === 'SessionStart' && input.source === 'resume') return '';
  const currentHost = host.name();
  const baseline = composeEmethPrompt({ host: currentHost });
  // Codex SessionStart has a separate callback; fresh workers and other hosts need the same policy.
  const context = currentHost !== 'codex' || input.hook_event_name === 'SubagentStart'
    ? require('./work-records-policy').notice(input.cwd) : '';
  return [baseline, context].filter(Boolean).join('\n\n');
}

module.exports = { load };
