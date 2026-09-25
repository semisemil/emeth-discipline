'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  dashboardDirectory,
  startServer,
  stopServer,
} = require('../dashboard/control.js');

const repoRoot = path.resolve(__dirname, '..');
const registerCli = path.join(repoRoot, 'dashboard', 'register-project.js');

function request(port, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      family: 4,
      host: '127.0.0.1',
      method: options.method || 'GET',
      path: pathname,
      port,
      headers: {
        Host: `127.0.0.1:${port}`,
        ...(options.origin ? { Origin: `http://127.0.0.1:${port}` } : {}),
      },
    };
    const outgoing = http.request(requestOptions, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({
        body,
        headers: response.headers,
        status: response.statusCode,
      }));
    });
    outgoing.once('error', reject);
    outgoing.end();
  });
}

function issue(id, title, context = []) {
  return {
    schema_version: 2,
    identity: { id, aliases: [], type: 'feature', mode: 'simple', title, risk: 'low' },
    origin: { kind: 'request', summary: title, refs: [] },
    state: { status: 'open', current_summary: `${title} current`, next_action: `${title} next` },
    objective: { summary: title, constraints: [] },
    criteria: [{ id: 'C1', text: title, evidence_refs: [] }],
    milestones: [], relations: [], context, artifacts: [], evidence: [], events: [],
    created_at: '2026-08-19T00:00:00.000Z',
    updated_at: '2026-08-19T00:00:00.000Z',
  };
}

function createProject(root, name, linked = false) {
  const projectRoot = path.join(root, name);
  const issues = path.join(projectRoot, '.emeth', 'issues');
  fs.mkdirSync(issues, { recursive: true });
  const context = linked ? [
    { kind: 'Plan', location: '.emeth/plan/PLAN-0001-flow/PLAN.md' },
    { kind: 'Spec', location: '.emeth/specs/SPEC-0001-flow/SPEC.md' },
  ] : [];
  const id = linked ? 'PL-0001' : 'PL-0002';
  fs.writeFileSync(path.join(issues, `${id}.json`), JSON.stringify(issue(id, name, context)), 'utf8');
  if (linked) {
    const plan = path.join(projectRoot, '.emeth', 'plan', 'PLAN-0001-flow');
    const spec = path.join(projectRoot, '.emeth', 'specs', 'SPEC-0001-flow');
    fs.mkdirSync(plan, { recursive: true });
    fs.mkdirSync(spec, { recursive: true });
    fs.writeFileSync(path.join(plan, 'PLAN.md'), [
      '---',
      'id: PLAN-0001',
      'title: Initial plan',
      'status: ready',
      'related_issues:',
      '  - PL-0001',
      '---',
      'initial plan body',
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(spec, 'SPEC.md'), [
      '---',
      JSON.stringify({
        schema_version: 2,
        id: 'SPEC-0001',
        title: 'Initial spec',
        kind: 'feature',
        status: 'ready',
        revision: 1,
        supersedes: [],
        superseded_by: null,
        related_issues: ['PL-0001'],
      }, null, 2),
      '---',
      'initial spec body',
    ].join('\n'), 'utf8');
  }
  return projectRoot;
}

function register(projectRoot, env) {
  const result = spawnSync(process.execPath, [
    registerCli,
    'register',
    '--project-root',
    projectRoot,
  ], { cwd: repoRoot, encoding: 'utf8', env });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).project.id;
}

