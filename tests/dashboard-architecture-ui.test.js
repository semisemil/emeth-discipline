'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const core = require('../dashboard/assets/core.js');

const ASSET_ROOT = path.join(__dirname, '..', 'dashboard', 'assets');
const readAsset = (name) => fs.readFileSync(path.join(ASSET_ROOT, name), 'utf8');

const documents = [
  { id: 'context', kind: 'context', title: '맥락', relative_path: 'docs/architecture/04-context.md', order: 4 },
  { id: 'readme', kind: 'index', title: '아키텍처', relative_path: 'docs/architecture/README.md', order: 1 },
  { id: 'containers', kind: 'containers', title: '컨테이너', relative_path: 'docs/architecture/02-containers.md', order: 3 },
  { id: 'system-context', kind: 'system-context', title: '시스템 맥락', relative_path: 'docs/architecture/01-system-context.md', order: 2 },
];

test('root intro separates Dashboard and Architecture without starting another application', () => {
  const intro = readAsset('index.html');
  const dashboard = readAsset('dashboard.html');

  assert.match(intro, /<main class="intro-shell"/);
  assert.match(intro, /href="\/dashboard"/);
  assert.match(intro, /href="\/architecture"/);
  assert.match(intro, /src="\/intro\.js"/);
  assert.doesNotMatch(intro, /src="\/app\.js"/);

  const introApp = readAsset('intro.js');
  assert.match(introApp, /get\('expected_version'\)/);
  assert.match(introApp, /emeth\.dashboard\.project/);

  assert.match(dashboard, /id="app-shell"/);
  assert.match(dashboard, /src="\/app\.js"/);
  assert.match(dashboard, /id="architecture-link" href="\/architecture"/);
});

test('Architecture page is a read-only local viewer with local Mermaid loading', () => {
  const html = readAsset('architecture.html');
  const app = readAsset('architecture.js');

  assert.match(html, /src="\/vendor\/mermaid\.min\.js"/);
  assert.match(html, /src="\/architecture\.js"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="architecture-document" tabindex="-1"/);
  assert.doesNotMatch(html, /contenteditable|<textarea/i);

  assert.match(app, /\/architecture\/index/);
  assert.match(app, /\/architecture\/documents\//);
  assert.match(app, /securityLevel: 'strict'/);
  assert.match(app, /\['ADR 상태', decisionStatus\(item, markdown\)\]/);
  assert.match(app, /\['Git 브랜치', checkpoint\.branch_at_check\]/);
  assert.match(app, /\['Git 커밋', checkpoint\.revision\]/);
  assert.match(app, /\['Git 동기화', checkpoint\.checked_at\]/);
  assert.match(app, /querySelectorAll\('pre > code\.language-mermaid'\)/);
  assert.match(app, /emeth\.dashboard\.project/);
  assert.match(app, /new URLSearchParams\(globalThis\.location\.search\)/);
  assert.doesNotMatch(app, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
  assert.doesNotMatch(app, /https?:\/\/[^'"`\s]+mermaid/i);
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
