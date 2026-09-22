#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { resolveContract } = require('../../../dashboard/records/development-contracts.js');

function requireValue(condition, message) { if (!condition) throw new Error(message); }

function prepareLaunch({ cwd, design, spec, projectRoot, projectId, model, reasoning }) {
  requireValue(!(design && spec), 'Supply one Design or legacy Spec ID');
  const contract = design || spec;
  requireValue(/^(?:DESIGN|SPEC)-\d{4,}$/.test(contract), 'Supply a Design or legacy Spec ID');
  requireValue([cwd, projectRoot, projectId, model, reasoning].every(value => typeof value === 'string' && value.trim()),
    'Supply the current project, matching saved project, model, and reasoning');
  const root = fs.realpathSync(cwd);
  const savedRoot = fs.realpathSync(projectRoot);
  requireValue(path.relative(root, savedRoot) === '', 'Saved project must match the current project folder');
  resolveContract(root, contract);
  return {
    prompt: `Read ${JSON.stringify(path.resolve(__dirname, '..', 'implement.md'))} and follow it to implement ${contract} in this session.`,
    model,
    thinking: reasoning,
    target: { type: 'project', projectId, environment: { type: 'local' } },
  };
}

function parseArgs(argv) {
  const names = { '--cwd': 'cwd', '--design': 'design', '--spec': 'spec', '--project-root': 'projectRoot',
    '--project-id': 'projectId', '--model': 'model', '--reasoning': 'reasoning' };
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = names[argv[i]];
    requireValue(key && !Object.hasOwn(options, key) && argv[i + 1], 'Supply each supported option once with a value');
    options[key] = argv[i + 1];
  }
  return options;
}

if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify(prepareLaunch(parseArgs(process.argv.slice(2))), null, 2)}\n`); }
  catch (error) { process.stderr.write(`Implementation launch: ${error.message}\n`); process.exitCode = 1; }
}

module.exports = { prepareLaunch, parseArgs };
