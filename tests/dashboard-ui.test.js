'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const { dashboard, project, index } = require('./helpers/dashboard-page');
const core = require('../plugins/emeth-discipline/dashboard/assets/core.js');
const { buildProjectIndex } = require('../plugins/emeth-discipline/dashboard/records/project-index.js');

const AVAILABLE_ID = '11111111-1111-4111-8111-111111111111';
const UNAVAILABLE_ID = '22222222-2222-4222-8222-222222222222';

const projects = [
  {
    id: UNAVAILABLE_ID,
    name: '같은 이름',
    root: 'C:\\gone\\same',
    availability: 'unavailable',
    counts: { active: null, blocked: null },
    diagnostic_count: 0,
    last_modified: null,
  },
  {
    id: AVAILABLE_ID,
    name: '같은 이름',
    root: 'C:\\work\\same',
    availability: 'available',
    counts: { active: 2, blocked: 1 },
    diagnostic_count: 1,
    last_modified: '2026-08-19T05:00:00.000Z',
  },
];

const indexFixture = {
  project: projects[1],
  issues: [
    {
      id: 'PL-0002', title: '검색 가능한 구현', type: 'task', status: 'doing', risk: 'high',
      current_summary: 'Glass 화면 구현 중', next_action: '키보드 계약 검증',
      updated_at: '2026-08-19T04:00:00.000Z', plan_ids: ['PLAN-0002'], spec_ids: ['SPEC-0005'],
      flow_signal_ids: ['issue:PL-0002:implementation-ready'],
    },
    {
      id: 'PL-0001', title: '중단 버그', type: 'bug', status: 'blocked', risk: 'critical',
      current_summary: 'API를 기다림', next_action: '연결 확인',
      updated_at: '2026-08-18T04:00:00.000Z', plan_ids: [], spec_ids: [],
      flow_signal_ids: ['issue:PL-0001:link-mismatch'],
    },
    {
      id: 'PL-0003', title: '완료 문서', type: 'documentation', status: 'resolved', risk: 'low',
      current_summary: '문서 완료', next_action: '없음', updated_at: '2026-08-17T04:00:00.000Z',
      plan_ids: [], spec_ids: [], flow_signal_ids: [],
    },
  ],
  plans: [{
    id: 'PLAN-0002', title: '통합 대시보드 기획', status: 'ready', related_issues: ['PL-0002'],
    linked_issue_ids: ['PL-0002'], relative_path: '.emeth/plan/PLAN-0002/PLAN.md',
    updated_at: '2026-08-18T05:00:00.000Z',
  }],
  specs: [{
    id: 'SPEC-0005', title: 'Pulse 화면 계약', status: 'ready', related_issues: ['PL-0002', 'PL-9999'],
    linked_issue_ids: ['PL-0002'], relative_path: '.emeth/specs/SPEC-0005/SPEC.md',
    updated_at: '2026-08-19T05:00:00.000Z', kind: 'feature', revision: 2,
  }, {
    id: 'SPEC-0006', title: '완료된 화면 계약', status: 'completed', related_issues: [],
    linked_issue_ids: [], relative_path: '.emeth/specs/SPEC-0006/SPEC.md',
    updated_at: '2026-08-18T06:00:00.000Z', kind: 'feature', revision: 1,
  }],
  flow_signals: [
    {
      signal: 'implementation-ready', target: { kind: 'issue', id: 'PL-0002' },
      observed: '연결된 Spec이 ready입니다.', next_action: '사용자가 승인한 구현 작업 여부를 확인합니다.',
    },
    {
      signal: 'link-mismatch', target: { kind: 'spec', id: 'SPEC-0005' },
      observed: 'Issue와 문서의 양방향 연결이 일치하지 않습니다.', next_action: '양쪽 원본 링크를 확인합니다.',
    },
  ],
  diagnostics: [{ code: 'record-invalid', message: '기록을 읽지 못했습니다.', relative_path: '.emeth/issues/bad.json' }],
  read_at: '2026-08-19T06:00:00.000Z',
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return { promise, reject, resolve };
}

