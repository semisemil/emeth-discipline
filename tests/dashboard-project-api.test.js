'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  SECURITY_HEADERS,
  createDashboardHttpServer,
} = require('../plugins/emeth-discipline/dashboard/server.js');
const { ProjectIndexService } = require('../plugins/emeth-discipline/dashboard/records/project-index.js');
const { MAX_RECORD_BYTES } = require('../plugins/emeth-discipline/dashboard/records/record-parser.js');

const AVAILABLE_ID = '11111111-1111-4111-8111-111111111111';
const UNAVAILABLE_ID = '22222222-2222-4222-8222-222222222222';
const INSTANCE_ID = '33333333-3333-4333-8333-333333333333';

function makeIssue() {
  const template = fs.readFileSync(path.join(__dirname, '../plugins/emeth-discipline/skills/issue-ledger/assets/templates/issue-objective.json'), 'utf8');
  const issue = JSON.parse(template.replace(/REPLACE: [^"]*/g, 'API'));
  issue.identity.id = 'PL-0001';
  issue.created_at = issue.updated_at = '2026-08-17T00:00:00.000Z';
  return issue;
}

async function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-project-api-'));
  const availableRoot = path.join(root, 'available');
  const assetRoot = path.join(root, 'assets');
  const issues = path.join(availableRoot, '.emeth', 'issues');
  fs.mkdirSync(issues, { recursive: true });
  fs.writeFileSync(path.join(issues, 'PL-0001.json'), JSON.stringify(makeIssue()), 'utf8');
  for (const [relativePath, contents] of Object.entries(options.assetFiles || {})) {
    const filePath = path.join(assetRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
  }

  const registryPath = path.join(root, 'config', 'projects.json');
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify({
    schema_version: 1,
    projects: [
      { id: AVAILABLE_ID, root: availableRoot, registered_at: '2026-08-17T00:00:00.000Z' },
    ],
  }), 'utf8');

  const projectService = new ProjectIndexService({
    registryOptions: { registryPath },
    now: () => '2026-08-18T00:00:00.000Z',
  });
  const server = createDashboardHttpServer({
    assetRoot,
    instanceId: INSTANCE_ID,
    version: '0.6.2',
    projectService,
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { availableRoot, server };
}

function rawRequest(server, bytes) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const chunks = [];
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => socket.write(bytes));
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    socket.on('error', reject);
  });
}

function request(server, values = {}) {
  const address = server.address();
  const expectedHost = `127.0.0.1:${address.port}`;
  return new Promise((resolve, reject) => {
    const call = http.request({
      host: '127.0.0.1',
      port: address.port,
      method: values.method || 'GET',
      path: values.path || '/api/v1/health',
      headers: {
        Host: values.host === undefined ? expectedHost : values.host,
        ...(values.origin === undefined ? {} : { Origin: values.origin }),
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
        expectedOrigin: `http://${expectedHost}`,
      }));
    });
    call.once('error', reject);
    call.end();
  });
}

