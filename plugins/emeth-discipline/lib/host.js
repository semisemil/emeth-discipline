'use strict';

const os = require('node:os');
const path = require('node:path');

function name(env = process.env) {
  // Mixdog supplies Claude compatibility variables as well.
  if (env.MIXDOG_PLUGIN_DATA || env.MIXDOG_PLUGIN_ROOT) return 'mixdog';
  // Codex also supplies CLAUDE_PLUGIN_* compatibility variables.
  if (env.PLUGIN_DATA || env.PLUGIN_ROOT) return 'codex';
  if (env.CLAUDE_PLUGIN_DATA || env.CLAUDE_PLUGIN_ROOT) return 'claude';
  // Native Mixdog shell tools retain the data dir but not hook-only variables.
  if (env.MIXDOG_DATA_DIR || env.MIXDOG_ROOT || env.MIXDOG_HOME) return 'mixdog';
  return 'codex'; // Preserve standalone use by existing Codex scripts.
}

function dataDir(options = {}) {
  const env = options.env || process.env;
  const host = name(env);
  const directory = host === 'mixdog' ? env.MIXDOG_PLUGIN_DATA
    : host === 'codex' ? env.PLUGIN_DATA : env.CLAUDE_PLUGIN_DATA;
  if (directory) return directory;
  if (!options.temporaryFallback) return null;
  return path.join(os.tmpdir(), host === 'codex' ? 'emeth-plugin-state' : `emeth-${host}-plugin-state`);
}

function logDir(options = {}) {
  const env = options.env || process.env;
  const homeDir = options.homeDir || os.homedir();
  if (name(env) === 'codex') return path.join(homeDir, '.codex', 'log');
  const data = dataDir({ env });
  if (name(env) === 'mixdog') {
    return path.join(data || env.MIXDOG_DATA_DIR || path.join(env.MIXDOG_HOME || path.join(homeDir, '.mixdog'), 'data'), 'log');
  }
  return data ? path.join(data, 'log') : path.join(env.CLAUDE_CONFIG_DIR || path.join(homeDir, '.claude'), 'log');
}

module.exports = { name, dataDir, logDir };