const planKey = '[data-focus-key="documents:item:plan:PLAN-0002"]';
const specKey = '[data-focus-key="documents:item:spec:SPEC-0005"]';
const detail = (kind, id, body) => ({ kind, id, title: id, body, status: 'ready', relative_path: id + '.md' });
async function documentPage(t, routes = {}) {
  const page = await dashboard(t, { projects: [projects[1]], routes: {
    ['/api/v1/projects/' + AVAILABLE_ID + '/index']: { ...indexFixture, read_at: 'initial' }, ...routes,
  } });
  page.click('[data-view="documents"]');
  return page;
}
const documentRoute = (kind, id) => '/api/v1/projects/' + AVAILABLE_ID + '/documents/' + kind + '/' + id;

test('production index schema feeds full signal IDs and canonical completed Spec status to UI', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-dashboard-ui-schema-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const issueDirectory = path.join(root, '.emeth', 'issues');
  const readySpecDirectory = path.join(root, '.emeth', 'specs', 'SPEC-0005-ready');
  const completedSpecDirectory = path.join(root, '.emeth', 'specs', 'SPEC-0006-completed');
  fs.mkdirSync(issueDirectory, { recursive: true });
  fs.mkdirSync(readySpecDirectory, { recursive: true });
  fs.mkdirSync(completedSpecDirectory, { recursive: true });
  fs.writeFileSync(path.join(issueDirectory, 'PL-0002.json'), JSON.stringify({
    schema_version: 2,
    identity: { id: 'PL-0002', aliases: [], type: 'task', mode: 'simple', title: 'Dashboard', risk: 'high' },
    origin: { kind: 'request', summary: 'Dashboard UI', refs: [] },
    state: { status: 'doing', current_summary: 'UI 구현', next_action: '검증' },
    objective: { summary: 'Dashboard 제공', constraints: [] },
    criteria: [{ id: 'C1', text: 'UI가 표시됨', evidence_refs: [] }],
    milestones: [],
    relations: [],
    context: [{ kind: 'Spec', location: '.emeth/specs/SPEC-0005-ready/SPEC.md' }],
    artifacts: [],
    evidence: [],
    events: [],
    created_at: '2026-08-19T00:00:00.000Z',
    updated_at: '2026-08-19T01:00:00.000Z',
  }), 'utf8');
  const writeSpec = (directory, metadata) => fs.writeFileSync(
    path.join(directory, 'SPEC.md'),
    `---\n${JSON.stringify(metadata, null, 2)}\n---\n# ${metadata.title}`,
    'utf8',
  );
  writeSpec(readySpecDirectory, {
    schema_version: 2,
    id: 'SPEC-0005',
    title: 'Ready Spec',
    kind: 'feature',
    status: 'ready',
    revision: 1,
    supersedes: [],
    superseded_by: null,
    related_issues: ['PL-0002'],
  });
  writeSpec(completedSpecDirectory, {
    schema_version: 2,
    id: 'SPEC-0006',
    title: 'Completed Spec',
    kind: 'feature',
    status: 'completed',
    revision: 1,
    supersedes: [],
    superseded_by: null,
    related_issues: [],
  });

  const index = buildProjectIndex({
    id: AVAILABLE_ID,
    root,
    registered_at: '2026-08-19T00:00:00.000Z',
  }).publicIndex;
  assert.deepEqual(index.issues[0].flow_signal_ids, ['issue:PL-0002:implementation-ready']);
  assert.deepEqual(core.signalLabels(index.issues[0].flow_signal_ids), ['구현 가능']);
  assert.deepEqual(
    core.selectDocuments(index, { kind: 'spec', status: 'completed' }).map((document) => document.id),
    ['SPEC-0006'],
  );
  assert.equal(core.STATUSES[index.specs.find((document) => document.id === 'SPEC-0006').status], '완료');
});

test('project switches ignore delayed prior success and error through the actual app', async t => {
  for (const outcome of ['success', 'error']) {
    const page = await dashboard(t);
    const pending = deferred();
    page.routes['/api/v1/projects/beta/index'] = pending.promise;
    page.click('[data-project-id="beta"]');
    page.click('[data-project-id="alpha"]');
    await page.settle();
    pending.resolve(outcome === 'success' ? index(project('beta'), 'STALE-BETA') : { error: { message: 'STALE-ERROR' } });
    await page.settle();
    assert.match(page.get('#view-panel').textContent, /alpha/);
    assert.doesNotMatch(page.get('#view-panel').textContent + page.get('#status-stack').textContent, /STALE/);
    assert.equal(page.get('#current-project').textContent, 'alpha');
  }
});

