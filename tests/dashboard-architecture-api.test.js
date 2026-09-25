'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  ArchitectureService,
  MAX_DOCUMENT_BYTES,
} = require('../dashboard/architecture.js');
const { ProjectIndexService } = require('../dashboard/records/project-index.js');
const { createDashboardHttpServer } = require('../dashboard/server.js');

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const INSTANCE_ID = '22222222-2222-4222-8222-222222222222';
const CHECKPOINT_REVISION = '0123456789abcdef0123456789abcdef01234567';

function manifest(documents, values = {}) {
  return {
    schema_version: 2,
    managed: values.managed ?? true,
    language: values.language || 'ko',
    git_checkpoint: values.git_checkpoint || {
      revision: CHECKPOINT_REVISION,
      branch_at_check: 'main',
      checked_at: '2026-08-30T00:00:00.000Z',
    },
    documents,
  };
}

function document(id, kind, relativePath, order) {
  return {
    id,
    kind,
    path: relativePath,
    order,
    verified_at: '2026-08-29T00:00:00.000Z',
    source_revision: 'abc123',
  };
}

function writeMemory(projectRoot, relativeRoot = 'docs/architecture', values = {}) {
  const architectureRoot = path.join(projectRoot, ...relativeRoot.split('/'));
  const documents = values.documents || [
    document('architecture-index', 'index', 'README.md', 0),
    document('system-context', 'system-context', '01-system-context.md', 1),
  ];
  fs.mkdirSync(path.join(architectureRoot, '.architecture-memory'), { recursive: true });
  for (const item of documents) {
    const filePath = path.join(architectureRoot, ...item.path.split('/'));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, values.contents?.[item.id] || `# ${item.id}\n`, 'utf8');
  }
  fs.writeFileSync(
    path.join(architectureRoot, '.architecture-memory', 'manifest.json'),
    JSON.stringify(values.manifest || manifest(documents)),
    'utf8',
  );
  return architectureRoot;
}

async function fixture(t, values = {}) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-architecture-api-'));
  const projectRoot = path.join(temporaryRoot, 'project');
  const assetRoot = path.join(temporaryRoot, 'assets');
  const registryPath = path.join(temporaryRoot, 'config', 'projects.json');
  fs.mkdirSync(projectRoot, { recursive: true });
  if (values.emeth !== false) {
    fs.mkdirSync(path.join(projectRoot, '.emeth'), { recursive: true });
  }
  fs.mkdirSync(assetRoot, { recursive: true });
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify({
    schema_version: 1,
    projects: [{
      id: PROJECT_ID,
      root: fs.realpathSync(projectRoot),
      registered_at: '2026-08-29T00:00:00.000Z',
    }],
  }), 'utf8');
  for (const [name, content] of Object.entries(values.assets || {})) {
    fs.writeFileSync(path.join(assetRoot, name), content, 'utf8');
  }
  if (values.memory !== false) {
    writeMemory(projectRoot, values.relativeRoot, values.memory || {});
  }

  const projectService = new ProjectIndexService({
    registryOptions: { registryPath },
  });
  const server = createDashboardHttpServer({
    assetRoot,
    instanceId: INSTANCE_ID,
    version: '0.7.3',
    projectService,
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  });
  return {
    architectureService: new ArchitectureService({ projectService }),
    projectRoot,
    server,
    temporaryRoot,
  };
}

