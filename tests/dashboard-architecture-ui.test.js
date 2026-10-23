'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openPage, project, deferred } = require('./helpers/dashboard-page');
const { ArchitectureService } = require('../plugins/emeth-discipline/dashboard/architecture.js');

const core = require('../plugins/emeth-discipline/dashboard/assets/core.js');

const ASSET_ROOT = path.join(__dirname, '..', 'plugins', 'emeth-discipline', 'dashboard', 'assets');
const readAsset = (name) => fs.readFileSync(path.join(ASSET_ROOT, name), 'utf8');

const documents = [
  { id: 'context', kind: 'context', path: '04-context.md', order: 4 },
  { id: 'readme', kind: 'index', path: 'README.md', order: 1 },
  { id: 'containers', kind: 'containers', path: '02-containers.md', order: 3 },
  { id: 'system-context', kind: 'system-context', path: '01-system-context.md', order: 2 },
];

test('intro links carry the saved project and requested version without starting the dashboard', async t => {
  const id = '11111111-1111-4111-8111-111111111111';
  const page = await openPage(t, { page: 'intro', query: '?expected_version=1.2.3',
    storage: { 'emeth.dashboard.project': id, 'emeth.dashboard.theme': 'dark', 'emeth.dashboard.accent': '#123456' } });
  assert.equal(page.document.documentElement.dataset.theme, 'dark');
  assert.equal(page.document.documentElement.style.getPropertyValue('--accent'), '#123456');
  assert.equal(new URL(page.get('#intro-dashboard-link').href).pathname, '/dashboard');
  assert.equal(new URL(page.get('#intro-dashboard-link').href).search, `?expected_version=1.2.3&project=${id}`);
  assert.equal(new URL(page.get('#intro-architecture-link').href).search, `?project=${id}`);
  assert.deepEqual(page.calls, []);
  assert.equal(page.get('script[src="/app.js"]'), null);
});

test('Architecture viewer reads the selected document, renders metadata and local Mermaid without writes', async t => {
  const id = '11111111-1111-4111-8111-111111111111';
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-architecture-ui-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const architectureRoot = path.join(root, 'docs', 'architecture');
  fs.mkdirSync(path.join(architectureRoot, '.architecture-memory'), { recursive: true });
  fs.mkdirSync(path.join(architectureRoot, 'decisions'));
  const revision = '0123456789abcdef0123456789abcdef01234567';
  fs.writeFileSync(path.join(architectureRoot, '.architecture-memory', 'manifest.json'), JSON.stringify({
    schema_version: 2, managed: true, language: 'ko',
    git_checkpoint: { branch_at_check: 'main', revision, checked_at: '2026-08-30T00:00:00.000Z' },
    documents: [{ id: 'decision', kind: 'decision', path: 'decisions/ADR-001.md', order: 0,
      verified_at: '2026-08-29T00:00:00.000Z', source_revision: revision }],
  }));
  fs.writeFileSync(path.join(architectureRoot, 'decisions', 'ADR-001.md'),
    '# Decision\n- Status: accepted\n\n```mermaid\ngraph LR\n A --> B\n```');
  const service = new ArchitectureService({ projectService: { findProject: () => ({ id, root }) } });
  const page = await openPage(t, { page: 'architecture', query: `?project=${id}&document=decision`,
    storage: { 'emeth.dashboard.theme': 'dark', 'emeth.dashboard.accent': '#3459e6' }, routes: {
    '/api/v1/projects': { projects: [project(id)] },
    [`/api/v1/projects/${id}/architecture/index`]: () => service.getIndex(id),
    [`/api/v1/projects/${id}/architecture/documents/decision`]: () => service.getDocument(id, 'decision'),
  } });
  const detail = page.get('#architecture-document');
  assert.equal(page.document.documentElement.dataset.theme, 'dark');
  assert.equal(page.document.documentElement.style.getPropertyValue('--accent'), '#c93686');
  assert.equal(detail.tabIndex, -1);
  assert.equal(page.get('[aria-live="polite"]') !== null, true);
  assert.equal(page.get('textarea, [contenteditable]'), null);
  assert.match(detail.textContent, /ADR 상태accepted/);
  assert.match(detail.textContent, /Git 브랜치main/);
  assert.ok(detail.textContent.includes(`Git 커밋${revision}`));
  assert.match(detail.textContent, /Git 동기화2026-08-30/);
  assert.match(detail.textContent, /문서 전체 검증2026-08-29/);
  assert.ok(detail.textContent.includes(`문서 검증 revision${revision}`));
  assert.equal(page.get('.document-path').textContent, 'decisions/ADR-001.md');
  assert.match(page.diagrams[0], /A --> B/);
  assert.equal(page.mermaidOptions[0].securityLevel, 'strict');
  assert.equal(page.get('script[src="/vendor/mermaid.min.js"]') !== null, true);
  assert.ok(page.calls.every(call => call.method === 'GET'));
  assert.equal(page.window.localStorage.getItem('emeth.dashboard.project'), id);
  assert.equal(new URL(page.get('#dashboard-link').href).search, `?project=${id}`);
});

