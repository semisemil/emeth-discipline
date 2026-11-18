'use strict';

const path = require('node:path');
const { composeEmethPrompt, rulesFile } = require('./rules-prompt');
const host = require('./host');
const { logDiagnostic } = require('./rules-state');
const S = require('../skills/architecture-memory/scripts/storage.js');

function load(input) {
  if (input.hook_event_name === 'SessionStart' && input.source === 'resume') return '';
  const currentHost = host.name();
  const audience = input.hook_event_name === 'SubagentStart' ? 'subagent' : 'main';
  const baseline = composeEmethPrompt({ host: currentHost, audience, model: input.model });
  // SubagentStart carries the parent's session id, so only the main session records its rules file.
  if (currentHost === 'codex' && input.hook_event_name === 'SessionStart') saveRulesFile(input);
  // Codex SessionStart has a separate callback; fresh workers and other hosts need the same policy.
  const context = currentHost !== 'codex' || input.hook_event_name === 'SubagentStart'
    ? require('./work-records-policy').notice(input.cwd) : '';
  return [baseline, context].filter(Boolean).join('\n\n');
}

// A /model switch to another Codex model generation replaces the rules injected at session start.
function reload(input) {
  if (host.name() !== 'codex' || input.agent_id) return '';
  const statePath = rulesStatePath(input.session_id);
  if (!statePath) return '';
  let previous;
  try { previous = S.jsonFile(statePath, 4096)?.rules; } catch { previous = undefined; }
  const current = rulesFile('codex', input.model);
  if (previous === current) return '';
  // Without a record the injected rules are unknown; record them without reinjecting.
  const context = previous ? [
    'The active model changed. These Emeth rules replace the Emeth rules injected earlier in this conversation.',
    composeEmethPrompt({ host: 'codex', audience: 'main', model: input.model }),
  ].join('\n\n') : '';
  saveRules(statePath, current, input);
  return context;
}

function saveRulesFile(input) {
  const statePath = rulesStatePath(input.session_id);
  if (statePath) saveRules(statePath, rulesFile('codex', input.model), input);
}

// A failed record must not withhold the rules; the next submission retries it.
function saveRules(statePath, rules, input) {
  try {
    S.saveJson(statePath, { rules });
  } catch (error) {
    logDiagnostic({ hook: 'rules-file', event: input.hook_event_name, filePath: statePath, error });
  }
}

function rulesStatePath(sessionId) {
  const data = host.dataDir();
  if (!data || typeof sessionId !== 'string' || !sessionId) return null;
  return path.join(data, 'rules-files', `${S.hash(sessionId)}.json`);
}

module.exports = { load, reload };
