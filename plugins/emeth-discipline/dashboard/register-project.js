#!/usr/bin/env node

'use strict';

const { registerProject } = require('./registry.js');

function argumentError(code, message) {
  return Object.assign(new Error(message), { code });
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith('--')) {
      throw argumentError('invalid-argument', `알 수 없는 인수입니다: ${value}`);
    }
    const key = value.slice(2).replace(/-/g, '_');
    if (key !== 'project_root') {
      throw argumentError('invalid-argument', `알 수 없는 옵션입니다: ${value}`);
    }
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      throw argumentError('invalid-argument', `옵션이 중복되었습니다: ${value}`);
    }
    const next = rest[index + 1];
    if (next === undefined || next.startsWith('--')) {
      throw argumentError('project-root-invalid', '--project-root 값이 필요합니다.');
    }
    options[key] = next;
    index += 1;
  }
  return { command, options };
}

function formatError(error) {
  return {
    error: {
      code: error.code || 'registration-failed',
      message: error.message
    }
  };
}

function main(argv = process.argv.slice(2)) {
  try {
    const { command, options } = parseArgs(argv);
    if (command !== 'register') {
      throw argumentError('invalid-command', 'Usage: register-project.js register --project-root DIR');
    }
    if (typeof options.project_root !== 'string' || options.project_root.trim() === '') {
      throw Object.assign(new Error('--project-root 값이 필요합니다.'), { code: 'project-root-invalid' });
    }
    const result = registerProject(options.project_root);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result;
  } catch (error) {
    process.stderr.write(`${JSON.stringify(formatError(error))}\n`);
    process.exitCode = 1;
    return null;
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
