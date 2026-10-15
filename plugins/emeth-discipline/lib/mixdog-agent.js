'use strict';

const { composeMixdogPrompt } = require('./rules-prompt');

// Mixdog dispatches SubagentStart asynchronously and discards its context.
// The supported PreToolUse rewrite carries rules in the worker's own request.
function beforeAgent(input) {
  const args = input.tool_input;
  if (input.tool_name !== 'agent' || !args || typeof args !== 'object'
      || Array.isArray(args) || args.type !== 'spawn') return {};
  const baseline = composeMixdogPrompt();
  const context = typeof args.context === 'string' ? args.context : '';
  if (context.includes(baseline)) return {};
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      updatedInput: { ...args, context: [context, baseline].filter(Boolean).join('\n\n') },
    },
  };
}

module.exports = { beforeAgent };
