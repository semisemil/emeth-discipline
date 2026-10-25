'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const { dashboard, project, index, deferred } = require('./helpers/dashboard-page');
const core = require('../plugins/emeth-discipline/dashboard/assets/core.js');

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
