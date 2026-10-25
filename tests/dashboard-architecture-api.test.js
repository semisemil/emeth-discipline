'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ProjectIndexService } = require('../plugins/emeth-discipline/dashboard/records/project-index.js');
const { createDashboardHttpServer } = require('../plugins/emeth-discipline/dashboard/server.js');

const projectId = '11111111-1111-4111-8111-111111111111';
const base = `/api/v1/projects/${projectId}/architecture`;

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-architecture-api-'));
  const directory = path.join(root, 'docs/architecture');
  const manifest = {
    schema_version: 2, managed: true, language: 'ko',
    git_checkpoint: { revision: null, branch_at_check: null, checked_at: null },
    documents: [{ id: 'context', kind: 'context', path: 'context.md', order: 0,
      verified_at: null, source_revision: null }],
  };
  fs.mkdirSync(path.join(directory, '.architecture-memory'), { recursive: true });
  const manifestPath = path.join(directory, '.architecture-memory/manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const file = path.join(directory, 'context.md');
  fs.writeFileSync(file, '# 현장 조건\n\n망 점검 중에도 접수를 보존한다.\n');
  const registryPath = path.join(root, 'projects.json');
  fs.writeFileSync(registryPath, JSON.stringify({ schema_version: 1, projects: [{
    id: projectId, root, registered_at: '2026-08-29T00:00:00.000Z',
  }] }));
  const projectService = new ProjectIndexService({ registryOptions: { registryPath } });
  const server = createDashboardHttpServer({
    assetRoot: root, projectService, version: 'test',
    instanceId: '22222222-2222-4222-8222-222222222222',
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    projectService.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (route, method = 'GET') => fetch(origin + route, { method, headers: { Origin: origin } });
  return { directory, manifest, manifestPath, file, request };
}

test('architecture HTTP routes list and read registered documents without permitting writes or unregistered reads', async t => {
  const f = await fixture(t);
  const index = await f.request(`${base}/index`);
  assert.equal(index.status, 200);
  assert.deepEqual((await index.json()).documents.map(doc => doc.id), ['context']);
  const document = await f.request(`${base}/documents/context`);
  assert.equal(document.status, 200);
  assert.equal((await document.json()).body, fs.readFileSync(f.file, 'utf8'));
  const head = await f.request(`${base}/documents/context`, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  fs.writeFileSync(path.join(f.directory, 'secret.md'), 'SECRET');
  const unregistered = await f.request(`${base}/documents/secret`);
  assert.equal(unregistered.status, 404);
  assert.doesNotMatch(await unregistered.text(), /SECRET/);
  const before = fs.readFileSync(f.file);
  assert.equal((await f.request(`${base}/documents/context`, 'DELETE')).status, 405);
  assert.deepEqual(fs.readFileSync(f.file), before);
});

test('architecture HTTP routes report disabled memory and invalid document bytes', async t => {
  const f = await fixture(t);
  fs.writeFileSync(f.manifestPath, JSON.stringify({ ...f.manifest, managed: false }));
  const disabled = await f.request(base);
  assert.equal(disabled.status, 404);
  assert.equal((await disabled.json()).error.code, 'architecture-not-managed');
  fs.writeFileSync(f.manifestPath, JSON.stringify(f.manifest));
  fs.writeFileSync(f.file, Buffer.from([0xc3, 0x28]));
  const unreadable = await f.request(`${base}/documents/context`);
  assert.equal(unreadable.status, 409);
  assert.equal((await unreadable.json()).error.code, 'architecture-document-invalid-utf8');
});