test('late document response is cached for its own key without replacing selected detail', async t => {
  const plan = deferred(), spec = deferred();
  const page = await documentPage(t, { [documentRoute('plan', 'PLAN-0002')]: plan.promise, [documentRoute('spec', 'SPEC-0005')]: spec.promise });
  page.click(planKey); page.click(specKey);
  spec.resolve(detail('spec', 'SPEC-0005', 'CURRENT-SPEC')); await page.settle();
  plan.resolve(detail('plan', 'PLAN-0002', 'CACHED-PLAN')); await page.settle();
  assert.match(page.get('.document-detail').textContent, /CURRENT-SPEC/);
  assert.doesNotMatch(page.get('.document-detail').textContent, /CACHED-PLAN/);
  page.click(planKey); await page.settle();
  assert.match(page.get('.document-detail').textContent, /CACHED-PLAN/);
  assert.equal(page.calls.filter(call => call.url === documentRoute('plan', 'PLAN-0002')).length, 1);
});

test('newest same-document success wins over an older late success', async t => {
  const older = deferred(), newest = deferred(); let attempts = 0;
  const page = await documentPage(t, { [documentRoute('plan', 'PLAN-0002')]: () => ++attempts === 1 ? older.promise : newest.promise });
  page.click(planKey); page.click(planKey);
  newest.resolve(detail('plan', 'PLAN-0002', 'NEWEST')); await page.settle();
  older.resolve(detail('plan', 'PLAN-0002', 'STALE')); await page.settle();
  assert.match(page.get('.document-detail').textContent, /NEWEST/);
  assert.doesNotMatch(page.get('.document-detail').textContent, /STALE/);
  page.click(planKey); await page.settle();
  assert.match(page.get('.document-detail').textContent, /NEWEST/);
  assert.equal(attempts, 2);
});

test('newest same-document success is not replaced by an older late error', async t => {
  const older = deferred(), newest = deferred(); let attempts = 0;
  const page = await documentPage(t, { [documentRoute('plan', 'PLAN-0002')]: () => ++attempts === 1 ? older.promise : newest.promise });
  page.click(planKey); page.click(planKey);
  newest.resolve(detail('plan', 'PLAN-0002', 'NEWEST')); await page.settle();
  older.resolve({ error: { message: 'STALE-ERROR' } }); await page.settle();
  assert.match(page.get('.document-detail').textContent, /NEWEST/);
  assert.doesNotMatch(page.get('.document-detail').textContent + page.get('#status-stack').textContent, /STALE-ERROR/);
});

test('index completion reloads the document selected during refresh after clearing its early detail', async t => {
  const refresh = deferred(), early = deferred(), reloaded = deferred(); let attempts = 0;
  const page = await documentPage(t, {
    ['/api/v1/projects/' + AVAILABLE_ID + '/index?refresh=1']: refresh.promise,
    [documentRoute('plan', 'PLAN-0002')]: () => ++attempts === 1 ? early.promise : reloaded.promise,
  });
  page.click('#refresh-button'); page.click(planKey);
  early.resolve(detail('plan', 'PLAN-0002', 'EARLY')); await page.settle();
  assert.match(page.get('.document-detail').textContent, /EARLY/);
  refresh.resolve({ ...indexFixture, read_at: 'refreshed' }); await page.settle();
  assert.equal(attempts, 2);
  assert.doesNotMatch(page.get('.document-detail').textContent, /EARLY/);
  assert.ok(page.get('.document-detail .empty-state'));
  assert.equal(page.get('.document-detail .markdown-body'), null);
  reloaded.resolve(detail('plan', 'PLAN-0002', 'RELOADED')); await page.settle();
  assert.match(page.get('.document-detail').textContent, /RELOADED/);
});

test('collapsed rail cues distinguish same-name projects and remain stable when reordered', () => {
  const posixCasePeers = [
    { name: 'same', root: '/Users/A/same', availability: 'available' },
    { name: 'same', root: '/Users/a/same', availability: 'available' },
  ];
  const drivePeers = [
    { name: 'same', root: 'C:\\same', availability: 'available' },
    { name: 'same', root: 'D:\\same', availability: 'available' },
  ];
  for (const peers of [projects, posixCasePeers, drivePeers]) {
    const cues = peers.map(project => core.projectRailCue(project, peers));
    assert.ok(cues.every(cue => cue.trim().length > 0));
    assert.equal(new Set(cues).size, peers.length);
    assert.deepEqual(peers.map(project => core.projectRailCue(project, [...peers].reverse())), cues);
  }
});

