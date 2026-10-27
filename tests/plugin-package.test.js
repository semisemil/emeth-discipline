'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { parse } = require('yaml');

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

test('both marketplaces install the same plugin package', () => {
  assert.equal(codex.plugins[0].source.path, './plugins/emeth-discipline');
  assert.equal(path.resolve(repoRoot, claude.plugins[0].source), packageRoot);
});

test('Codex skill metadata keeps invocation policies and the figure-it-out entry', () => {
  for (const [name, implicit] of [
    ['start-implementation', false], ['ensemble', false], ['code-exploration', false],
    ['architecture-memory-init', false], ['architecture-memory', true],
    ['architecture-memory-update', true], ['architecture-memory-maintain', true], ['figure-it-out', false],
    ['architecture-map', true], ['work-trace', true],
  ]) {
    const metadata = parse(fs.readFileSync(path.join(packageRoot, 'skills', name, 'agents/openai.yaml'), 'utf8'));
    assert.equal(metadata.policy.allow_implicit_invocation, implicit, name);
    assert.ok(metadata.interface.default_prompt.includes('$' + name), name);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, '.codex-plugin/plugin.json'), 'utf8'));
  assert.ok(manifest.interface.defaultPrompt.length <= 3);
  assert.ok(manifest.interface.defaultPrompt.every(prompt => prompt.length <= 128));
  assert.ok(manifest.interface.defaultPrompt.some(prompt => prompt.startsWith('/emeth-discipline:figure-it-out')));
});

test('isolated package delivers host rules and numbering through its hook CLI', t => {
  const f = fixture(t);
  const markers = { codex: 'Fixture Codex rules', claude: 'Fixture Claude rules', mixdog: 'Fixture Mixdog rules' };
  for (const [host, file] of [['codex', 'codex.md'], ['claude', 'claude-code.md'], ['mixdog', 'mixdog.md']]) {
    fs.appendFileSync(path.join(f.plugin, 'skills/rules', file), '\n\n' + markers[host]);
  }
  for (const host of ['codex', 'claude', 'mixdog']) {
    const overrides = host === 'mixdog' ? {
      MIXDOG_PLUGIN_ROOT: f.plugin, MIXDOG_PLUGIN_DATA: path.join(f.root, 'mixdog-data'),
      CLAUDE_PLUGIN_ROOT: f.plugin, CLAUDE_PLUGIN_DATA: path.join(f.root, 'compat-data'),
    } : host === 'claude' ? {
      PLUGIN_ROOT: undefined, PLUGIN_DATA: undefined,
      CLAUDE_PLUGIN_ROOT: f.plugin, CLAUDE_PLUGIN_DATA: path.join(f.root, 'claude-data'),
    } : {};
    const result = f.run('hooks/run.js', [], JSON.stringify({
      hook_event_name: 'SessionStart', source: 'startup', cwd: f.project, session_id: host,
    }), overrides);
    const context = result.hookSpecificOutput.additionalContext;
    const uiRules = host === 'claude' ? 'ui-design.md' : 'ui-design-codex-mixdog.md';
    assert.ok(context.includes(path.join(f.plugin, 'skills/rules/references', uiRules)));
    for (const [source, marker] of Object.entries(markers)) {
      assert.equal(context.includes(marker), source === host, `${host}: ${source}`);
    }
  }
  const number = f.run('hooks/run.js', [], JSON.stringify({
    hook_event_name: 'UserPromptSubmit', prompt: '/emeth-discipline:development-design',
    cwd: f.project, session_id: 'number',
  }));
  assert.deepEqual(number.hookSpecificOutput.additionalContext.match(/\b(?:DESIGN|PL)-\d{4,}\b/g), ['DESIGN-0001']);
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
});

test('isolated package starts its dashboard and serves packaged assets', async t => {
  const f = fixture(t);
  const control = require(path.join(f.plugin, 'dashboard/control.js'));
  const directory = path.join(f.root, 'dashboard-state');
  try {
    const running = await control.startServer({ directory, port: 0, startTimeoutMs: 15000 });
    assert.equal(running.ok, true, JSON.stringify(running));
    assert.equal(running.version, JSON.parse(fs.readFileSync(path.join(f.plugin, '.codex-plugin/plugin.json'), 'utf8')).version);
    const origin = `http://127.0.0.1:${running.port}`;
    for (const [route, file] of [
      [`/?expected_version=${running.version}`, 'index.html'],
      ['/dashboard?project=11111111-1111-4111-8111-111111111111', 'dashboard.html'],
      ['/architecture?project=11111111-1111-4111-8111-111111111111&document=system-context', 'architecture.html'],
    ]) {
      const page = await fetch(origin + route);
      assert.equal(page.status, 200, route);
      assert.equal(await page.text(), fs.readFileSync(path.join(f.plugin, 'dashboard/assets', file), 'utf8'));
    }
    for (const asset of ['core.js', 'motion.js', 'app.js', 'intro.js', 'architecture.js', 'diagrams.js', 'styles.css', 'vendor/pele.global.js']) {
      const response = await fetch(`${origin}/${asset}`);
      assert.equal(response.status, 200, asset);
      assert.equal(await response.text(), fs.readFileSync(path.join(f.plugin, 'dashboard/assets', asset), 'utf8'));
    }
    const font = await fetch(`${origin}/fonts/PretendardVariable.woff2`);
    assert.equal(font.status, 200);
    assert.equal(font.headers.get('content-type'), 'font/woff2');
    const bytes = Buffer.from(await font.arrayBuffer());
    assert.equal(bytes.subarray(0, 4).toString(), 'wOF2');
    assert.equal(bytes.length, fs.statSync(path.join(f.plugin, 'dashboard/assets/fonts/PretendardVariable.woff2')).size);
  } finally {
    await control.stopServer({ directory });
  }
});
