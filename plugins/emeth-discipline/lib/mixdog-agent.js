'use strict';

const { composeEmethPrompt } = require('./rules-prompt');

// Mixdog dispatches SubagentStart asynchronously and discards its context.
// The supported PreToolUse rewrite carries rules in the worker's own request.
function beforeAgent(input) {
  const args = input.tool_input;
  if (input.tool_name !== 'agent' || !args || typeof args !== 'object'
      || Array.isArray(args) || args.type !== 'spawn') return {};
  const baseline = composeEmethPrompt({ host: 'mixdog' });
  const notice = require('./work-records-policy').notice(typeof args.cwd === 'string' ? args.cwd : input.cwd);
  const context = typeof args.context === 'string' ? args.context : '';
  const missing = [!context.includes(baseline) ? baseline : '', notice && !context.includes(notice) ? notice : ''].filter(Boolean);
  if (!missing.length) return {};
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      updatedInput: { ...args, context: [context, ...missing].filter(Boolean).join('\n\n') },
    },
  };
}

module.exports = { beforeAgent };
