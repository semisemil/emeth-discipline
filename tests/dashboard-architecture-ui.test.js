'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { openPage, project } = require('./helpers/dashboard-page');

const core = require('../plugins/emeth-discipline/dashboard/assets/core.js');

const ASSET_ROOT = path.join(__dirname, '..', 'plugins', 'emeth-discipline', 'dashboard', 'assets');
const readAsset = (name) => fs.readFileSync(path.join(ASSET_ROOT, name), 'utf8');

const documents = [
  { id: 'context', kind: 'context', title: '맥락', relative_path: 'docs/architecture/04-context.md', order: 4 },
  { id: 'readme', kind: 'index', title: '아키텍처', relative_path: 'docs/architecture/README.md', order: 1 },
  { id: 'containers', kind: 'containers', title: '컨테이너', relative_path: 'docs/architecture/02-containers.md', order: 3 },
  { id: 'system-context', kind: 'system-context', title: '시스템 맥락', relative_path: 'docs/architecture/01-system-context.md', order: 2 },
];

test('intro links carry the saved project and requested version without starting the dashboard', async t => {
  const id = '11111111-1111-4111-8111-111111111111';
  const page = await openPage(t, { page: 'intro', query: '?expected_version=1.2.3',
    storage: { 'emeth.dashboard.project': id } });
  assert.equal(new URL(page.get('#intro-dashboard-link').href).pathname, '/dashboard');
  assert.equal(new URL(page.get('#intro-dashboard-link').href).search, `?expected_version=1.2.3&project=${id}`);
  assert.equal(new URL(page.get('#intro-architecture-link').href).search, `?project=${id}`);
  assert.deepEqual(page.calls, []);
  assert.equal(page.get('script[src="/app.js"]'), null);
});

test('Architecture viewer reads the selected document, renders metadata and local Mermaid without writes', async t => {
  const id = '11111111-1111-4111-8111-111111111111';
  const page = await openPage(t, { page: 'architecture', query: `?project=${id}&document=decision`, routes: {
    '/api/v1/projects': { projects: [project(id)] },
    [`/api/v1/projects/${id}/architecture/index`]: { documents: [{ id: 'decision', kind: 'decision', relative_path: 'docs/adr.md' }],
      git_checkpoint: { branch_at_check: 'main', revision: 'abc123', checked_at: '2026-08-30' } },
    [`/api/v1/projects/${id}/architecture/documents/decision`]: { id: 'decision', body: '# Decision\n- Status: accepted\n\n```mermaid\ngraph LR\n A --> B\n```' },
  } });
  const detail = page.get('#architecture-document');
  assert.equal(detail.tabIndex, -1);
  assert.equal(page.get('[aria-live="polite"]') !== null, true);
  assert.equal(page.get('textarea, [contenteditable]'), null);
  assert.match(detail.textContent, /ADR 상태accepted/);
  assert.match(detail.textContent, /Git 브랜치main/);
  assert.match(detail.textContent, /Git 커밋abc123/);
  assert.match(detail.textContent, /Git 동기화2026-08-30/);
  assert.match(page.diagrams[0], /A --> B/);
  assert.equal(page.mermaidOptions[0].securityLevel, 'strict');
  assert.equal(page.get('script[src="/vendor/mermaid.min.js"]') !== null, true);
  assert.ok(page.calls.every(call => call.method === 'GET'));
  assert.equal(page.window.localStorage.getItem('emeth.dashboard.project'), id);
  assert.equal(new URL(page.get('#dashboard-link').href).search, `?project=${id}`);
});

test('Architecture documents use manifest order and stable selection', () => {
  const ordered = core.architectureDocuments({ documents });
  assert.deepEqual(ordered.map(core.architectureDocumentId), [
    'readme', 'system-context', 'containers', 'context',
  ]);
  assert.equal(core.initialArchitectureDocumentId(ordered, 'containers'), 'containers');
  assert.equal(core.initialArchitectureDocumentId(ordered, 'missing'), 'readme');
});

test('relative links resolve only to registered Architecture documents', () => {
  assert.equal(
    core.resolveArchitectureDocumentId(documents, 'docs/architecture/README.md', '04-context.md'),
    'context',
  );
  assert.equal(
    core.resolveArchitectureDocumentId(documents, 'docs/architecture/components/api.md', '../02-containers.md'),
    'containers',
  );
  assert.equal(core.resolveArchitectureDocumentId(documents, 'docs/architecture/README.md', 'missing.md'), null);
  assert.equal(core.resolveArchitectureDocumentId(documents, 'docs/architecture/README.md', 'https://example.com'), null);
  assert.equal(core.resolveArchitectureDocumentId(documents, 'docs/architecture/README.md', '/docs/architecture/04-context.md'), null);
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

  const external = core.renderMarkdown('[공식](https://example.com)');
  assert.match(external, /target="_blank" rel="noopener noreferrer"/);

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
