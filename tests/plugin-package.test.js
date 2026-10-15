'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const codex = JSON.parse(fs.readFileSync(path.join(repoRoot, '.agents/plugins/marketplace.json'), 'utf8'));
const claude = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude-plugin/marketplace.json'), 'utf8'));
const packageRoot = path.resolve(repoRoot, codex.plugins[0].source.path);

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-package-'));
  const plugin = path.join(root, 'installed');
  const project = path.join(root, 'project');
  fs.cpSync(packageRoot, plugin, { recursive: true });
  fs.mkdirSync(project);
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 10 }));
  const env = {
    ...process.env, APPDATA: path.join(root, 'config'), XDG_CONFIG_HOME: path.join(root, 'config'),
    HOME: path.join(root, 'home'), USERPROFILE: path.join(root, 'home'),
    PLUGIN_ROOT: plugin, PLUGIN_DATA: path.join(root, 'data'),
    EMETH_BENCHMARK_DISABLE_DASHBOARD: '1',
  };
  function run(relative, args = [], input, overrides = {}) {
    const result = spawnSync(process.execPath, [path.join(plugin, relative), ...args], {
      cwd: project, env: { ...env, ...overrides }, input, encoding: 'utf8', windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }
  return { root, plugin, project, env, run };
}

test('both marketplaces install the same package without repository development files', () => {
  assert.equal(codex.plugins[0].source.path, './plugins/emeth-discipline');
  assert.equal(path.resolve(repoRoot, claude.plugins[0].source), packageRoot);
  assert.deepEqual(fs.readdirSync(packageRoot).sort(), [
    '.claude-plugin', '.codex-plugin', 'LICENSE',
    'assets', 'dashboard', 'hooks', 'lib', 'skills', 'writers',
  ].sort());
  assert.deepEqual(fs.readdirSync(path.join(packageRoot, '.claude-plugin')), ['plugin.json']);
  for (const relative of fs.readdirSync(packageRoot, { recursive: true })) {
    assert.doesNotMatch(path.basename(relative), /^(AGENTS|CLAUDE|CONTEXT)\.md$/i);
  }
  for (const formerSource of ['assets', 'dashboard', 'hooks', 'lib', 'skills', 'writers',
    '.codex-plugin/plugin.json', '.claude-plugin/plugin.json', 'scripts/build-plugin.js']) {
    assert.equal(fs.existsSync(path.join(repoRoot, formerSource)), false, formerSource);
  }
});

test('isolated package delivers host rules and numbering through its hook CLI', t => {
  const f = fixture(t);
  for (const host of ['codex', 'claude']) {
    const overrides = host === 'claude' ? {
      PLUGIN_ROOT: undefined, PLUGIN_DATA: undefined,
      CLAUDE_PLUGIN_ROOT: f.plugin, CLAUDE_PLUGIN_DATA: path.join(f.root, 'claude-data'),
    } : {};
    const result = f.run('hooks/run.js', [], JSON.stringify({
      hook_event_name: 'SessionStart', source: 'startup', cwd: f.project, session_id: host,
    }), overrides);
    const context = result.hookSpecificOutput.additionalContext;
    const rules = fs.readFileSync(path.join(f.plugin, `skills/rules/${host === 'codex' ? 'codex' : 'claude-code'}.md`), 'utf8')
      .replaceAll('{{plugin-root}}', f.plugin).trim();
    assert.ok(context.includes(rules));
    assert.ok(context.includes(path.join(f.plugin, 'skills/rules/references/ui-design.md')));
    assert.doesNotMatch(context, /skill-prompt-authoring-principles/);
  }
  const number = f.run('hooks/run.js', [], JSON.stringify({
    hook_event_name: 'UserPromptSubmit', prompt: '$emeth-discipline:development-design',
    cwd: f.project, session_id: 'number',
  }));
  assert.equal(number.hookSpecificOutput.additionalContext, 'Next design number: DESIGN-0001');
});

test('isolated package writes and reads a Design with its bundled dependencies', t => {
  const f = fixture(t);
  const body = '# 알림 설계\n\n저장 완료 후 알린다.\n';
  const created = f.run('writers/document-writer.js', [
    'create', '--project-root', f.project, '--title', '알림 설계', '--slug', 'notification', '--memory', 'off',
  ], body);
  assert.equal(created.write.id, 'DESIGN-0001');
  const read = f.run('writers/document-writer.js', ['read', '--project-root', f.project, '--id', 'DESIGN-0001']);
  assert.equal(read.id, 'DESIGN-0001');
  assert.ok(read.text.includes(body));
  fs.mkdirSync(path.join(f.project, '.emeth/issues'), { recursive: true });
  const issues = spawnSync(process.execPath, [path.join(f.plugin, 'skills/issue-ledger/scripts/issue-ledger.js'), 'validate'], {
    cwd: f.project, env: f.env, encoding: 'utf8', windowsHide: true,
  });
  assert.equal(issues.status, 0, issues.stderr);
  assert.match(issues.stdout, /0개 이슈가 유효합니다/);
});

test('isolated package starts its dashboard and serves packaged assets', async t => {
  const f = fixture(t);
  const control = require(path.join(f.plugin, 'dashboard/control.js'));
  const directory = path.join(f.root, 'dashboard-state');
  try {
    const running = await control.startServer({ directory, startTimeoutMs: 15000 });
    assert.equal(running.ok, true, JSON.stringify(running));
    assert.equal(running.version, JSON.parse(fs.readFileSync(path.join(f.plugin, '.codex-plugin/plugin.json'), 'utf8')).version);
    const page = await fetch(`http://127.0.0.1:${running.port}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<html/i);
    const vendor = await fetch(`http://127.0.0.1:${running.port}/vendor/mermaid.min.js`);
    assert.equal(vendor.status, 200);
  } finally {
    await control.stopServer({ directory });
  }
});
