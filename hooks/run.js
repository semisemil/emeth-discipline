#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { migrateWorkingProject, migrateDirectory } = require('../lib/storage-migration');
const path = require('node:path');
const { logDiagnostic } = require('../lib/rules-state');

async function run(input) {
  const event = input.hook_event_name;
  if (!['SessionStart', 'SubagentStart', 'UserPromptSubmit'].includes(event)) return {};
  migrateWorkingProject(typeof input.cwd === 'string' ? input.cwd : process.cwd());
  if (process.env.PLUGIN_DATA) migrateDirectory(process.env.PLUGIN_DATA, 'proofline-mode', 'rules-mode');
  const contexts = [];
  const response = {};
  let failure;

  try {
    const runtime = require('../lib/rules-runtime');
    if (event === 'UserPromptSubmit') {
      const mode = runtime.changeMode(input);
      if (mode.systemMessage) response.systemMessage = mode.systemMessage;
      if (mode.additionalContext) contexts.push(mode.additionalContext);
    } else {
      const context = runtime.load(input);
      if (context) contexts.push(context);
    }
  } catch (error) {
    logDiagnostic({
      hook: event === 'UserPromptSubmit' ? 'rules-mode' : 'load-proofline',
      event, error, pluginRoot: path.resolve(__dirname, '..'),
      skillPath: error.emethFilePath, filePath: error.emethFilePath,
    });
    failure = error;
  }

  if (event === 'UserPromptSubmit') {
    const context = require('../lib/document-number').notice(input);
    if (context) contexts.push(context);
  }
  try {
    const context = require('../lib/architecture-memory').notice(input);
    if (context) contexts.push(context);
  } catch (error) {
    process.stderr.write(`Architecture memory connection unavailable: ${error.code || error.message}\n`);
  }
  if (event === 'SessionStart' && process.env.PROOFLINE_BENCHMARK_DISABLE_DASHBOARD !== '1') {
    try {
      const result = await require('../dashboard/control').startServer();
      if (!result.ok && result.reason !== 'start-in-progress') throw new Error(result.reason);
    } catch (error) {
      // The dashboard must not suppress the prompt or memory connection.
      process.stderr.write(`Emeth Discipline dashboard server not started: ${error.message}\n`);
    }
  }

  if (failure) {
    if (!contexts.length && !response.systemMessage) throw failure;
    const message = `Emeth Discipline prompt unavailable: ${failure.message}`;
    response.systemMessage = [response.systemMessage, message].filter(Boolean).join('\n');
    process.stderr.write(`${message}\n`);
  }
  if (contexts.length) {
    response.hookSpecificOutput = { hookEventName: event, additionalContext: contexts.join('\n\n') };
  }
  return response;
}

async function main() {
  const raw = fs.readFileSync(0, 'utf8');
  const input = raw.trim() ? JSON.parse(raw) : {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a hook event object.');
  const response = await run(input);
  if (Object.keys(response).length) process.stdout.write(JSON.stringify(response));
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Emeth Discipline hook failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { run };
