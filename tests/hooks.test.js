'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const codexRules = '# Shared fixture rules\nCodex fixture rules';

const pluginRoot = path.resolve(__dirname, '../plugins/emeth-discipline');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-hooks-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 10 }));
  const plugin = path.join(root, 'plugin');
  for (const directory of ['hooks', 'lib', 'skills/rules', 'skills/architecture-memory', 'skills/issue-ledger/lib']) {
    fs.cpSync(path.join(pluginRoot, directory), path.join(plugin, directory), { recursive: true });
  }
  fs.writeFileSync(path.join(plugin, 'skills/rules/SKILL.md'), '# Shared fixture rules\nApply the rules for the host running this conversation: fixture');
  fs.writeFileSync(path.join(plugin, 'skills/rules/codex.md'), 'Codex fixture rules');
  fs.writeFileSync(path.join(plugin, 'skills/rules/claude-code.md'), 'Claude fixture rules');
  const env = {
    ...process.env, HOME: root, USERPROFILE: root, PLUGIN_ROOT: plugin,
    APPDATA: path.join(root, 'config'), XDG_CONFIG_HOME: path.join(root, 'config'),
    PLUGIN_DATA: path.join(root, 'plugin-data'),
  };
  const write = (name, text) => {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  };
  const memory = () => {
    write('.emeth/architecture.json', JSON.stringify({ schema_version: 1, root: 'docs/architecture' }));
    write('docs/architecture/.architecture-memory/manifest.json', JSON.stringify({ schema_version: 2, managed: true }));
  };
  const run = (event, options = {}) => spawnSync(process.execPath, [path.join(plugin, 'hooks/run.js')], {
    encoding: 'utf8', windowsHide: true, env: { ...env, ...options.env },
    input: JSON.stringify({ cwd: root, session_id: 'session-a', hook_event_name: 'UserPromptSubmit', ...event }),
  });
  return { root, plugin, env, write, memory, run };
}

function output(result) {
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout) : {};
}

test('numbering and memory notices compose independently, including a failed number lookup', (t) => {
  const f = fixture(t); f.memory();
  const response = output(f.run({ prompt: '/emeth-discipline:development-design' }));
  assert.match(response.hookSpecificOutput.additionalContext, /\bDESIGN-0001\b/);
  assert.ok(response.hookSpecificOutput.additionalContext.includes('.emeth/architecture.json'));
  const issues = path.join(f.root, '.emeth/issues');
  fs.mkdirSync(issues);
  const preload = path.join(f.root, 'deny-issue-read.cjs');
  fs.writeFileSync(preload, `const fs = require('node:fs'); const read = fs.readdirSync;
    fs.readdirSync = (file, ...args) => {
      if (file === ${JSON.stringify(issues)}) throw Object.assign(new Error('Issue read denied'), { code: 'EACCES' });
      return read(file, ...args);
    };`);
  const fallback = output(f.run({ session_id: 'session-b', prompt: '/emeth-discipline:issue-ledger' }, {
    env: { NODE_OPTIONS: '--require ' + JSON.stringify(preload) },
  }));
  assert.ok(fallback.hookSpecificOutput.additionalContext.includes('.emeth/architecture.json'));
  assert.doesNotMatch(fallback.hookSpecificOutput.additionalContext, /\bPL-\d{4,}\b/);
  const entry = JSON.parse(fs.readFileSync(path.join(f.root, '.codex/log/emeth-hook.log'), 'utf8').trim());
  assert.equal(entry.hook, 'next-document-number');
  assert.equal(entry.code, 'EACCES');
  assert.equal(entry.filePath, issues);
});

test('Codex design entry preserves the exact request as a reusable source', (t) => {
  const f = fixture(t);
  const prompt = '/emeth-discipline:figure-it-out\r\n상태는 `new`, `done`, `failed`입니다.\r\n[계약](docs/contract.md)와 "원문"\\literal을 유지하세요.\n';
  const input = { turn_id: 'turn-a', prompt };
  const response = output(f.run(input));
  const source = response.hookSpecificOutput.additionalContext.split('\n').find(line => line.startsWith('Current request source: '))?.slice('Current request source: '.length);
  assert.ok(source, 'The workflow receives an original request path');
  assert.deepEqual(fs.readFileSync(source), Buffer.from(prompt, 'utf8'));
  assert.equal(output(f.run(input)).hookSpecificOutput.additionalContext, response.hookSpecificOutput.additionalContext);
  const later = prompt + '추가 요구사항';
  const next = output(f.run({ turn_id: 'turn-b', prompt: later }));
  const nextSource = next.hookSpecificOutput.additionalContext.split('\n').find(line => line.startsWith('Current request source: ')).slice('Current request source: '.length);
  assert.notEqual(nextSource, source);
  assert.equal(fs.readFileSync(nextSource, 'utf8'), later);
  assert.equal(fs.readFileSync(source, 'utf8'), prompt);
});

test('startup, resume, compact and subagents keep their prompt and memory lifecycle boundaries', (t) => {
  const f = fixture(t); f.memory();
  output(f.run({ prompt: '$emeth-discipline focus' }));
  const start = output(f.run({ hook_event_name: 'SessionStart', source: 'startup' }));
  assert.ok(start.hookSpecificOutput.additionalContext.startsWith(codexRules + '\n\n'));
  assert.deepEqual(output(f.run({ hook_event_name: 'SessionStart', source: 'resume' })), {});
  const compact = output(f.run({ hook_event_name: 'SessionStart', source: 'compact' }));
  assert.equal(compact.hookSpecificOutput.additionalContext, start.hookSpecificOutput.additionalContext);
  const child = output(f.run({ hook_event_name: 'SubagentStart', agent_id: 'agent-a' }));
  assert.equal(child.hookSpecificOutput.additionalContext, start.hookSpecificOutput.additionalContext);
});

function claudeEnvironment(f) {
  return {
    PLUGIN_ROOT: '', PLUGIN_DATA: '',
    CLAUDE_PLUGIN_ROOT: f.plugin,
    CLAUDE_PLUGIN_DATA: path.join(f.root, 'claude-data'),
  };
}

test('host-specific Memory state stays separate for the same project and session', (t) => {
  const f = fixture(t); f.memory();
  const claudeEnv = claudeEnvironment(f);
  const codexEnv = { CLAUDE_PLUGIN_DATA: claudeEnv.CLAUDE_PLUGIN_DATA, CLAUDE_PLUGIN_ROOT: f.plugin };
  const codex = output(f.run({ prompt: '$emeth-discipline focus' }, { env: codexEnv }));
  assert.ok(codex.hookSpecificOutput.additionalContext.includes('.emeth/architecture.json'));
  const claude = output(f.run({ prompt: 'Continue.' }, { env: claudeEnv }));
  assert.ok(claude.hookSpecificOutput.additionalContext.includes('.emeth/architecture.json'));
  assert.deepEqual(output(f.run({ prompt: 'Continue.' }, { env: claudeEnv })), {});
  assert.deepEqual(output(f.run({ prompt: 'Continue.' }, { env: codexEnv })), {});
  for (const directory of [f.env.PLUGIN_DATA, claudeEnv.CLAUDE_PLUGIN_DATA]) {
    assert.equal(fs.readdirSync(path.join(directory, 'architecture-notices')).length, 1);
  }
  assert.equal(fs.existsSync(path.join(claudeEnv.CLAUDE_PLUGIN_DATA, 'rules-mode')), false);
});