function request(server, requestPath, values = {}) {
  const address = server.address();
  const host = `127.0.0.1:${address.port}`;
  return new Promise((resolve, reject) => {
    const call = http.request({
      host: '127.0.0.1',
      port: address.port,
      method: values.method || 'GET',
      path: requestPath,
      headers: {
        Host: host,
        ...(values.origin ? { Origin: `http://${host}` } : {}),
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    call.once('error', reject);
    call.end();
  });
}

test('architecture API lists registered documents and reads one Markdown document', async (t) => {
  const { server } = await fixture(t, {
    memory: {
      contents: { 'system-context': '# 시스템 맥락\n\n```mermaid\ngraph LR\n```\n' },
    },
  });

  const indexResponse = await request(server, `/api/v1/projects/${PROJECT_ID}/architecture/index`);
  assert.equal(indexResponse.status, 200);
  const index = JSON.parse(indexResponse.body);
  assert.equal(index.schema_version, 1);
  assert.equal(index.project.id, PROJECT_ID);
  assert.equal(index.language, 'ko');
  assert.deepEqual(index.git_checkpoint, {
    revision: CHECKPOINT_REVISION,
    branch_at_check: 'main',
    checked_at: '2026-08-30T00:00:00.000Z',
  });
  assert.equal(index.manifest_path, 'docs/architecture/.architecture-memory/manifest.json');
  assert.deepEqual(index.documents.map((item) => item.id), [
    'architecture-index',
    'system-context',
  ]);
  assert.equal(
    (await request(server, `/api/v1/projects/${PROJECT_ID}/architecture`)).status,
    200,
  );

  const response = await request(
    server,
    `/api/v1/projects/${PROJECT_ID}/architecture/documents/system-context`,
  );
  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.id, 'system-context');
  assert.equal(body.content_type, 'text/markdown');
  assert.match(body.body, /```mermaid/);
  assert.equal(typeof body.modified_at, 'string');

  const head = await request(
    server,
    `/api/v1/projects/${PROJECT_ID}/architecture/documents/system-context`,
    { method: 'HEAD' },
  );
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.ok(Number(head.headers['content-length']) > 0);
});

test('an architecture-only registered project remains selectable without .emeth records', async (t) => {
  const { server } = await fixture(t, { emeth: false });
  const response = await request(server, '/api/v1/projects');
  assert.equal(response.status, 200);
  const project = JSON.parse(response.body).projects.find((item) => item.id === PROJECT_ID);
  assert.equal(project.availability, 'available');
  assert.deepEqual(project.counts, { active: 0, blocked: 0 });
  assert.equal(
    (await request(server, `/api/v1/projects/${PROJECT_ID}/architecture/index`)).status,
    200,
  );
});

test('architecture discovery accepts one bounded docs subtree and rejects ambiguity', async (t) => {
  const first = await fixture(t, { relativeRoot: 'docs/team/architecture' });
  const response = await request(first.server, `/api/v1/projects/${PROJECT_ID}/architecture`);
  assert.equal(response.status, 200);
  assert.equal(
    JSON.parse(response.body).manifest_path,
    'docs/team/architecture/.architecture-memory/manifest.json',
  );

  writeMemory(first.projectRoot, 'docs/other/architecture');
  const ambiguous = await request(first.server, `/api/v1/projects/${PROJECT_ID}/architecture`);
  assert.equal(ambiguous.status, 409);
  assert.equal(JSON.parse(ambiguous.body).error.code, 'architecture-ambiguous');
});

test('architecture API exposes only manifest-registered documents and GET or HEAD', async (t) => {
  const { projectRoot, server } = await fixture(t);
  fs.writeFileSync(path.join(projectRoot, 'docs', 'architecture', 'secret.md'), 'SECRET', 'utf8');

  const missing = await request(
    server,
    `/api/v1/projects/${PROJECT_ID}/architecture/documents/secret`,
  );
  assert.equal(missing.status, 404);
  assert.equal(JSON.parse(missing.body).error.code, 'architecture-document-not-found');
  assert.doesNotMatch(missing.body, /SECRET/);

  const deleted = await request(
    server,
    `/api/v1/projects/${PROJECT_ID}/architecture/documents/system-context`,
    { method: 'DELETE', origin: true },
  );
  assert.equal(deleted.status, 405);
  assert.equal(deleted.headers.allow, 'GET, HEAD');
  assert.equal(fs.readFileSync(
    path.join(projectRoot, 'docs', 'architecture', '01-system-context.md'),
    'utf8',
  ), '# system-context\n');
});

test('architecture API rejects malformed, disabled, oversized, and invalid UTF-8 content', async (t) => {
  const { projectRoot, server } = await fixture(t);
  const manifestPath = path.join(
    projectRoot,
    'docs',
    'architecture',
    '.architecture-memory',
    'manifest.json',
  );
  const documentPath = path.join(projectRoot, 'docs', 'architecture', '01-system-context.md');

  const current = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  current.git_checkpoint = { revision: null, branch_at_check: null, checked_at: null };
  fs.writeFileSync(manifestPath, JSON.stringify(current), 'utf8');
  assert.equal(
    (await request(server, `/api/v1/projects/${PROJECT_ID}/architecture`)).status,
    200,
  );

  current.schema_version = 1;
  fs.writeFileSync(manifestPath, JSON.stringify(current), 'utf8');
  const unsupported = await request(server, `/api/v1/projects/${PROJECT_ID}/architecture`);
  assert.equal(unsupported.status, 409);
  assert.equal(JSON.parse(unsupported.body).error.code, 'architecture-manifest-invalid');

  current.schema_version = 2;
  current.git_checkpoint = {
    revision: CHECKPOINT_REVISION,
    branch_at_check: 'main',
    checked_at: '2026-08-30T00:00:00.000Z',
  };
  current.managed = false;
  fs.writeFileSync(manifestPath, JSON.stringify(current), 'utf8');
  const disabled = await request(server, `/api/v1/projects/${PROJECT_ID}/architecture`);
  assert.equal(disabled.status, 404);
  assert.equal(JSON.parse(disabled.body).error.code, 'architecture-not-managed');

  current.managed = true;
  current.git_checkpoint.revision = 'abc123';
  fs.writeFileSync(manifestPath, JSON.stringify(current), 'utf8');
  const invalidCheckpoint = await request(server, `/api/v1/projects/${PROJECT_ID}/architecture`);
  assert.equal(invalidCheckpoint.status, 409);
  assert.equal(JSON.parse(invalidCheckpoint.body).error.code, 'architecture-manifest-invalid');

  current.git_checkpoint.revision = CHECKPOINT_REVISION;
  current.documents[0].path = '../outside.md';
  fs.writeFileSync(manifestPath, JSON.stringify(current), 'utf8');
  const malformed = await request(server, `/api/v1/projects/${PROJECT_ID}/architecture`);
  assert.equal(malformed.status, 409);
  assert.equal(JSON.parse(malformed.body).error.code, 'architecture-manifest-invalid');

  current.documents[0].path = 'README.md';
  fs.writeFileSync(manifestPath, JSON.stringify(current), 'utf8');
  fs.writeFileSync(documentPath, Buffer.from([0xc3, 0x28]));
  const invalidUtf8 = await request(
    server,
    `/api/v1/projects/${PROJECT_ID}/architecture/documents/system-context`,
  );
  assert.equal(invalidUtf8.status, 409);
  assert.equal(JSON.parse(invalidUtf8.body).error.code, 'architecture-document-invalid-utf8');

  fs.writeFileSync(documentPath, Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 0x61));
  const oversized = await request(
    server,
    `/api/v1/projects/${PROJECT_ID}/architecture/documents/system-context`,
  );
  assert.equal(oversized.status, 409);
  assert.equal(JSON.parse(oversized.body).error.code, 'architecture-too-large');
});

test('architecture document reads reject canonical paths outside the project', async (t) => {
  const documents = [document('system-context', 'system-context', 'linked/context.md', 0)];
  const { projectRoot, server, temporaryRoot } = await fixture(t, { memory: { documents } });
  const externalDirectory = path.join(temporaryRoot, 'external');
  const linkedDirectory = path.join(projectRoot, 'docs', 'architecture', 'linked');
  fs.mkdirSync(externalDirectory);
  fs.writeFileSync(path.join(externalDirectory, 'context.md'), 'EXTERNAL SECRET', 'utf8');
  fs.rmSync(linkedDirectory, { recursive: true });
  fs.symlinkSync(
    externalDirectory,
    linkedDirectory,
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  const response = await request(
    server,
    `/api/v1/projects/${PROJECT_ID}/architecture/documents/system-context`,
  );
  assert.equal(response.status, 409);
  assert.equal(JSON.parse(response.body).error.code, 'architecture-path-outside-project');
  assert.doesNotMatch(response.body, /EXTERNAL SECRET/);
});

test('root, dashboard, and architecture routes serve separate static entry files', async (t) => {
  const { server } = await fixture(t, {
    assets: {
      'index.html': 'INTRO',
      'dashboard.html': 'DASHBOARD',
      'architecture.html': 'ARCHITECTURE',
    },
  });
  assert.equal((await request(server, '/')).body, 'INTRO');
  assert.equal((await request(server, '/dashboard')).body, 'DASHBOARD');
  assert.equal((await request(server, '/architecture')).body, 'ARCHITECTURE');
  assert.equal(
    (await request(server, `/dashboard?project=${PROJECT_ID}`)).body,
    'DASHBOARD',
  );
  assert.equal(
    (await request(
      server,
      `/architecture?project=${PROJECT_ID}&document=system-context`,
    )).body,
    'ARCHITECTURE',
  );
  assert.equal((await request(server, '/dashboard?document=system-context')).status, 400);
  assert.equal((await request(server, '/architecture?project=invalid')).status, 400);
});
