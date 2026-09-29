'use strict';

const {
  getCurrentMode, normalizeMode, setCurrentMode, setDefaultMode,
  getSessionPath, writeJsonAtomic, logDiagnostic,
} = require('./rules-state');
const fs = require('node:fs');
const path = require('node:path');
const { composeEmethPrompt, composeClaudePrompt } = require('./rules-prompt');
const host = require('./host');

const USAGE = '$emeth-discipline [normal|focus|core|default [normal|focus|core]]';

function load(input) {
  if (input.hook_event_name === 'SessionStart' && input.source === 'resume') return '';
  if (host.name() === 'claude') return composeClaudePrompt();
  const state = getCurrentMode(input.session_id, {
    hook: 'load-emeth', event: input.hook_event_name,
  });
  const model = inputModel(input) || (input.hook_event_name === 'SessionStart' ? readModel(input) : undefined);
  const context = composeEmethPrompt(state.mode, { model });
  // SubagentStart carries the parent's session id; never overwrite its model.
  if (input.hook_event_name === 'SessionStart') recordModel(input);
  return context;
}

function modelStatePath(input) {
  const sessionPath = getSessionPath(input.session_id);
  return sessionPath && path.join(path.dirname(path.dirname(sessionPath)), 'rules-model', path.basename(sessionPath));
}

function inputModel(input) {
  return typeof input.model === 'string' ? input.model.trim() || undefined : undefined;
}

function readModel(input) {
  const filePath = modelStatePath(input);
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
  const filePath = modelStatePath(input);
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
  const model = currentModel || previousModel;
  const response = changeMode(input, model);
  if (!response.additionalContext && currentModel && previousModel !== currentModel) {
    const state = getCurrentMode(input.session_id, { hook: 'rules-model', event: input.hook_event_name });
    response.additionalContext = composeEmethPrompt(state.mode, { model });
  }
  // Only mark a model after composing its prompt successfully.
  if (response.additionalContext) recordModel(input);
  return response;
}

function parseCommand(prompt) {
  if (typeof prompt !== 'string') return { isCommand: false };
  const line = prompt.split(/\r?\n/).find((value) => value.trim().length > 0);
  if (!line || !/^\$emeth-discipline(?:$|[ \t])/.test(line.trim())) return { isCommand: false };
  const tokens = line.trim().split(/[ \t]+/);
  if (tokens.length === 1) return { isCommand: true, kind: 'status' };
  if (tokens[1].toLowerCase() === 'default') {
    if (tokens.length === 2) return { isCommand: true, kind: 'default-status' };
    if (tokens.length === 3 && normalizeMode(tokens[2])) {
      return { isCommand: true, kind: 'default-change', mode: normalizeMode(tokens[2]) };
    }
    return { isCommand: true, kind: 'invalid' };
  }
  if (tokens.length === 2 && normalizeMode(tokens[1])) {
    return { isCommand: true, kind: 'change', mode: normalizeMode(tokens[1]) };
  }
  return { isCommand: true, kind: 'invalid' };
}

function changeMode(input, model) {
  if (host.name() !== 'codex') return {};
  const command = parseCommand(input.prompt);
  if (!command.isCommand) return {};
  model = model || inputModel(input) || readModel(input);
  const options = { hook: 'rules-mode', event: 'UserPromptSubmit', initialize: false };
  const before = getCurrentMode(input.session_id, options);
  if (command.kind === 'invalid') {
    return { systemMessage: `Emeth Discipline: 잘못된 명령. 사용법: ${USAGE}` };
  }
  if (command.kind === 'status') {
    return { systemMessage: `Emeth Discipline: 현재 모드 ${before.mode}, 기본 모드 ${before.defaultMode}` };
  }
  if (command.kind === 'default-status') {
    return { systemMessage: `Emeth Discipline: 기본 모드 ${before.defaultMode}` };
  }
  if (command.kind === 'default-change') {
    const defaultResult = setDefaultMode(command.mode, options);
    if (!defaultResult.ok) {
      return { systemMessage: `Emeth Discipline: 기본 모드 저장 실패. 현재 모드 ${before.mode}, 기본 모드 ${before.defaultMode}` };
    }
    const currentResult = setCurrentMode(input.session_id, command.mode, options);
    if (!currentResult.ok && currentResult.reason !== 'session-state-unavailable') {
      return { systemMessage: `Emeth Discipline: 기본 모드 ${command.mode} 저장, 현재 모드 변경 실패 (${before.mode} 유지)` };
    }
    if (before.mode === command.mode) {
      return { systemMessage: `Emeth Discipline: 기본 모드 ${command.mode} 저장, 현재 모드 ${before.mode} 유지` };
    }
    return {
      systemMessage: `Emeth Discipline: 기본 모드와 현재 모드를 ${command.mode}로 변경`,
      additionalContext: composeEmethPrompt(command.mode, { model }),
    };
  }
  const currentResult = setCurrentMode(input.session_id, command.mode, options);
  if (!currentResult.ok) {
    return { systemMessage: `Emeth Discipline: 현재 모드 변경 실패 (${before.mode} 유지)` };
  }
  if (before.mode === command.mode) {
    return { systemMessage: `Emeth Discipline: 현재 모드 ${before.mode} 유지` };
  }
  return {
    systemMessage: `Emeth Discipline: 현재 모드를 ${command.mode}로 변경`,
    additionalContext: composeEmethPrompt(command.mode, { model }),
  };
}

module.exports = { load, changeMode, parseCommand, submit };