test('project selection restores desktop focus and returns mobile focus to the drawer opener', async t => {
  const page = await dashboard(t, { width: 768 });
  page.click('[data-project-id="beta"]'); await page.settle();
  assert.equal(page.document.activeElement.dataset.projectId, 'beta');
  page.resize(390);
  const menu = page.get('#menu-button'); menu.focus(); menu.click();
  assert.equal(page.get('.workspace').inert, true);
  page.click('[data-project-id="alpha"]'); await page.settle();
  assert.equal(page.document.activeElement, menu);
  assert.equal(page.get('.workspace').inert, false);
  assert.equal(page.get('#project-panel').inert, true);
  const requested = await dashboard(t, { query: '?project=beta&expected_version=older' });
  assert.equal(requested.get('#current-project').textContent, 'beta');
  assert.ok(requested.get('#status-stack [role="alert"]').textContent.includes('older'));
});

test('document loading, success and failure preserve focus and stale responses cannot steal it', async t => {
  const plan = deferred(), spec = deferred();
  const page = await documentPage(t, { [documentRoute('plan', 'PLAN-0002')]: plan.promise, [documentRoute('spec', 'SPEC-0005')]: spec.promise });
  page.get(planKey).focus(); page.click(planKey);
  assert.equal(page.document.activeElement, page.get(planKey));
  page.get(specKey).focus(); page.click(specKey);
  spec.resolve({ error: { code: 'record-not-found', message: 'missing' } }); await page.settle();
  assert.ok(page.get('.document-detail .empty-state'));
  assert.equal(page.get('.document-detail .markdown-body'), null);
  assert.equal(page.document.activeElement, page.get(specKey));
  plan.resolve(detail('plan', 'PLAN-0002', 'CACHED')); await page.settle();
  assert.equal(page.document.activeElement, page.get(specKey));
  page.click(planKey); await page.settle();
  assert.equal(page.document.activeElement, page.get(planKey));
  const fallback = deferred();
  page.routes[documentRoute('spec', 'SPEC-0006')] = fallback.promise;
  page.click('[data-focus-key="documents:item:spec:SPEC-0006"]');
  const filter = '[data-focus-key="documents:kind"]';
  page.change(filter, 'plan');
  fallback.resolve(detail('spec', 'SPEC-0006', 'Selected document is filtered out'));
  await page.settle();
  assert.equal(page.document.activeElement, page.get(filter));
});

test('background mode and image replacement are separate keyboard controls', async t => {
  const stored = new Map();
  const setup = window => {
    window.Blob = Blob;
    window.URL.createObjectURL = () => 'blob:stored-background';
    window.URL.revokeObjectURL = () => {};
    window.indexedDB = { open() {
      const request = {};
      queueMicrotask(() => {
        request.result = { close() {}, transaction() {
          const transaction = { objectStore: () => ({
            get(key) {
              const read = {};
              queueMicrotask(() => { read.result = stored.get(key); read.onsuccess(); });
              return read;
            },
            put(blob, key) { stored.set(key, blob); queueMicrotask(() => transaction.oncomplete()); },
          }) };
          return transaction;
        } };
        request.onsuccess();
      });
      return request;
    } };
  };
  const page = await dashboard(t, { setup });
  const input = page.get('#background-file'), mode = page.get('#background-mode'), button = page.get('#background-button');
  assert.equal(input.tabIndex, -1); assert.equal(input.hidden, true); assert.equal(input.getAttribute('aria-hidden'), 'true');
  for (const node of [mode, button]) { assert.equal(node.tabIndex, 0); assert.equal(node.hidden, false); assert.notEqual(node.getAttribute('aria-hidden'), 'true'); }
  assert.deepEqual([...mode.options].map(option => option.value), ['color', 'image']);
  let picks = 0; input.addEventListener('click', event => { event.preventDefault(); picks++; });
  button.click(); assert.equal(picks, 1);
  page.change('#background-mode', 'image'); assert.equal(picks, 2);
  assert.equal(mode.value, 'color');
  const image = new Blob(['image bytes'], { type: 'image/png' });
  Object.defineProperty(input, 'files', { value: [image] });
  input.dispatchEvent(new page.window.Event('change')); await page.settle();
  assert.equal(page.document.documentElement.dataset.background, 'image');
  assert.equal(page.window.localStorage.getItem('emeth.dashboard.background'), 'image');
  const restored = await dashboard(t, { setup, storage: { 'emeth.dashboard.background': 'image' } });
  assert.equal(restored.document.documentElement.dataset.background, 'image');
  assert.match(restored.document.documentElement.style.getPropertyValue('--background-image'), /blob:stored-background/);
  page.change('#background-mode', 'color');
  assert.equal(page.document.documentElement.dataset.background, 'color');
});

