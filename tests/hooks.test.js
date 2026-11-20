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
  fs.cpSync(pluginRoot, plugin, { recursive: true });
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

function requestSource(response) {
  const context = response.hookSpecificOutput?.additionalContext || '';
  const source = context.split('\n').find(line => line.startsWith('Current request source: '))?.slice('Current request source: '.length);
  assert.ok(source, 'The workflow receives an original request path');
  assert.ok(path.isAbsolute(source));
  return source;
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

test('Codex figure-it-out preserves the exact request without a Design number', (t) => {
  const f = fixture(t);
  for (const [index, invocation] of ['/emeth-discipline:figure-it-out', '$emeth-discipline:figure-it-out'].entries()) {
    const prompt = `${invocation}\r\n상태는 \`new\`, \`done\`, \`failed\`입니다.\r\n[계약](docs/contract.md)와 "원문"\\literal, 🧪을 유지하세요.  \n`;
    const input = { session_id: `session-${index}`, turn_id: 'turn-a', prompt };
    const response = output(f.run(input));
    assert.doesNotMatch(response.hookSpecificOutput.additionalContext, /\bDESIGN-\d{4,}\b/);
    const source = requestSource(response);
    assert.deepEqual(fs.readFileSync(source), Buffer.from(prompt, 'utf8'));
    assert.equal(output(f.run(input)).hookSpecificOutput.additionalContext, response.hookSpecificOutput.additionalContext);

    const later = prompt + '추가 요구사항';
    const nextSource = requestSource(output(f.run({ ...input, turn_id: 'turn-b', prompt: later })));
    const otherSessionSource = requestSource(output(f.run({ ...input, session_id: `other-session-${index}` })));
    assert.equal(new Set([source, nextSource, otherSessionSource]).size, 3);
    assert.deepEqual(fs.readFileSync(nextSource), Buffer.from(later, 'utf8'));
    assert.deepEqual(fs.readFileSync(otherSessionSource), Buffer.from(prompt, 'utf8'));
    assert.deepEqual(fs.readFileSync(source), Buffer.from(prompt, 'utf8'));
  }
});

test('direct Codex design and implementation entries retain their request sources', (t) => {
  const f = fixture(t);
  for (const skill of ['development-design', 'start-implementation']) {
    for (const sigil of ['/', '$']) {
      const prompt = `${sigil}emeth-discipline:${skill}\r\n원문을 \\그대로 보존하세요.\n`;
      const input = { turn_id: `${skill}-${sigil === '/' ? 'slash' : 'mention'}`, prompt };
      const response = output(f.run(input));
      if (skill === 'development-design') assert.match(response.hookSpecificOutput.additionalContext, /\bDESIGN-0001\b/);
      const source = requestSource(response);
      assert.deepEqual(fs.readFileSync(source), Buffer.from(prompt, 'utf8'));
      assert.equal(requestSource(output(f.run(input))), source);
    }
  }
});

test('ordinary text and similar skill names do not number or capture a request', (t) => {
  const f = fixture(t);
  const prompts = [
    'figure-it-out을 사용해 조사해 주세요.',
    '다음 작업은 $emeth-discipline:figure-it-out으로 진행합니다.',
    '/emeth-discipline:figure-it-out-later 조사해 주세요.',
    '$emeth-discipline:development-design-review 검토해 주세요.',
    '/emeth-discipline:start-implementation-later 구현해 주세요.',
  ];
  for (const [index, prompt] of prompts.entries()) {
    assert.deepEqual(output(f.run({ turn_id: `ordinary-${index}`, prompt })), {});
  }
  assert.equal(fs.existsSync(path.join(f.env.PLUGIN_DATA, 'request-sources')), false);
});

test('startup, resume, compact and subagents keep their prompt and memory lifecycle boundaries', (t) => {
  const f = fixture(t); f.memory();
  output(f.run({ prompt: '$emeth-discipline focus' }));
  const start = output(f.run({ hook_event_name: 'SessionStart', source: 'startup' }));
  const context = start.hookSpecificOutput.additionalContext;
  const cli = JSON.stringify(path.join(f.plugin, 'skills', 'architecture-memory', 'scripts', 'memory.js').split(path.sep).join('/'));
  const project = JSON.stringify(f.root.split(path.sep).join('/'));
  assert.ok(context.startsWith(codexRules + '\n\n'));
  assert.ok(context.includes(`node ${cli} lookup --project-root ${project} --topic "<subject>"`));
  assert.match(context, /Use --history for past decisions or missing rationale/);
  assert.match(context, /architecture-memory\/references\/retrieval\.md/);
  assert.deepEqual(output(f.run({ hook_event_name: 'SessionStart', source: 'resume' })), {});
  const compact = output(f.run({ hook_event_name: 'SessionStart', source: 'compact' }));
  assert.equal(compact.hookSpecificOutput.additionalContext, start.hookSpecificOutput.additionalContext);
  const child = output(f.run({ hook_event_name: 'SubagentStart', agent_id: 'agent-a' }));
  assert.equal(child.hookSpecificOutput.additionalContext, start.hookSpecificOutput.additionalContext);
});

test('subagents receive caller-facing rules instead of user-facing presentation rules', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.plugin, 'skills/rules/codex.md'),
    'Shared rule\n<!-- main-only -->\nAsk the user\n<!-- /main-only -->\n<!-- subagent-only -->\nReport to the caller\n<!-- /subagent-only -->\n');
  const session = output(f.run({ hook_event_name: 'SessionStart', source: 'startup' })).hookSpecificOutput.additionalContext;
  const worker = output(f.run({ hook_event_name: 'SubagentStart', agent_id: 'agent-b' })).hookSpecificOutput.additionalContext;
  assert.match(session, /Shared rule\nAsk the user/);
  assert.match(worker, /Shared rule\nReport to the caller/);
  assert.doesNotMatch(session, /Report to the caller|<!--/);
  assert.doesNotMatch(worker, /Ask the user|<!--/);
});

