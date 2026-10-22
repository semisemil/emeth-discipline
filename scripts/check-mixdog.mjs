#!/usr/bin/env node

// Run against a Mixdog source checkout with its runtime dependencies available.
// No provider credentials or model calls are used. Only an isolated plugin copy
// is registered, and only this run's dashboard is started/stopped.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/check-mixdog.mjs <Mixdog-source-checkout>');
const mixdogRoot = resolve(source);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = mkdtempSync(join(tmpdir(), 'emeth-mixdog-integration-'));
const pluginRoot = join(root, 'installed');
const projectRoot = join(root, 'project');
const dataDir = join(root, 'mixdog-data');
process.env.MIXDOG_ROOT = join(mixdogRoot, 'src');
process.env.MIXDOG_DATA_DIR = dataDir;
process.env.XDG_CONFIG_HOME = join(root, 'config');
process.env.APPDATA = join(root, 'config');
delete process.env.MIXDOG_HOOKS_FILE;

const upstream = relative => import(pathToFileURL(join(mixdogRoot, relative)).href);
let control;
try {
  cpSync(join(repoRoot, 'plugins/emeth-discipline'), pluginRoot, { recursive: true });
  mkdirSync(projectRoot);
  const { addPlugin, setPluginEnabled } = await upstream('src/session-runtime/services/plugin-admin.mjs');
  const { collectSkills, buildSkillManifest, loadSkillResource } = await upstream('src/runtime/agent/orchestrator/context/skill-catalog.mjs');
  const { createStandaloneHookBus } = await upstream('src/session-runtime/services/hook-bus.mjs');
  const { AGENT_TOOL } = await upstream('src/session-runtime/services/agent-tool/tool-def.mjs');
  const plugin = addPlugin(pluginRoot, { dataDir });
  assert.equal(plugin.name, 'emeth-discipline');
  assert.equal(plugin.version, JSON.parse(readFileSync(join(pluginRoot, '.codex-plugin/plugin.json'))).version);
  const expected = readdirSync(join(pluginRoot, 'skills')).sort();
  const skills = collectSkills(projectRoot).filter(skill => skill.plugin === plugin.id);
  assert.deepEqual(skills.map(skill => skill.name).sort(), expected);
  assert.ok(skills.every(skill => skill.whenToUse));
  assert.match(buildSkillManifest(skills), /implement a ready Design with pstack playbooks/);
  const loaded = loadSkillResource('start-implementation', projectRoot);
  assert.equal(loaded.filePath, join(pluginRoot, 'skills/start-implementation/SKILL.md'));
  assert.match(loaded.content, /references\/playbooks\/feature\.md/);
  console.log(`Plugin ${plugin.version}: ${skills.length} skills discovered with selection triggers`);

  const require = createRequire(import.meta.url);
  const { composeMixdogPrompt } = require(join(pluginRoot, 'lib/rules-prompt.js'));
  const baseline = composeMixdogPrompt({ pluginRoot });
  const bus = createStandaloneHookBus({ dataDir });
  const started = await bus.dispatch('SessionStart', { cwd: projectRoot, session_id: 'integration', source: 'startup' });
  assert.deepEqual(started.additionalContext, [baseline]);
  assert.equal(started.handlersRun, 1);
  const restored = await bus.dispatch('UserPromptSubmit', { cwd: projectRoot, session_id: 'integration', prompt: 'Continue.' });
  assert.deepEqual(restored.additionalContext, [baseline]);
  const args = { type: 'spawn', agent: 'worker', tag: 'integration-worker', cwd: projectRoot, prompt: 'Read the requested contract.', context: 'Existing context' };
  const decision = await bus.beforeTool({ cwd: projectRoot, name: 'agent', args });
  assert.equal(decision.action, 'modify');
  assert.equal(decision.args.context, `${args.context}\n\n${baseline}`);
  assert.deepEqual({ ...decision.args, context: args.context }, args);
  for (const field of Object.keys(decision.args)) assert.ok(Object.hasOwn(AGENT_TOOL.inputSchema.properties, field), field);
  assert.equal(AGENT_TOOL.inputSchema.additionalProperties, false);
  console.log('Native Mixdog hook bus: session/user rules and schema-valid worker context verified');
  const delivery = spawnSync(process.execPath, ['--experimental-test-module-mocks',
    join(repoRoot, 'scripts/check-mixdog-delivery.mjs')], {
    encoding: 'utf8', timeout: 30_000,
    input: JSON.stringify({ mixdogRoot, projectRoot, dataDir, baseline, args: decision.args }),
  });
  assert.equal(delivery.status, 0, delivery.stderr || delivery.error?.message);
  process.stdout.write(delivery.stdout);

  control = require(join(pluginRoot, 'dashboard/control.js'));
  assert.equal((await control.inspectServer()).status, 'stopped');
  let openedUrl;
  const status = await control.openDashboard({ browserLauncher(url) { openedUrl = url; } });
  assert.equal(status.action, 'opened');
  assert.equal(status.status, 'running');
  assert.equal(new URL(openedUrl).port, '43127');
  assert.equal(status.version, plugin.version);
  for (const route of ['/api/v1/health', '/', '/dashboard', '/architecture']) {
    const response = await fetch(`http://127.0.0.1:${status.port}${route}`);
    assert.equal(response.status, 200, route);
    assert.ok((await response.text()).length, route);
  }
  console.log('SessionStart leaves dashboard stopped; explicit open and all three pages verified');
  setPluginEnabled(plugin.id, false, { dataDir });
  assert.equal(collectSkills(projectRoot).filter(skill => skill.plugin === plugin.id).length, 0);
  const disabled = await bus.dispatch('UserPromptSubmit', { cwd: projectRoot, prompt: 'Continue.' });
  assert.equal(disabled.handlersRun, undefined);
  assert.equal(disabled.additionalContext, undefined);
  assert.deepEqual(bus.status().configuredEvents, []);
  console.log('Plugin disable: contributed skills and hooks are removed');
} finally {
  control ||= createRequire(import.meta.url)(join(pluginRoot, 'dashboard/control.js'));
  await control.stopServer();
  rmSync(root, { recursive: true, force: true, maxRetries: 10 });
}