test('safe Markdown escapes HTML and only creates hardened HTTP links', () => {
  const rendered = core.renderMarkdown([
    '# 제목',
    '',
    '<script>alert(1)</script><img src=x onerror=alert(2)>',
    '',
    '[안전](https://example.com/path?a=1&b=2)',
    '[위험](javascript:alert(3))',
    '![외부 이미지](https://example.com/tracker.png)',
    '',
    '| 열 | 값 |',
    '| --- | --- |',
    '| `<b>` | **강조** |',
    '',
    '```html',
    '<iframe src="https://example.com"></iframe>',
    '```',
  ].join('\n'));

  const content = JSDOM.fragment(rendered);
  assert.equal(content.querySelector('h1').textContent, '제목');
  assert.ok(content.textContent.includes('<script>alert(1)</script>'));
  assert.equal(content.querySelector('script, img, iframe'), null);
  const link = content.querySelector('a');
  assert.equal(link.getAttribute('href'), 'https://example.com/path?a=1&b=2');
  assert.equal(link.target, '_blank');
  assert.ok(link.relList.contains('noopener'));
  assert.ok(link.relList.contains('noreferrer'));
  assert.ok([...content.querySelectorAll('a')].every(node => /^https?:/.test(node.getAttribute('href'))));
  assert.equal(content.querySelector('table code').textContent, '<b>');
  assert.ok(content.querySelector('pre code.language-html').textContent.startsWith('<iframe'));
});

test('projects prioritize availability, active work, and the most recently created issue', () => {
  const available = { availability: 'available', root: 'C:/work', counts: { active: 0 } };
  const entries = [
    { ...available, id: 'idle-new', name: 'A', latest_issue: { created_at: '2026-09-05T00:00:00Z' } },
    { ...available, id: 'active-old', name: 'B', counts: { active: 5 }, latest_issue: { created_at: '2026-08-01T00:00:00Z' } },
    { ...available, id: 'active-new', name: 'C', counts: { active: 1 }, latest_issue: { created_at: '2026-09-04T00:00:00Z' } },
    { ...available, id: 'empty', name: 'D' },
    { ...available, id: 'gone', name: 'E', availability: 'unavailable', counts: { active: null } },
  ];
  assert.deepEqual(core.projectOptions(entries).map((item) => item.id), ['active-new', 'active-old', 'idle-new', 'empty', 'gone']);
  assert.equal(core.initialProjectId(entries, null), 'active-new');
  assert.equal(core.initialProjectId(entries, 'idle-new'), 'idle-new');
  assert.deepEqual(entries.map((item) => item.id), ['idle-new', 'active-old', 'active-new', 'empty', 'gone']);
  assert.deepEqual(core.projectOptions(entries, 'B').map((item) => item.id), ['active-old']);
});

test('work columns sort independently in both directions with a stable ID tie break', () => {
  const fixture = { issues: [
    { id: 'PL-0003', title: '다', type: 'documentation', status: 'blocked', risk: 'critical', updated_at: '2026-09-03T00:00:00Z' },
    { id: 'PL-0001', title: '가', type: 'task', status: 'doing', risk: 'low', updated_at: '2026-09-02T00:00:00Z' },
    { id: 'PL-0002', title: '나', type: 'bug', status: 'open', risk: 'high', updated_at: '2026-09-01T00:00:00Z' },
  ] };
  const expected = { id: [1, 2, 3], title: [1, 2, 3], type: [1, 3, 2], status: [1, 2, 3], risk: [3, 2, 1], date: [2, 1, 3] };
  for (const [field, order] of Object.entries(expected)) {
    for (const direction of ['asc', 'desc']) {
      const ids = direction === 'asc' ? order : [...order].reverse();
      assert.deepEqual(core.selectIssues(fixture, { quick: 'all', sort: `${field}-${direction}` }).map((item) => item.id),
        ids.map((id) => `PL-000${id}`), `${field}-${direction}`);
    }
  }
  assert.deepEqual(core.selectIssues(fixture, { quick: 'active', sort: 'title-desc' }).map((item) => item.id), ['PL-0002', 'PL-0001']);
  const tied = { issues: fixture.issues.map((item) => ({ ...item, title: '같음' })) };
  assert.deepEqual(core.selectIssues(tied, { quick: 'all', sort: 'title-desc' }).map((item) => item.id), ['PL-0001', 'PL-0002', 'PL-0003']);
});

