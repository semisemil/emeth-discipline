'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const plugin = path.resolve(__dirname, '../plugins/emeth-discipline');
const KOREAN_RULES = '## Korean writing';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-language-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 10 }));
  const project = path.join(root, 'project');
  fs.mkdirSync(project);
  const env = { ...process.env, HOME: root, USERPROFILE: root,
    APPDATA: path.join(root, 'config'), XDG_CONFIG_HOME: path.join(root, 'config'),
    PLUGIN_ROOT: plugin, PLUGIN_DATA: path.join(root, 'plugin-data'),
    CLAUDE_PLUGIN_ROOT: '', CLAUDE_PLUGIN_DATA: '', EMETH_BENCHMARK_DISABLE_DASHBOARD: '1' };
  const node = (script, args, input) => spawnSync(process.execPath, [path.join(plugin, script), ...args], {
    cwd: project, env, encoding: 'utf8', windowsHide: true, input });
  const settings = (...args) => node('skills/settings/scripts/settings.js', args);
  function rules(event) {
    const result = node('hooks/run.js', [], JSON.stringify({ cwd: project, session_id: 'language',
      hook_event_name: event, source: 'startup' }));
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  }
  return { settings, rules };
}

test('language ko adds the Korean writing rules to injected rules until it is turned off', t => {
  const f = fixture(t);
  assert.ok(!f.rules('SessionStart').includes(KOREAN_RULES), 'No language rules by default');

  const enabled = f.settings('language', 'ko');
  assert.equal(enabled.status, 0, enabled.stderr);
  const result = JSON.parse(enabled.stdout);
  assert.deepEqual(result.settings.language, { value: 'ko', configured: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(result.path, 'utf8')), { schema_version: 1, language: 'ko' });
  for (const event of ['SessionStart', 'SubagentStart']) {
    const text = f.rules(event);
    assert.ok(text.startsWith('# Rules'), 'Shared rules stay first');
    assert.ok(text.includes(KOREAN_RULES), `${event} carries the Korean rules`);
  }

  const disabled = JSON.parse(f.settings('language', 'off').stdout);
  assert.deepEqual(disabled.settings.language, { value: null, configured: false });
  assert.deepEqual(JSON.parse(fs.readFileSync(disabled.path, 'utf8')), { schema_version: 1 });
  assert.ok(!f.rules('SessionStart').includes(KOREAN_RULES));
});

test('language keeps the other settings and rejects languages without rules', t => {
  const f = fixture(t);
  assert.equal(f.settings('inbox', 'on').status, 0);
  const result = JSON.parse(f.settings('language', 'ko').stdout);
  assert.equal(result.settings.inbox.enabled, true);

  for (const args of [['language', 'en'], ['language', 'on'], ['inbox', 'ko']]) {
    const rejected = f.settings(...args);
    assert.equal(rejected.status, 2, args.join(' '));
    assert.match(rejected.stderr, /language <ko\|off>/);
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(result.path, 'utf8')), { schema_version: 1, inbox: true, language: 'ko' });
});

test('an unreadable settings file still delivers the shared rules without language rules', t => {
  const f = fixture(t);
  const file = JSON.parse(f.settings('status').stdout).path;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{"schema_version":1,"language":"xx"}');
  const text = f.rules('SessionStart');
  assert.ok(text.startsWith('# Rules'));
  assert.ok(!text.includes(KOREAN_RULES));
});
