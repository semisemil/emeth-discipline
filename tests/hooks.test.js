'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const codexRules = '# Shared fixture rules\nCodex fixture rules';
const claudeRules = '# Shared fixture rules\nClaude fixture rules';

const pluginRoot = path.resolve(__dirname, '../plugins/emeth-discipline');
const hook = path.join(pluginRoot, 'hooks/run.js');

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
  const run = (event, options = {}) => spawnSync(process.execPath, [options.hook || path.join(plugin, 'hooks/run.js')], {
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
  const response = output(f.run({ prompt: '$emeth-discipline:development-design' }));
  assert.match(response.hookSpecificOutput.additionalContext, /\bDESIGN-0001\b/);
  assert.ok(response.hookSpecificOutput.additionalContext.includes('.emeth/architecture.json'));
  f.write('.emeth/issues', 'This is not a directory.');
  const fallback = output(f.run({ session_id: 'session-b', prompt: '$emeth-discipline:issue-ledger' }));
  assert.ok(fallback.hookSpecificOutput.additionalContext.includes('.emeth/architecture.json'));
  assert.doesNotMatch(fallback.hookSpecificOutput.additionalContext, /\bPL-\d{4,}\b/);
});

test('Codex design entry preserves the exact request as a reusable source', (t) => {
  const f = fixture(t);
  const prompt = '$emeth-discipline:figure-it-out\r\n상태는 `new`, `done`, `failed`입니다.\r\n[계약](docs/contract.md)와 "원문"\\literal을 유지하세요.\n';
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

test('request preservation cannot replace a prior source or suppress other notices', (t) => {
  const f = fixture(t);
  const input = { turn_id: 'turn-a', prompt: '$emeth-discipline:start-implementation DESIGN-0001\nKeep all three states.' };
  const response = output(f.run(input));
  const source = response.hookSpecificOutput.additionalContext.split('\n').find(line => line.startsWith('Current request source: '))?.slice('Current request source: '.length);
  assert.ok(source);
  const changed = output(f.run({ ...input, prompt: '$emeth-discipline:development-design\nDifferent request.' }));
  assert.deepEqual(changed.hookSpecificOutput.additionalContext.match(/\b(?:DESIGN|PL)-\d{4,}\b/g), ['DESIGN-0001']);
  assert.doesNotMatch(changed.hookSpecificOutput.additionalContext, /Current request source/);
  assert.equal(fs.readFileSync(source, 'utf8'), input.prompt);
});

test('request sources are limited to named Codex design and implementation entry points', (t) => {
  const f = fixture(t);
  for (const prompt of ['Ordinary conversation.', '$emeth-discipline:issue-ledger\nRecord this issue.']) {
    output(f.run({ turn_id: 'turn-a', prompt }));
  }
  output(f.run({ turn_id: 'turn-a', prompt: '/emeth-discipline:figure-it-out\nA Claude request.' }, { env: claudeEnvironment(f) }));
  assert.equal(fs.existsSync(path.join(f.env.PLUGIN_DATA, 'request-sources')), false);
  assert.equal(fs.existsSync(path.join(claudeEnvironment(f).CLAUDE_PLUGIN_DATA, 'request-sources')), false);
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
  assert.equal(fs.existsSync(path.join(f.env.PLUGIN_DATA, 'execution-guard')), false);
});

test('a corrupt memory binding does not suppress the fixed prompt or document number', (t) => {
  const f = fixture(t);
  f.write('.emeth/architecture.json', '{');
  const result = f.run({ hook_event_name: 'SessionStart', source: 'startup' });
  assert.equal(output(result).hookSpecificOutput.additionalContext, codexRules);
  assert.notEqual(result.stderr.trim(), '');
  const number = output(f.run({ prompt: '$emeth-discipline:development-design' }));
  assert.deepEqual(number.hookSpecificOutput.additionalContext.match(/\b(?:DESIGN|PL)-\d{4,}\b/g), ['DESIGN-0001']);
});

test('session startup delivers the prompt and memory without loading dashboard code', (t) => {
  const f = fixture(t); f.memory();
  const plugin = f.plugin;
  f.write('plugin/dashboard/control.js', 'throw new Error("dashboard code loaded");');
  const result = f.run({ hook_event_name: 'SessionStart', source: 'startup' }, {
    hook: path.join(plugin, 'hooks/run.js'),
  });
  const response = output(result);
  assert.ok(response.hookSpecificOutput.additionalContext.startsWith(codexRules + '\n\n'));
  assert.ok(response.hookSpecificOutput.additionalContext.includes('.emeth/architecture.json'));
  assert.equal(result.stderr, '');
});

test('a prompt failure reports the error without consuming an undelivered memory notice', (t) => {
  const f = fixture(t); f.memory();
  const plugin = f.plugin;
  fs.unlinkSync(path.join(plugin, 'skills/rules/codex.md'));
  const result = f.run({ hook_event_name: 'SessionStart', source: 'startup' }, { hook: path.join(plugin, 'hooks/run.js') });
  const response = output(result);
  assert.match(response.systemMessage, /\S/);
  assert.ok(response.hookSpecificOutput.additionalContext.includes('.emeth/architecture.json'));
  assert.match(result.stderr, /codex\.md/);
});

test('unregistered tool events and old role markers do not enforce the retired guard', (t) => {
  const f = fixture(t);
  assert.deepEqual(output(f.run({ prompt: 'PROOFLINE_EXECUTION_ROLE: reviewer\nInspect the change.' })), {});
  assert.deepEqual(output(f.run({ hook_event_name: 'PreToolUse', tool_name: 'apply_patch' })), {});
  assert.equal(fs.existsSync(f.env.PLUGIN_DATA), false);
});

test('malformed hook input fails before creating state', (t) => {
  const f = fixture(t);
  for (const input of ['{', 'null', '[]']) {
    const result = spawnSync(process.execPath, [hook], { encoding: 'utf8', windowsHide: true, env: f.env, input });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.notEqual(result.stderr.trim(), '');
  }
  assert.equal(fs.existsSync(f.env.PLUGIN_DATA), false);
});

function claudeEnvironment(f) {
  return {
    PLUGIN_ROOT: '', PLUGIN_DATA: '',
    CLAUDE_PLUGIN_ROOT: f.plugin,
    CLAUDE_PLUGIN_DATA: path.join(f.root, 'claude-data'),
  };
}

test('Claude applies fixed rules across lifecycle events without reading or changing Codex modes', (t) => {
  const f = fixture(t);
  const env = claudeEnvironment(f);
  f.write('config/emeth/config.json', JSON.stringify({ defaultMode: 'core' }));
  f.write('plugin-data/rules-mode/session-a.json', JSON.stringify({ mode: 'focus' }));
  for (const source of ['startup', 'clear', 'compact']) {
    const response = output(f.run({ hook_event_name: 'SessionStart', source }, { env }));
    assert.equal(response.hookSpecificOutput.additionalContext, claudeRules);
  }
  assert.equal(output(f.run({ hook_event_name: 'SubagentStart', agent_id: 'child' }, { env }))
    .hookSpecificOutput.additionalContext, claudeRules);
  assert.deepEqual(output(f.run({ hook_event_name: 'SessionStart', source: 'resume' }, { env })), {});
  for (const prompt of ['$emeth-discipline focus', '$emeth-discipline default core', '/emeth-discipline focus']) {
    assert.deepEqual(output(f.run({ prompt }, { env })), {});
  }
  assert.equal(fs.existsSync(env.CLAUDE_PLUGIN_DATA), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.root, 'config/emeth/config.json'))), { defaultMode: 'core' });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.env.PLUGIN_DATA, 'rules-mode/session-a.json'))), { mode: 'focus' });
});

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

