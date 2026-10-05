#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { resolveContract } = require('../../../dashboard/records/development-contracts.js');
const { DESIGN_ID } = require('../../../dashboard/records/record-parser.js');

function requireValue(condition, message) { if (!condition) throw new Error(message); }

function contractFor(design) {
  requireValue(DESIGN_ID.test(design), 'Supply a Design ID');
  return design;
}

function implementationPrompt(contract) {
  return `Read ${JSON.stringify(path.resolve(__dirname, '..', 'implement.md'))} and follow it to implement ${contract} in this session.`;
}

function prepareLaunch({ cwd, design, projectRoot, projectId, model, reasoning }) {
  const contract = contractFor(design);
  requireValue([cwd, projectRoot, projectId, model, reasoning].every(value => typeof value === 'string' && value.trim()),
    'Supply the current project, matching saved project, model, and reasoning');
  const root = fs.realpathSync(cwd);
  const savedRoot = fs.realpathSync(projectRoot);
  requireValue(path.relative(root, savedRoot) === '', 'Saved project must match the current project folder');
  resolveContract(root, contract);
  return {
    prompt: implementationPrompt(contract),
    model,
    thinking: reasoning,
    target: { type: 'project', projectId, environment: { type: 'local' } },
  };
}

// Claude Code runs the implementation as a subagent in the current folder, so no saved project or effort is passed.
function prepareClaudeLaunch({ cwd, design, model }) {
  const contract = contractFor(design);
  requireValue(typeof cwd === 'string' && cwd.trim(), 'Supply the current project');
  requireValue(model === undefined || ['sonnet', 'opus', 'haiku', 'fable'].includes(model),
    'Supply a Claude Code agent model: sonnet, opus, haiku, or fable');
  resolveContract(fs.realpathSync(cwd), contract);
  return {
    subagent_type: 'general-purpose',
    description: `Implement ${contract}`,
    // A subagent cannot ask the user, so it returns blockers instead of deciding them.
    prompt: `${implementationPrompt(contract)} You cannot ask the user. If the contract needs a Design revision or a user decision, or an Emeth command fails, stop: do not revise the Design or change its status another way. Report the blocker, completed changes, and verification to the calling session.`,
    ...(model ? { model } : {}),
  };
}

function parseArgs(argv) {
  const names = { '--cwd': 'cwd', '--design': 'design', '--project-root': 'projectRoot',
    '--project-id': 'projectId', '--model': 'model', '--reasoning': 'reasoning', '--host': 'host' };
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = names[argv[i]];
    requireValue(key && !Object.hasOwn(options, key) && argv[i + 1], 'Supply each supported option once with a value');
    options[key] = argv[i + 1];
  }
  return options;
}

if (require.main === module) {
  try {
    const { host, ...options } = parseArgs(process.argv.slice(2));
    requireValue(host === undefined || host === 'codex' || host === 'claude', 'Supply --host codex or claude');
    const launch = host === 'claude' ? prepareClaudeLaunch(options) : prepareLaunch(options);
    process.stdout.write(`${JSON.stringify(launch, null, 2)}\n`);
  } catch (error) { process.stderr.write(`Implementation launch: ${error.message}\n`); process.exitCode = 1; }
}

module.exports = { prepareLaunch, prepareClaudeLaunch, parseArgs };