test('Architecture documents use manifest order and stable selection', () => {
  const ordered = core.architectureDocuments({ documents });
  assert.deepEqual(ordered.map(document => document.id), [
    'readme', 'system-context', 'containers', 'context',
  ]);
  assert.equal(core.initialArchitectureDocumentId(ordered, 'containers'), 'containers');
  assert.equal(core.initialArchitectureDocumentId(ordered, 'missing'), 'readme');
});

test('Architecture document switches ignore late successes and errors', async t => {
  const id = '11111111-1111-4111-8111-111111111111';
  const first = deferred(), second = deferred(), latest = deferred();
  let attempts = 0;
  const page = await openPage(t, { page: 'architecture', query: `?project=${id}&document=readme`, routes: {
    '/api/v1/projects': { projects: [project(id)] },
    [`/api/v1/projects/${id}/architecture/index`]: { documents },
    [`/api/v1/projects/${id}/architecture/documents/readme`]: () => ++attempts === 1 ? first.promise : second.promise,
    [`/api/v1/projects/${id}/architecture/documents/context`]: {
      id: 'context', kind: 'context', path: '04-context.md', body: '# Current context',
    },
  } });
  page.click('[data-document-id="context"]'); await page.settle();
  first.resolve({ error: { message: 'STALE ERROR' } }); await page.settle();
  assert.match(page.get('#architecture-document').textContent, /Current context/);
  assert.doesNotMatch(page.get('#architecture-document').textContent, /STALE ERROR/);
  page.click('[data-document-id="readme"]');
  page.routes[`/api/v1/projects/${id}/architecture/documents/context`] = latest.promise;
  page.click('[data-document-id="context"]');
  second.resolve({ id: 'readme', kind: 'index', path: 'README.md', body: '# STALE SUCCESS' }); await page.settle();
  assert.doesNotMatch(page.get('#architecture-document').textContent, /STALE SUCCESS/);
  latest.resolve({ id: 'context', kind: 'context', path: '04-context.md', body: '# Latest context' }); await page.settle();
  assert.match(page.get('#architecture-document').textContent, /Latest context/);
});

test('Architecture project changes reject a late response for the same document ID', async t => {
  const firstId = '11111111-1111-4111-8111-111111111111', secondId = '22222222-2222-4222-8222-222222222222';
  const older = deferred();
  const page = await openPage(t, { page: 'architecture', query: `?project=${firstId}&document=context`, routes: {
    '/api/v1/projects': { projects: [project(firstId), project(secondId)] },
    [`/api/v1/projects/${firstId}/architecture/index`]: { documents },
    [`/api/v1/projects/${secondId}/architecture/index`]: { documents },
    [`/api/v1/projects/${firstId}/architecture/documents/context`]: older.promise,
    [`/api/v1/projects/${secondId}/architecture/documents/readme`]: {
      id: 'readme', kind: 'index', path: 'README.md', body: '# Second project index',
    },
    [`/api/v1/projects/${secondId}/architecture/documents/context`]: {
      id: 'context', kind: 'context', path: '04-context.md', body: '# Second project context',
    },
  } });
  page.change('#architecture-project', secondId); await page.settle();
  page.click('[data-document-id="context"]'); await page.settle();
  older.resolve({ id: 'context', kind: 'context', path: '04-context.md', body: '# First project context' }); await page.settle();
  assert.match(page.get('#architecture-document').textContent, /Second project context/);
  assert.doesNotMatch(page.get('#architecture-document').textContent, /First project context/);
});

test('relative links resolve only to registered Architecture documents', () => {
  assert.equal(
    core.resolveArchitectureDocumentId(documents, 'README.md', '04-context.md'),
    'context',
  );
  assert.equal(
    core.resolveArchitectureDocumentId(documents, 'components/api.md', '../02-containers.md'),
    'containers',
  );
  assert.equal(core.resolveArchitectureDocumentId(documents, 'README.md', 'missing.md'), null);
  assert.equal(core.resolveArchitectureDocumentId(documents, 'README.md', 'https://example.com'), null);
  assert.equal(core.resolveArchitectureDocumentId(documents, 'README.md', '/docs/architecture/04-context.md'), null);
});

test('Markdown keeps default link hardening and permits resolver-approved Architecture routes', () => {
  const internal = core.renderMarkdown('[맥락](04-context.md)', {
    resolveLink: () => '/architecture?project=p1&document=context',
  });
  assert.match(internal, /href="\/architecture\?project=p1&amp;document=context"/);
  assert.match(internal, /data-architecture-link="true"/);
  assert.doesNotMatch(internal, /target="_blank"/);

  const refused = core.renderMarkdown('[위험](local.md)', {
    resolveLink: () => 'javascript:alert(1)',
  });
  assert.doesNotMatch(refused, /href=/);

  const unresolved = [];
  core.renderMarkdown('[없음](missing.md)', {
    resolveLink: () => null,
    onUnresolvedLink: (href) => unresolved.push(href),
  });
  assert.deepEqual(unresolved, ['missing.md']);
});

test('Architecture layout has desktop navigation and a compact single-column fallback', () => {
  const css = readAsset('styles.css');
  assert.match(css, /\.architecture-layout\s*\{[\s\S]*?grid-template-columns:\s*248px minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.architecture-layout\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(css, /\.architecture-markdown \.mermaid\s*\{/);
});
