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
const SECOND_AVAILABLE_ID = '44444444-4444-4444-8444-444444444444';

function makeIssue() {
  return {
    schema_version: 2,
    identity: { id: 'PL-0001', aliases: [], type: 'task', mode: 'simple', title: 'API', risk: 'low' },
    origin: { kind: 'request', summary: 'API', refs: [] },
    state: { status: 'open', current_summary: '대기', next_action: '구현' },
    objective: { summary: 'API 제공', constraints: [] },
    criteria: [{ id: 'C1', text: '응답한다.', evidence_refs: [] }],
    milestones: [], relations: [], context: [], artifacts: [], evidence: [], events: [],
    created_at: '2026-08-17T00:00:00.000Z',
    updated_at: '2026-08-17T00:00:00.000Z',
  };
}

async function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-project-api-'));
  const availableRoot = path.join(root, 'available');
  const unavailableRoot = path.join(root, 'missing');
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
      { id: UNAVAILABLE_ID, root: unavailableRoot, registered_at: '2026-08-17T00:01:00.000Z' },
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
  return { assetRoot, availableRoot, root, registryPath, server };
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

function pathKey(filePath) {
  const normalized = path.normalize(String(filePath));
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function instrumentAssetDescriptors(assetRoot) {
  const originalOpen = fs.openSync;
  const originalClose = fs.closeSync;
  const assetPrefix = `${pathKey(assetRoot)}${path.sep}`;
  const descriptors = new Set();
  let restored = false;

  fs.openSync = function instrumentedOpen(filePath, ...args) {
    const fileKey = pathKey(filePath);
    if (!fileKey.startsWith(assetPrefix)) {
      return originalOpen.call(fs, filePath, ...args);
    }
    const descriptor = originalOpen.call(fs, filePath, ...args);
    descriptors.add(descriptor);
    return descriptor;
  };
  fs.closeSync = function instrumentedClose(descriptor) {
    descriptors.delete(descriptor);
    return originalClose.call(fs, descriptor);
  };

  return {
    restore() {
      if (!restored) {
        fs.openSync = originalOpen;
        fs.closeSync = originalClose;
        restored = true;
      }
    },
    snapshot() {
      return { outstanding: descriptors.size };
    },
  };
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

test('static dashboard serves root, expected_version entry, and same-origin assets for GET and HEAD', async (t) => {
  const index = '<!doctype html><link rel="stylesheet" href="/styles.css"><script src="/app.js"></script>';
  const script = "document.documentElement.dataset.ready = 'true';";
  const stylesheet = ':root { color-scheme: light dark; }';
  const { assetRoot, server } = await fixture(t, {
    assetFiles: {
      'app.js': script,
      'index.html': index,
      'styles.css': stylesheet,
    },
  });
  const descriptors = instrumentAssetDescriptors(assetRoot);
  t.after(() => descriptors.restore());

  const root = await request(server, { path: '/' });
  assert.equal(root.status, 200);
  assert.equal(root.body, index);
  assert.equal(root.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(Number(root.headers['content-length']), Buffer.byteLength(index));
  assert.equal(root.headers['content-security-policy'], SECURITY_HEADERS['Content-Security-Policy']);
  assert.equal(root.headers['x-content-type-options'], 'nosniff');
  assert.equal(root.headers['cache-control'], 'no-store');
  assert.equal(root.headers['access-control-allow-origin'], undefined);

  const entry = await request(server, { path: '/?expected_version=0.6.2' });
  assert.equal(entry.status, 200);
  assert.equal(entry.body, index);

  const head = await request(server, { method: 'HEAD', path: '/' });
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal(Number(head.headers['content-length']), Buffer.byteLength(index));
  assert.equal(head.headers['content-type'], 'text/html; charset=utf-8');

  const app = await request(server, { path: '/app.js' });
  assert.equal(app.status, 200);
  assert.equal(app.body, script);
  assert.equal(app.headers['content-type'], 'text/javascript; charset=utf-8');
  assert.equal(Number(app.headers['content-length']), Buffer.byteLength(script));

  const css = await request(server, { path: '/styles.css' });
  assert.equal(css.status, 200);
  assert.equal(css.body, stylesheet);
  assert.equal(css.headers['content-type'], 'text/css; charset=utf-8');
  assert.equal(Number(css.headers['content-length']), Buffer.byteLength(stylesheet));

  assert.equal((await request(server, { path: '/?unexpected=1' })).status, 400);
  assert.equal((await request(server, { path: '/api/v1/health?expected_version=0.6.2' })).status, 404);
  descriptors.restore();
  assert.equal(descriptors.snapshot().outstanding, 0);
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

test('missing asset root leaves lifecycle health available and returns UI 404', async (t) => {
  const { assetRoot, server } = await fixture(t);
  assert.equal(fs.existsSync(assetRoot), false);
  assert.equal((await request(server, { path: '/api/v1/health' })).status, 200);

  const root = await request(server, { path: '/' });
  assert.equal(root.status, 404);
  assert.equal(root.headers['content-security-policy'], SECURITY_HEADERS['Content-Security-Policy']);
  assert.equal(root.headers['x-content-type-options'], 'nosniff');
  assert.equal(root.headers['cache-control'], 'no-store');
  assert.equal(root.headers['access-control-allow-origin'], undefined);
});

test('only unavailable projects can be forgotten', async (t) => {
  const { registryPath, server } = await fixture(t);
  const availableDelete = await request(server, {
    method: 'DELETE',
    path: `/api/v1/projects/${AVAILABLE_ID}`,
    origin: (await request(server)).expectedOrigin,
  });
  assert.equal(availableDelete.status, 409);
  assert.equal(JSON.parse(availableDelete.body).error.code, 'project-available');

  const origin = (await request(server)).expectedOrigin;
  const unavailableDelete = await request(server, {
    method: 'DELETE', path: `/api/v1/projects/${UNAVAILABLE_ID}`, origin,
  });
  assert.equal(unavailableDelete.status, 204);
  assert.equal(unavailableDelete.body, '');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  assert.deepEqual(registry.projects.map((project) => project.id), [AVAILABLE_ID]);
});

test('two simultaneously available projects never expose each other records', async (t) => {
  const { availableRoot, registryPath, root, server } = await fixture(t);
  fs.unlinkSync(path.join(availableRoot, '.emeth', 'issues', 'PL-0001.json'));
  const first = {
    id: 'PL-0001', title: 'ONLY-IN-PROJECT-A', status: 'in_progress', type: 'bug', risk: 'high',
    evidence: [], description: '기존 동작', suggested_next_step: '계속 검증',
    created_at: '2026-08-16T00:00:00.000Z', updated_at: '2026-08-17T00:00:00.000Z',
  };
  fs.writeFileSync(
    path.join(availableRoot, '.emeth', 'issues', 'PL-0001.md'),
    `---\n${JSON.stringify(first)}\n---\n## 설명\n기존 동작`,
    'utf8',
  );

  const secondRoot = path.join(root, 'available-second');
  const secondIssues = path.join(secondRoot, '.emeth', 'issues');
  fs.mkdirSync(secondIssues, { recursive: true });
  const second = makeIssue();
  second.identity.id = 'PL-0002';
  second.identity.title = 'ONLY-IN-PROJECT-B';
  fs.writeFileSync(path.join(secondIssues, 'PL-0002.json'), JSON.stringify(second), 'utf8');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  registry.projects.push({
    id: SECOND_AVAILABLE_ID,
    root: secondRoot,
    registered_at: '2026-08-17T00:02:00.000Z',
  });
  fs.writeFileSync(registryPath, JSON.stringify(registry), 'utf8');

  const projects = JSON.parse((await request(server, { path: '/api/v1/projects' })).body).projects;
  assert.deepEqual(
    projects.filter((project) => project.availability === 'available').map((project) => project.id).sort(),
    [AVAILABLE_ID, SECOND_AVAILABLE_ID].sort(),
  );

  const indexA = await request(server, { path: `/api/v1/projects/${AVAILABLE_ID}/index` });
  const indexB = await request(server, { path: `/api/v1/projects/${SECOND_AVAILABLE_ID}/index` });
  assert.deepEqual(JSON.parse(indexA.body).issues.map((issue) => issue.id), ['PL-0001']);
  assert.deepEqual(JSON.parse(indexB.body).issues.map((issue) => issue.id), ['PL-0002']);
  assert.doesNotMatch(indexA.body, /ONLY-IN-PROJECT-B/);
  assert.doesNotMatch(indexB.body, /ONLY-IN-PROJECT-A/);

  const documentA = await request(server, {
    path: `/api/v1/projects/${AVAILABLE_ID}/documents/issue/PL-0001`,
  });
  const documentB = await request(server, {
    path: `/api/v1/projects/${SECOND_AVAILABLE_ID}/documents/issue/PL-0002`,
  });
  assert.doesNotMatch(documentA.body, /ONLY-IN-PROJECT-B/);
  assert.doesNotMatch(documentB.body, /ONLY-IN-PROJECT-A/);
  const legacy = JSON.parse(documentA.body).body;
  assert.equal(legacy.schemaVersion, 1);
  assert.equal(legacy.status, 'doing');
  assert.equal(legacy.currentSummary, '기존 동작');
  assert.equal(legacy.nextAction, '계속 검증');
  assert.ok(legacy.validation.warnings.some(warning => warning.trim().length > 0));
  const current = JSON.parse(documentB.body).body;
  assert.equal(current.schemaVersion, 2);
  assert.equal(current.id, 'PL-0002');
  assert.equal(current.currentSummary, '대기');
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

test('project list omits document details and subsequent index reads see current sources', async (t) => {
  const { availableRoot, server } = await fixture(t);
  const issue = makeIssue();
  issue.identity.title = 'current_summary next_action "raw"';
  fs.writeFileSync(path.join(availableRoot, '.emeth/issues/PL-0001.json'), JSON.stringify(issue));
  const projects = await request(server, { path: '/api/v1/projects' });
  assert.equal(projects.status, 200);
  const listed = JSON.parse(projects.body, (key, value) => {
    assert.ok(!['current_summary', 'next_action', 'raw'].includes(key), key);
    return value;
  });
  assert.equal(listed.projects.find(project => project.id === AVAILABLE_ID).latest_issue.title, issue.identity.title);

  const changed = makeIssue();
  changed.state.status = 'blocked';
  changed.state.current_summary = 'CHANGED-AFTER-SIDEBAR';
  changed.state.next_action = '차단을 해소한다.';
  changed.state.blocker = '외부 조건';
  changed.state.unblock_condition = '외부 조건 완료';
  fs.writeFileSync(
    path.join(availableRoot, '.emeth', 'issues', 'PL-0001.json'),
    JSON.stringify(changed),
    'utf8',
  );

  const index = await request(server, { path: `/api/v1/projects/${AVAILABLE_ID}/index` });
  assert.equal(index.status, 200);
  assert.equal(JSON.parse(index.body).issues[0].status, 'blocked');
  assert.match(index.body, /CHANGED-AFTER-SIDEBAR/);
});

test('summary and index omit large Plan and Spec bodies while detail returns the complete body', async (t) => {
  const { availableRoot, server } = await fixture(t);
  const planDirectory = path.join(availableRoot, '.emeth', 'plan', 'PLAN-0008-large');
  const specDirectory = path.join(availableRoot, '.emeth', 'specs', 'SPEC-0008-large');
  const planPath = path.join(planDirectory, 'PLAN.md');
  const specPath = path.join(specDirectory, 'SPEC.md');
  fs.mkdirSync(planDirectory, { recursive: true });
  fs.mkdirSync(specDirectory, { recursive: true });
  fs.writeFileSync(planPath, [
    '---',
    'id: PLAN-0008',
    'title: Large Plan',
    'status: ready',
    '---',
    'P'.repeat(128 * 1024),
  ].join('\n'), 'utf8');
  fs.writeFileSync(specPath, [
    '---',
    JSON.stringify({
      schema_version: 2,
      id: 'SPEC-0008',
      title: 'Large Spec',
      kind: 'feature',
      status: 'ready',
      revision: 1,
      supersedes: [],
      superseded_by: null,
      related_issues: [],
    }, null, 2),
    '---',
    'S'.repeat(128 * 1024),
  ].join('\n'), 'utf8');
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

test('project summary and document routes accept BOM-prefixed Markdown', async (t) => {
  const { availableRoot, server } = await fixture(t);
  const documents = [
    { kind: 'plan', directory: 'plan', id: 'PLAN-0020', file: 'PLAN.md' },
    { kind: 'spec', directory: 'specs', id: 'SPEC-0020', file: 'SPEC.md' },
    { kind: 'design', directory: 'designs', id: 'DESIGN-0020', file: 'DESIGN.md' },
  ];
  for (const document of documents) {
    const directory = path.join(availableRoot, '.emeth', document.directory, `${document.id}-bom`);
    fs.mkdirSync(directory, { recursive: true });
    const metadata = document.kind === 'plan'
      ? `id: ${document.id}\r\ntitle: ${document.id}\r\nstatus: ready`
      : JSON.stringify({ schema_version: 2, id: document.id, title: document.id, kind: 'feature', status: 'ready',
        revision: 1, supersedes: [], superseded_by: null, related_issues: [] });
    fs.writeFileSync(path.join(directory, document.file), `\uFEFF---\r\n${metadata}\r\n---\r\n# ${document.id}`);
  }

  const summaryResponse = await request(server, { path: '/api/v1/projects' });
  assert.equal(summaryResponse.status, 200);
  const summary = JSON.parse(summaryResponse.body).projects.find(project => project.id === AVAILABLE_ID);
  assert.equal(summary.diagnostic_count, 0);
  assert.ok(summary.last_modified);
  const indexResponse = await request(server, { path: `/api/v1/projects/${AVAILABLE_ID}/index` });
  assert.equal(indexResponse.status, 200);
  const index = JSON.parse(indexResponse.body);
  assert.deepEqual(index.diagnostics, []);
  for (const document of documents) {
    assert.ok(index[`${document.kind}s`].some(record => record.id === document.id));
    const response = await request(server, { path: `/api/v1/projects/${AVAILABLE_ID}/documents/${document.kind}/${document.id}` });
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.body).body, `# ${document.id}`);
  }
});

test('summary and index accept metadata past 64 KiB without returning document bodies', async (t) => {
  const { availableRoot, server } = await fixture(t);
  const planDirectory = path.join(availableRoot, '.emeth', 'plan', 'PLAN-0011-wide-metadata');
  const planPath = path.join(planDirectory, 'PLAN.md');
  const title = 'T'.repeat(70 * 1024);
  const bodyMarker = 'BODY-MUST-STAY-STREAMING-ONLY';
  fs.mkdirSync(planDirectory, { recursive: true });
  fs.writeFileSync(planPath, [
    '---',
    'id: PLAN-0011',
    `title: ${title}`,
    'status: ready',
    '---',
    bodyMarker,
    'B'.repeat(96 * 1024),
  ].join('\n'), 'utf8');
  const summary = await request(server, { path: '/api/v1/projects' });
  const listed = JSON.parse(summary.body).projects.find((item) => item.id === AVAILABLE_ID);
  assert.equal(listed.diagnostic_count, 0);
  assert.ok(listed.last_modified);
  assert.doesNotMatch(summary.body, new RegExp(bodyMarker));

  const indexResponse = await request(server, { path: `/api/v1/projects/${AVAILABLE_ID}/index` });
  const index = JSON.parse(indexResponse.body);
  assert.equal(index.plans.find((plan) => plan.id === 'PLAN-0011').title, title);
  assert.equal(index.diagnostics.some((item) => item.relative_path
    === '.emeth/plan/PLAN-0011-wide-metadata/PLAN.md'), false);
  assert.doesNotMatch(indexResponse.body, new RegExp(bodyMarker));
});

test('project summary and index exclude invalid UTF-8 tails with safe diagnostics', async (t) => {
  const { availableRoot, server } = await fixture(t);
  const planDirectory = path.join(availableRoot, '.emeth', 'plan', 'PLAN-0007-invalid');
  const specDirectory = path.join(availableRoot, '.emeth', 'specs', 'SPEC-0007-invalid');
  fs.mkdirSync(planDirectory, { recursive: true });
  fs.mkdirSync(specDirectory, { recursive: true });
  const invalidTail = Buffer.concat([Buffer.alloc(70 * 1024, 0x61), Buffer.from([0xc3, 0x28])]);
  const planPath = path.join(planDirectory, 'PLAN.md');
  const specPath = path.join(specDirectory, 'SPEC.md');
  fs.writeFileSync(planPath, Buffer.concat([
    Buffer.from('---\nid: PLAN-0007\ntitle: Invalid\nstatus: ready\n---\n', 'utf8'),
    invalidTail,
  ]));
  fs.writeFileSync(specPath, Buffer.concat([
    Buffer.from(`---\n${JSON.stringify({
      schema_version: 2,
      id: 'SPEC-0007',
      title: 'Invalid',
      kind: 'feature',
      status: 'ready',
      revision: 1,
      supersedes: [],
      superseded_by: null,
      related_issues: [],
    }, null, 2)}\n---\n`, 'utf8'),
    invalidTail,
  ]));

  const projects = await request(server, { path: '/api/v1/projects' });
  const listed = JSON.parse(projects.body).projects.find((project) => project.id === AVAILABLE_ID);
  assert.equal(listed.diagnostic_count, 2);

  const index = await request(server, { path: `/api/v1/projects/${AVAILABLE_ID}/index` });
  const body = JSON.parse(index.body);
  assert.deepEqual(body.plans, []);
  assert.deepEqual(body.specs, []);
  assert.deepEqual(
    body.diagnostics.filter((item) => item.code === 'record-invalid-utf8').map((item) => item.relative_path),
    [
      '.emeth/plan/PLAN-0007-invalid/PLAN.md',
      '.emeth/specs/SPEC-0007-invalid/SPEC.md',
    ],
  );

  const detail = await request(server, {
    path: `/api/v1/projects/${AVAILABLE_ID}/documents/spec/SPEC-0007`,
  });
  assert.equal(detail.status, 404);
  assert.equal(JSON.parse(detail.body).error.code, 'record-not-found');
});
