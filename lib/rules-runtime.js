'use strict';

const {
  getModelPath, writeJsonAtomic, logDiagnostic,
} = require('./rules-state');
const fs = require('node:fs');
const { composeEmethPrompt, composeClaudePrompt } = require('./rules-prompt');
const host = require('./host');

function load(input) {
  if (input.hook_event_name === 'SessionStart' && input.source === 'resume') return '';
  if (host.name() === 'claude') return composeClaudePrompt();
  const model = inputModel(input) || (input.hook_event_name === 'SessionStart' ? readModel(input) : undefined);
  const context = composeEmethPrompt({ model });
  // SubagentStart carries the parent's session id; never overwrite its model.
  if (input.hook_event_name === 'SessionStart') recordModel(input);
  return context;
}

function inputModel(input) {
  return typeof input.model === 'string' ? input.model.trim() || undefined : undefined;
}

function readModel(input) {
  const filePath = getModelPath(input.session_id);
  if (!filePath) return undefined;
  try {
    return inputModel(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logDiagnostic({ hook: 'rules-model', event: input.hook_event_name, filePath, error });
    }
    return undefined;
  }
}

function recordModel(input) {
  if (typeof input.model !== 'string' || !input.model.trim()) return;
  const filePath = getModelPath(input.session_id);
  if (!filePath) return;
  try {
    writeJsonAtomic(filePath, { model: inputModel(input) });
  } catch (error) {
    logDiagnostic({ hook: 'rules-model', event: input.hook_event_name, filePath, error });
  }
}

function submit(input) {
  if (host.name() !== 'codex') return {};
  const previousModel = readModel(input);
  const currentModel = inputModel(input);
  if (!currentModel || previousModel === currentModel) return {};
  const response = { additionalContext: composeEmethPrompt({ model: currentModel }) };
  // Only mark a model after composing its prompt successfully.
  if (response.additionalContext) recordModel(input);
  return response;
}

module.exports = { load, submit };