test('dashboard controls keep keyboard focus, sort state and independent list visibility', async t => {
  const page = await dashboard(t, {
    projects, query: `?project=${UNAVAILABLE_ID}`,
    routes: { ['/api/v1/projects/' + AVAILABLE_ID + '/index']: indexFixture },
  });
  assert.equal(page.get('[data-project-id][aria-selected="true"]').dataset.projectId, AVAILABLE_ID);
  page.change('#project-search', 'gone', 'input');
  assert.deepEqual([...page.document.querySelectorAll('[data-project-id]')].map(node => node.dataset.projectId), [UNAVAILABLE_ID]);
  page.change('#project-search', '', 'input');
  page.click('[data-view="documents"]');
  const tabs = page.get('#view-tabs');
  assert.equal(tabs.getAttribute('role'), 'tablist');
  assert.equal(page.get('#status-stack').getAttribute('aria-live'), 'polite');
  page.get('[data-view="documents"]').focus();
  page.key(page.document.activeElement, 'ArrowLeft');
  assert.equal(page.document.activeElement.dataset.view, 'work');
  assert.equal(page.document.activeElement.getAttribute('aria-selected'), 'true');
  assert.equal(page.get('#' + page.document.activeElement.getAttribute('aria-controls')), page.get('#view-panel'));
  for (const [key, value] of [['work:type', 'task'], ['work:status', 'doing'], ['work:risk', 'high']]) {
    const selector = `[data-focus-key="${key}"]`;
    page.get(selector).focus(); page.change(selector, value);
    assert.equal(page.document.activeElement, page.get(selector));
    assert.match(page.get('.issue-table').textContent, /검색 가능한 구현/);
    assert.doesNotMatch(page.get('.issue-table').textContent, /중단 버그/);
  }
  page.click('[data-focus-key="work:sort:title"]');
  assert.equal(page.get('[data-focus-key="work:sort:title"]').closest('th').getAttribute('aria-sort'), 'ascending');
  page.click('.issue-toggle');
  assert.match(page.get('.issue-detail').textContent, /구현 가능/);
  page.change('#global-search', 'Pulse 화면 계약', 'input');
  assert.match(page.get('.issue-table').textContent, /PL-0002/);
  page.change('#global-search', '', 'input');
  for (const key of ['type', 'status', 'risk']) page.change(`[data-focus-key="work:${key}"]`, 'all');
  page.click('[data-quick="blocked"]');
  assert.match(page.get('.issue-table').textContent, /PL-0001/);
  assert.doesNotMatch(page.get('.issue-table').textContent, /PL-0002|PL-0003/);
  page.click('[data-quick="completed-group"]');
  assert.match(page.get('.issue-table').textContent, /PL-0003/);
  assert.doesNotMatch(page.get('.issue-table').textContent, /PL-0001|PL-0002/);
  page.click('[data-focus-key="work:list-toggle"]');
  assert.equal(page.get('#work-list').hidden, true);
  page.click('[data-view="documents"]');
  for (const [key, value] of [['documents:kind', 'spec'], ['documents:status', 'completed'], ['documents:sort', 'id-asc']]) {
    const selector = `[data-focus-key="${key}"]`;
    page.get(selector).focus(); page.change(selector, value);
    assert.equal(page.document.activeElement, page.get(selector));
  }
  assert.match(page.get('#document-list').textContent, /SPEC-0006/);
  assert.match(page.get('#document-list').textContent, /스펙/);
  assert.doesNotMatch(page.get('#document-list').textContent, /SPEC-0005|PLAN/);
  page.click('[data-focus-key="documents:list-toggle"]');
  assert.equal(page.get('#document-list').hidden, true);
  assert.equal(tabs.querySelector('[aria-selected="true"]').dataset.view, 'documents');
  assert.equal(new URL(page.get('#architecture-link').href).searchParams.get('project'), AVAILABLE_ID);
  page.change('[data-focus-key="documents:status"]', 'ready');
  page.change('#global-search', 'PL-9999', 'input');
  assert.match(page.get('#document-list').textContent, /SPEC-0005/);
  assert.match(page.get('#document-list').textContent, /연결 확인 필요/);
  page.change('#global-search', '', 'input');
  page.click('[data-view="flow"]');
  assert.deepEqual([...page.document.querySelectorAll('.signal-name')].map(node => node.textContent), ['연결 확인 필요', '구현 가능']);
  page.click('#panel-toggle');
  assert.equal(page.get('#app-shell').classList.contains('project-panel-collapsed'), true);
  assert.equal(page.window.localStorage.getItem('emeth.dashboard.sidebar'), 'collapsed');
  page.click('.appearance-settings summary');
  assert.equal(page.get('#app-shell').classList.contains('project-panel-collapsed'), false);
});