test('Codex sessions and workers receive the rules for their GPT model generation', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.plugin, 'skills/rules/codex-gpt-6.2.md'), 'GPT-6.2 fixture rules');
  const rules = event => output(f.run(event)).hookSpecificOutput.additionalContext;
  for (const model of ['gpt-6.2-astra', 'gpt-6.2-sol']) {
    assert.equal(rules({ hook_event_name: 'SessionStart', source: 'startup', model }), '# Shared fixture rules\nGPT-6.2 fixture rules');
    assert.equal(rules({ hook_event_name: 'SubagentStart', agent_id: 'worker', model }), '# Shared fixture rules\nGPT-6.2 fixture rules');
  }
  for (const model of ['gpt-6.1-sol', 'gpt-6-astra', undefined]) {
    assert.equal(rules({ hook_event_name: 'SessionStart', source: 'startup', model }), codexRules);
  }
  const claudeEnv = { PLUGIN_ROOT: '', PLUGIN_DATA: '', CLAUDE_PLUGIN_ROOT: f.plugin, CLAUDE_PLUGIN_DATA: path.join(f.root, 'claude-data') };
  assert.equal(output(f.run({ hook_event_name: 'SessionStart', source: 'startup', model: 'gpt-6.2-sol' }, { env: claudeEnv }))
    .hookSpecificOutput.additionalContext, '# Shared fixture rules\nClaude fixture rules');
});

test('a mid-session switch to another Codex model generation replaces the injected rules', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.plugin, 'skills/rules/codex-gpt-6.2.md'), 'GPT-6.2 fixture rules');
  const submit = (model, event = {}) => output(f.run({ prompt: 'Continue.', model, ...event })).hookSpecificOutput?.additionalContext;
  output(f.run({ hook_event_name: 'SessionStart', source: 'startup', model: 'gpt-6.1-sol' }));
  assert.equal(submit('gpt-6.1-sol'), undefined);
  const switched = submit('gpt-6.2-astra');
  assert.match(switched, /^The active model changed\. These Emeth rules replace/);
  assert.ok(switched.endsWith('# Shared fixture rules\nGPT-6.2 fixture rules'));
  assert.equal(submit('gpt-6.2-sol'), undefined);
  assert.equal(submit('gpt-6.1-sol', { agent_id: 'worker' }), undefined);
  assert.ok(submit('gpt-6-astra').endsWith(codexRules));
  assert.equal(submit('gpt-6.2-sol', { session_id: 'unrecorded' }), undefined);
});

test('project opt-in reaches fresh Codex workers and Claude sessions', t => {
  const f = fixture(t);
  f.write('.emeth/work-records.json', '{"schema_version":1,"enabled":true}');
  const codex = output(f.run({hook_event_name:'SubagentStart',agent_id:'opted-in-worker'}));
  assert.match(codex.hookSpecificOutput.additionalContext, /automatic work records: enabled/);
  const claudeEnv = {PLUGIN_ROOT:'',PLUGIN_DATA:'',CLAUDE_PLUGIN_ROOT:f.plugin,CLAUDE_PLUGIN_DATA:path.join(f.root,'claude-data')};
  const claude = output(f.run({hook_event_name:'SessionStart',source:'startup'}, {env:claudeEnv}));
  assert.match(claude.hookSpecificOutput.additionalContext, /automatic work records: enabled/);
});

test('record rules reach only projects with record roots or automatic records', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, '.git'));
  fs.writeFileSync(path.join(f.plugin, 'skills/rules/SKILL.md'),
    '# Shared fixture rules\n<!-- records-only -->\nRecord rules\n<!-- /records-only -->\nApply the rules for the host running this conversation: fixture');
  const withRecords = '# Shared fixture rules\nRecord rules\nCodex fixture rules';
  const rules = () => output(f.run({ hook_event_name: 'SessionStart', source: 'startup' })).hookSpecificOutput.additionalContext;
  const setting = state => spawnSync(process.execPath, [path.join(f.plugin, 'skills/settings/scripts/settings.js'), 'work-records', state],
    { encoding: 'utf8', windowsHide: true, env: f.env });
  assert.equal(rules(), codexRules);
  assert.equal(setting('on').status, 0);
  assert.equal(rules(), withRecords, 'Enabled automatic records keep the record rules before any record exists');
  assert.equal(setting('off').status, 0);
  f.write('.emeth/issues/PL-0001.json', '{}');
  assert.equal(rules(), withRecords);
  assert.equal(output(f.run({ hook_event_name: 'SubagentStart', agent_id: 'worker' })).hookSpecificOutput.additionalContext, withRecords);
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