test('registration, child server, project switching, refresh, and unavailable removal stay isolated', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-refresh-integration-'));
  const appData = path.join(root, 'config');
  const env = { ...process.env, APPDATA: appData };
  const originalAppData = process.env.APPDATA;
  process.env.APPDATA = appData;
  const serverDirectory = dashboardDirectory({ env });
  let running = null;
  t.after(async () => {
    if (running) {
      await stopServer({ directory: serverDirectory, expectedVersion: '0.6.2' });
    }
    if (originalAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = originalAppData;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const firstRoot = createProject(root, 'alpha', true);
  const secondRoot = createProject(root, 'beta', false);
  const existingDashboard = path.join(secondRoot, '.emeth', 'dashboard');
  fs.mkdirSync(existingDashboard, { recursive: true });
  const preserved = path.join(existingDashboard, 'user-owned.txt');
  fs.writeFileSync(preserved, 'keep', 'utf8');
  const firstId = register(firstRoot, env);
  const secondId = register(secondRoot, env);

  running = await startServer({ directory: serverDirectory, expectedVersion: '0.6.2' });
  assert.equal(running.ok, true);
  assert.equal(running.action, 'started');
  assert.match(running.url, /^http:\/\/127\.0\.0\.1:/);

  const browserShell = await request(running.port, '/dashboard?expected_version=0.6.2');
  assert.equal(browserShell.status, 200);
  assert.match(browserShell.body, /<h1 id="view-title">작업 현황<\/h1>/);
  assert.match(browserShell.headers['content-security-policy'], /default-src 'self'/);
  const browserApp = await request(running.port, '/app.js');
  assert.equal(browserApp.status, 200);
  assert.match(browserApp.body, /visibilitychange/);
  assert.match(browserApp.body, /setInterval[\s\S]*30000/);

  const listed = JSON.parse((await request(running.port, '/api/v1/projects')).body).projects;
  assert.deepEqual(new Set(listed.map((project) => project.id)), new Set([firstId, secondId]));
  const firstIndex = JSON.parse((await request(
    running.port,
    `/api/v1/projects/${firstId}/index`,
  )).body);
  assert.equal(firstIndex.issues[0].id, 'PL-0001');
  assert.equal(firstIndex.plans[0].id, 'PLAN-0001');
  assert.equal(firstIndex.specs[0].id, 'SPEC-0001');
  assert.ok(firstIndex.flow_signals.some((signal) => signal.signal === 'implementation-ready'));
  const secondIndex = JSON.parse((await request(
    running.port,
    `/api/v1/projects/${secondId}/index`,
  )).body);
  assert.equal(secondIndex.issues[0].id, 'PL-0002');

  const opened = JSON.parse((await request(
    running.port,
    `/api/v1/projects/${firstId}/documents/plan/PLAN-0001`,
  )).body);
  assert.equal(opened.body, 'initial plan body');
  const planPath = path.join(firstRoot, '.emeth', 'plan', 'PLAN-0001-flow', 'PLAN.md');
  fs.writeFileSync(planPath, [
    '---',
    'id: PLAN-0001',
    'title: Refreshed plan',
    'status: draft',
    'related_issues:',
    '  - PL-0001',
    '---',
    'refreshed plan body',
  ].join('\n'), 'utf8');
  const refreshed = JSON.parse((await request(
    running.port,
    `/api/v1/projects/${firstId}/index`,
  )).body);
  assert.equal(refreshed.plans[0].status, 'draft');
  const reopened = JSON.parse((await request(
    running.port,
    `/api/v1/projects/${firstId}/documents/plan/PLAN-0001`,
  )).body);
  assert.equal(reopened.body, 'refreshed plan body');
  assert.equal(JSON.parse((await request(
    running.port,
    `/api/v1/projects/${secondId}/index`,
  )).body).read_at, secondIndex.read_at);

  const archivedFirst = path.join(root, 'alpha-archived');
  fs.renameSync(firstRoot, archivedFirst);
  const unavailable = JSON.parse((await request(running.port, '/api/v1/projects')).body).projects
    .find((project) => project.id === firstId);
  assert.equal(unavailable.availability, 'unavailable');
  const removed = await request(running.port, `/api/v1/projects/${firstId}`, {
    method: 'DELETE',
    origin: true,
  });
  assert.equal(removed.status, 204);
  const remaining = JSON.parse((await request(running.port, '/api/v1/projects')).body).projects;
  assert.deepEqual(remaining.map((project) => project.id), [secondId]);
  assert.equal(fs.readFileSync(preserved, 'utf8'), 'keep');
  assert.equal(fs.readFileSync(
    path.join(archivedFirst, '.emeth', 'plan', 'PLAN-0001-flow', 'PLAN.md'),
    'utf8',
  ).includes('refreshed plan body'), true);
});
