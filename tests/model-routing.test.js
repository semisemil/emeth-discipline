'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const pluginRoot = path.resolve(__dirname, '../plugins/emeth-discipline');
const command = path.join(pluginRoot, 'lib/model-routing.js');

test('model guidance uses the active host', () => {
  const env = { ...process.env };
  for (const key of [
    'PLUGIN_DATA', 'PLUGIN_ROOT', 'CLAUDE_PLUGIN_DATA', 'CLAUDE_PLUGIN_ROOT',
    'MIXDOG_PLUGIN_DATA', 'MIXDOG_PLUGIN_ROOT', 'MIXDOG_DATA_DIR', 'MIXDOG_ROOT', 'MIXDOG_HOME',
    'CODEX_THREAD_ID', 'CLAUDECODE',
  ]) delete env[key];
  for (const [signals, file] of [
    [{ CODEX_THREAD_ID: 'active-codex-session' }, 'codex.md'],
    [{ CLAUDECODE: '1' }, 'claude-code.md'],
    [{ PLUGIN_ROOT: pluginRoot, CLAUDE_PLUGIN_ROOT: pluginRoot }, 'codex.md'],
    [{ MIXDOG_PLUGIN_ROOT: pluginRoot, CLAUDE_PLUGIN_ROOT: pluginRoot }, 'codex.md'],
  ]) {
    const result = spawnSync(process.execPath, [command], {
      cwd: __dirname, env: { ...env, ...signals }, encoding: 'utf8', windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, fs.readFileSync(path.join(pluginRoot, 'references/model-routing', file), 'utf8'));
  }
});
