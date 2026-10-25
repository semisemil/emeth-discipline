'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { dashboardDirectory, startServer, stopServer } = require('../plugins/emeth-discipline/dashboard/control.js');

const pluginRoot = path.resolve(__dirname, '../plugins/emeth-discipline');

function createProject(root, name) {
  const project = path.join(root, name);
  const issues = path.join(project, '.emeth/issues');
  fs.mkdirSync(issues, { recursive: true });
  const template = fs.readFileSync(path.join(pluginRoot, 'skills/issue-ledger/assets/templates/issue-objective.json'), 'utf8');
  const issue = JSON.parse(template.replace(/REPLACE: [^"]*/g, name));
  issue.identity.id = 'PL-0001';
  issue.created_at = issue.updated_at = '2026-08-19T00:00:00.000Z';
  issue.context = [{ kind: 'Design', location: '.emeth/designs/DESIGN-0001-example/DESIGN.md' }];
  fs.writeFileSync(path.join(issues, 'PL-0001.json'), JSON.stringify(issue));
  const directory = path.join(project, '.emeth/designs/DESIGN-0001-example');
  fs.mkdirSync(directory, { recursive: true });
  const metadata = { schema_version: 2, id: 'DESIGN-0001', title: name, kind: 'feature',
    status: 'ready', revision: 1, supersedes: [], superseded_by: null, related_issues: ['PL-0001'] };
  const document = path.join(directory, 'DESIGN.md');
  fs.writeFileSync(document, `---\n${JSON.stringify(metadata)}\n---\n${name} contract`);
  return { project, document };
}

test('registered projects keep records isolated through child-server reads, refresh and unavailable removal', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-refresh-integration-'));
  const config = path.join(root, 'config');
  const saved = { APPDATA: process.env.APPDATA, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME };
  process.env.APPDATA = process.env.XDG_CONFIG_HOME = config;
  const directory = dashboardDirectory();
  t.after(async () => {
    await stopServer({ directory });
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const first = createProject(root, 'alpha');
  const second = createProject(root, 'beta');
  const register = project => {
    const result = spawnSync(process.execPath, [path.join(pluginRoot, 'dashboard/register-project.js'),
      'register', '--project-root', project], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).project.id;
  };
  const firstId = register(first.project);
  const secondId = register(second.project);
  const running = await startServer({ directory, port: 0 });
  assert.equal(running.ok, true, JSON.stringify(running));
  const origin = `http://127.0.0.1:${running.port}`;
  const get = async route => {
    const response = await fetch(origin + route);
    assert.equal(response.status, 200, route);
    return response.json();
  };
  const listed = await get('/api/v1/projects');
  assert.deepEqual(new Set(listed.projects.map(project => project.id)), new Set([firstId, secondId]));
  const firstIndex = await get(`/api/v1/projects/${firstId}/index`);
  const secondIndex = await get(`/api/v1/projects/${secondId}/index`);
  assert.equal(firstIndex.issues[0].title, 'alpha');
  assert.equal(secondIndex.issues[0].title, 'beta');
  assert.ok(firstIndex.flow_signals.some(signal => signal.signal === 'implementation-ready'));
  const firstRoute = `/api/v1/projects/${firstId}/documents/design/DESIGN-0001`;
  const secondRoute = `/api/v1/projects/${secondId}/documents/design/DESIGN-0001`;
  assert.equal((await get(firstRoute)).body, 'alpha contract');
  assert.equal((await get(secondRoute)).body, 'beta contract');
  fs.writeFileSync(first.document, fs.readFileSync(first.document, 'utf8')
    .replace('"status":"ready"', '"status":"draft"').replace('alpha contract', 'changed alpha contract'));
  const refreshed = await get(`/api/v1/projects/${firstId}/index`);
  assert.equal(refreshed.designs[0].status, 'draft');
  assert.equal((await get(firstRoute)).body, 'changed alpha contract');
  assert.equal((await get(secondRoute)).body, 'beta contract');
  const available = await fetch(`${origin}/api/v1/projects/${secondId}`, { method: 'DELETE', headers: { Origin: origin } });
  assert.equal(available.status, 409);
  fs.renameSync(first.project, path.join(root, 'archived-alpha'));
  const unavailable = (await get('/api/v1/projects')).projects.find(project => project.id === firstId);
  assert.equal(unavailable.availability, 'unavailable');
  const removed = await fetch(`${origin}/api/v1/projects/${firstId}`, { method: 'DELETE', headers: { Origin: origin } });
  assert.equal(removed.status, 204);
  assert.deepEqual((await get('/api/v1/projects')).projects.map(project => project.id), [secondId]);
  assert.equal(fs.readFileSync(second.document, 'utf8').endsWith('beta contract'), true);
  assert.equal(fs.readFileSync(path.join(root, 'archived-alpha/.emeth/designs/DESIGN-0001-example/DESIGN.md'), 'utf8')
    .endsWith('changed alpha contract'), true);
});