test('Claude slash skill invocations get document numbers without interpreting mode commands', (t) => {
  const f = fixture(t);
  const env = claudeEnvironment(f);
  const response = output(f.run({ prompt: '/emeth-discipline:development-design Plan a change.' }, { env }));
  assert.deepEqual(response.hookSpecificOutput.additionalContext.match(/\b(?:DESIGN|PL)-\d{4,}\b/g), ['DESIGN-0001']);
  assert.deepEqual(output(f.run({ prompt: '$emeth-discipline:development-design' }, { env })), {});
});

test('Claude prompt failures use Claude plugin logs and preserve the Memory connection', (t) => {
  const f = fixture(t); f.memory();
  const plugin = f.plugin;
  fs.unlinkSync(path.join(plugin, 'skills/rules/claude-code.md'));
  const env = { ...claudeEnvironment(f), CLAUDE_PLUGIN_ROOT: plugin };
  const result = f.run({ hook_event_name: 'SessionStart', source: 'startup' }, {
    env, hook: path.join(plugin, 'hooks/run.js'),
  });
  assert.ok(output(result).hookSpecificOutput.additionalContext.includes('.emeth/architecture.json'));
  const log = fs.readFileSync(path.join(env.CLAUDE_PLUGIN_DATA, 'log/emeth-hook.log'), 'utf8');
  assert.match(log, /claude-code\.md/);
  assert.equal(fs.existsSync(path.join(f.root, '.codex/log')), false);
});