test('mobile drawer traps Tab focus and Escape restores its opener', async t => {
  const page = await dashboard(t, { width: 390 });
  const menu = page.get('#menu-button'); menu.focus(); menu.click();
  assert.equal(page.get('#' + menu.getAttribute('aria-controls')), page.get('#project-panel'));
  const first = page.get('#project-panel a[href="/"]'), last = page.get('#panel-toggle');
  last.focus(); page.key(last, 'Tab'); assert.equal(page.document.activeElement, first);
  page.key(first, 'Tab', { shiftKey: true }); assert.equal(page.document.activeElement, last);
  page.key(last, 'Escape');
  assert.equal(page.document.activeElement, menu);
  assert.equal(page.get('#project-panel').inert, true);
  assert.equal(page.get('.workspace').hasAttribute('aria-hidden'), false);
});

test('visible-page refresh, unavailable removal and Markdown rendering use real event handlers', async t => {
  const page = await documentPage(t, { [documentRoute('plan', 'PLAN-0002')]: detail('plan', 'PLAN-0002', '<img src=x onerror=alert(1)>\n\n```mermaid\ngraph LR\n A --> B\n```') });
  page.click(planKey); await page.settle();
  assert.equal(page.get('.markdown-body img'), null);
  assert.match(page.diagrams[0], /A --> B/);
  assert.equal(page.mermaidOptions[0].securityLevel, 'strict');
  const before = page.calls.length;
  assert.equal(page.intervals[0].delay, 30000);
  page.intervals[0].callback(); await page.settle();
  page.document.dispatchEvent(new page.window.Event('visibilitychange')); await page.settle();
  assert.equal(page.calls.slice(before).filter(call => call.url.endsWith('/index')).length, 2);
  const gone = { ...project('gone'), availability: 'unavailable' };
  const removal = await dashboard(t, { projects: [gone] });
  removal.window.confirm = () => true;
  removal.routes['/api/v1/projects/gone'] = {};
  removal.routes['/api/v1/projects'] = { projects: [] };
  removal.click('.danger-button'); await removal.settle();
  assert.equal(removal.calls.find(call => call.method === 'DELETE').url, '/api/v1/projects/gone');
  assert.equal(removal.get('.project-option'), null);
  assert.ok(removal.get('#view-panel .empty-state p').textContent.trim());
});

test('a late diagram failure leaves a different dashboard view alone and current failures retain the source', async t => {
  const older = deferred(), current = deferred();
  let attempts = 0;
  const page = await dashboard(t, { projects: [projects[1]],
    setup(window) { window.testMermaid.run = () => ++attempts === 1 ? older.promise : current.promise; }, routes: {
      ['/api/v1/projects/' + AVAILABLE_ID + '/index']: { ...indexFixture, read_at: 'initial' },
      [documentRoute('plan', 'PLAN-0002')]: detail('plan', 'PLAN-0002', '# Diagram\n\n```mermaid\ngraph LR\n A --> B\n```'),
    } });
  page.click('[data-view="documents"]');
  page.click(planKey); await page.settle();
  page.click('[data-view="work"]'); await page.settle();
  older.reject(new Error('Earlier diagram failed')); await page.settle();
  assert.doesNotMatch(page.get('#status-stack').textContent, /Mermaid/);
  assert.equal(page.get('[data-view="work"]').getAttribute('aria-selected'), 'true');
  assert.ok(page.get('.issue-table'));

  page.click('[data-view="documents"]'); await page.settle();
  current.reject(new Error('Current diagram failed')); await page.settle();
  assert.match(page.get('#status-stack').textContent, /Mermaid/);
  assert.match(page.get('.markdown-body pre > code').textContent, /A --> B/);
});
