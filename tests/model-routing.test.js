'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const pluginRoot = path.resolve(__dirname, '../plugins/emeth-discipline');
const command = path.join(pluginRoot, 'lib/model-routing.js');
const hostVariables = [
  'PLUGIN_DATA', 'PLUGIN_ROOT', 'CLAUDE_PLUGIN_DATA', 'CLAUDE_PLUGIN_ROOT',
  'MIXDOG_PLUGIN_DATA', 'MIXDOG_PLUGIN_ROOT', 'MIXDOG_DATA_DIR', 'MIXDOG_ROOT', 'MIXDOG_HOME',
  'CODEX_THREAD_ID', 'CLAUDECODE',
];

function run(signals, options = {}) {
  const env = { ...process.env };
  for (const key of hostVariables) delete env[key];
  return spawnSync(process.execPath, [options.command || command], {
    cwd: options.cwd || __dirname,
    env: { ...env, ...signals },
    encoding: 'utf8',
    windowsHide: true,
  });
}

function policy(file) {
  return fs.readFileSync(path.join(pluginRoot, 'references/model-routing', file), 'utf8');
}

test('a Codex shell receives the Codex Markdown policy', () => {
  const result = run({ CODEX_THREAD_ID: 'active-codex-session' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, policy('codex.md'));
});

test('a Claude Code shell receives the Claude Markdown policy without plugin variables', () => {
  const result = run({ CLAUDECODE: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, policy('claude-code.md'));
});

test('Codex compatibility variables keep the Codex policy', () => {
  const result = run({ PLUGIN_ROOT: pluginRoot, CLAUDE_PLUGIN_ROOT: pluginRoot });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, policy('codex.md'));
});

test('Mixdog retains its previous Codex model defaults', () => {
  const result = run({ MIXDOG_PLUGIN_ROOT: pluginRoot, CLAUDE_PLUGIN_ROOT: pluginRoot });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, policy('codex.md'));
});

test('an unidentified or ambiguous shell receives no guessed policy', () => {
  for (const signals of [{}, { CODEX_THREAD_ID: 'outer-session', CLAUDECODE: '1' }]) {
    const result = run(signals);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Cannot identify the active agent environment/);
  }
});

test('the command reads only the selected Markdown and returns its saved changes from another working directory', t => {
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'emeth-model-routing-'));
  t.after(() => {
    const relative = path.relative(temporaryRoot, fs.realpathSync(directory));
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const copiedRoot = path.join(directory, 'plugin with spaces');
  const library = path.join(copiedRoot, 'lib');
  const references = path.join(copiedRoot, 'references/model-routing');
  fs.mkdirSync(library, { recursive: true });
  fs.mkdirSync(references, { recursive: true });
  for (const file of ['model-routing.js', 'host.js']) {
    fs.copyFileSync(path.join(pluginRoot, 'lib', file), path.join(library, file));
  }
  const selected = path.join(references, 'claude-code.md');
  const first = '# Task guidance\n\nChoose from the current environment.\n';
  fs.writeFileSync(selected, first);
  const options = { command: path.join(library, 'model-routing.js'), cwd: directory };
  const initial = run({ CLAUDECODE: '1' }, options);
  assert.equal(initial.status, 0, initial.stderr);
  assert.equal(initial.stdout, first);

  const revised = '# Revised guidance\n\nUse the saved policy.\n';
  fs.writeFileSync(selected, revised);
  const updated = run({ CLAUDECODE: '1' }, options);
  assert.equal(updated.status, 0, updated.stderr);
  assert.equal(updated.stdout, revised);

  fs.unlinkSync(selected);
  const missing = run({ CLAUDECODE: '1' }, options);
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, '');
  assert.match(missing.stderr, /ENOENT/);
});