test('HTTP boundary enforces Host, Origin, methods, raw paths, security headers, and HEAD', async (t) => {
  const { server } = await fixture(t);
  const health = await request(server);
  assert.equal(health.status, 200);
  assert.equal(health.headers['content-security-policy'], SECURITY_HEADERS['Content-Security-Policy']);
  assert.equal(health.headers['x-content-type-options'], 'nosniff');
  assert.equal(health.headers['cache-control'], 'no-store');
  assert.equal(health.headers['access-control-allow-origin'], undefined);

  assert.equal((await request(server, { host: 'localhost:1' })).status, 403);
  assert.equal((await request(server, { origin: 'https://example.com' })).status, 403);
  assert.equal((await request(server, { method: 'POST' })).status, 405);
  assert.equal((await request(server, { path: '/dashboard?document=system-context' })).status, 400);
  assert.equal((await request(server, { path: '/architecture?project=invalid' })).status, 400);
  assert.equal((await request(server, {
    method: 'DELETE', path: `/api/v1/projects/${UNAVAILABLE_ID}`,
  })).status, 403);
  assert.equal((await request(server, {
    path: `/api/v1/projects/%252e%252e/documents/issue/PL-0001`,
  })).status, 400);

  const head = await request(server, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.ok(Number(head.headers['content-length']) > 0);
  const connect = await rawRequest(server,
    `CONNECT 127.0.0.1:443 HTTP/1.1\r\nHost: 127.0.0.1:${server.address().port}\r\n\r\n`);
  assert.match(connect, /^HTTP\/1\.1 405 /);
});

test('static dashboard rejects unknown files, directories, traversal, and encoded separators', async (t) => {
  const { server } = await fixture(t, {
    assetFiles: {
      'index.html': '<!doctype html>',
      'nested/asset.js': 'safe',
    },
  });
  assert.equal((await request(server, { path: '/missing.js' })).status, 404);
  assert.equal((await request(server, { path: '/nested/' })).status, 404);
  assert.equal((await request(server, { path: '/nested%2fasset.js' })).status, 400);
  assert.equal((await request(server, { path: '/app.js?cache=1' })).status, 400);

  const { port } = server.address();
  const traversal = await rawRequest(
    server,
    `GET /../external-static/escape.js HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`,
  );
  const [headerText, body] = traversal.split('\r\n\r\n');
  assert.match(headerText, /^HTTP\/1\.1 400\b/);
  assert.equal(JSON.parse(body).error.code, 'request-target-invalid');
});

test('HTTP index rejects records over 2 MiB with a relative-path diagnostic', async (t) => {
  const { availableRoot, server } = await fixture(t);
  const planDirectory = path.join(availableRoot, '.emeth', 'plan', 'PLAN-0010-too-large');
  const planPath = path.join(planDirectory, 'PLAN.md');
  fs.mkdirSync(planDirectory, { recursive: true });
  fs.writeFileSync(planPath, Buffer.concat([
    Buffer.from('---\nid: PLAN-0010\ntitle: Too Large\nstatus: ready\n---\n', 'utf8'),
    Buffer.alloc(MAX_RECORD_BYTES, 0x58),
  ]));
  assert.ok(fs.statSync(planPath).size > MAX_RECORD_BYTES);

  const response = await request(server, {
    path: `/api/v1/projects/${AVAILABLE_ID}/index?refresh=1`,
  });
  assert.equal(response.status, 200);
  const index = JSON.parse(response.body);
  assert.deepEqual(index.plans, []);
  assert.ok(index.diagnostics.some((item) => item.code === 'record-too-large'
    && item.relative_path === '.emeth/plan/PLAN-0010-too-large/PLAN.md'));
});

test('summary and index omit large Plan and Spec bodies while detail returns the complete body', async (t) => {
  const { availableRoot, server } = await fixture(t);
  const records = [
    ['plan', 'PLAN-0008', 'id: PLAN-0008\ntitle: Large Plan\nstatus: ready', 'P'],
    ['specs', 'SPEC-0008', JSON.stringify({ schema_version: 2, id: 'SPEC-0008',
      title: 'Large Spec', kind: 'feature', status: 'ready', revision: 1,
      supersedes: [], superseded_by: null, related_issues: [] }), 'S'],
  ];
  for (const [collection, id, metadata, character] of records) {
    const directory = path.join(availableRoot, '.emeth', collection, id + '-large');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, id.split('-')[0] + '.md'),
      '---\n' + metadata + '\n---\n' + character.repeat(128 * 1024));
  }
  const sidebar = await request(server, { path: '/api/v1/projects' });
  assert.equal(sidebar.status, 200);
  assert.doesNotMatch(sidebar.body, /P{128}|S{128}/);

  const index = await request(server, {
    path: `/api/v1/projects/${AVAILABLE_ID}/index`,
  });
  assert.equal(index.status, 200);
  assert.ok(JSON.parse(index.body).plans.some(record => record.id === 'PLAN-0008'));
  assert.ok(JSON.parse(index.body).specs.some(record => record.id === 'SPEC-0008'));
  assert.doesNotMatch(index.body, /P{128}|S{128}/);

  const document = await request(server, {
    path: `/api/v1/projects/${AVAILABLE_ID}/documents/plan/PLAN-0008`,
  });
  assert.equal(document.status, 200);
  assert.equal(JSON.parse(document.body).body, 'P'.repeat(128 * 1024));
});
