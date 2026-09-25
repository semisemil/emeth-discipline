'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const core = require('../dashboard/assets/core.js');
const { buildProjectIndex } = require('../dashboard/records/project-index.js');
const { createDashboardHttpServer } = require('../dashboard/server.js');

const ASSET_ROOT = path.join(__dirname, '..', 'dashboard', 'assets');
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

function readAsset(name) {
  return fs.readFileSync(path.join(ASSET_ROOT, name), 'utf8');
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return { promise, reject, resolve };
}

function request(server, requestPath, options = {}) {
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  return new Promise((resolve, reject) => {
    const requestValue = http.request({
      host: '127.0.0.1',
      port,
      path: requestPath,
      method: options.method || 'GET',
      headers: {
        Host: `127.0.0.1:${port}`,
        ...(options.origin ? { Origin: origin } : {}),
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
    requestValue.on('error', reject);
    requestValue.end();
  });
}

async function uiServer(t) {
  const forgotten = [];
  const projectService = {
    listProjects: () => projects,
    getIndex: (id) => {
      assert.equal(id, AVAILABLE_ID);
      return indexFixture;
    },
    getDocument: (projectId, kind, id) => ({
      kind,
      id,
      title: 'Pulse 화면 계약',
      status: 'ready',
      metadata: { revision: 2, related_issues: ['PL-0002'] },
      content_type: 'text/markdown',
      body: '# 안전한 본문\n\n[공식 문서](https://example.com)',
      relative_path: '.emeth/specs/SPEC-0005/SPEC.md',
      updated_at: '2026-08-19T05:00:00.000Z',
      projectId,
    }),
    forgetUnavailableProject: (id) => forgotten.push(id),
  };
  const server = createDashboardHttpServer({
    instanceId: '33333333-3333-4333-8333-333333333333',
    version: '0.6.3',
    assetRoot: ASSET_ROOT,
    projectService,
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { forgotten, server };
}

test('actual dashboard assets are served with the real API fixture', async (t) => {
  const { forgotten, server } = await uiServer(t);
  const root = await request(server, '/?expected_version=0.6.3');
  assert.equal(root.status, 200);
  assert.match(root.headers['content-type'], /^text\/html/);
  assert.equal(root.body, readAsset('index.html'));
  assert.match(root.body, /href="\/dashboard"/);
  assert.match(root.body, /href="\/architecture"/);

  const dashboard = await request(
    server,
    `/dashboard?project=${AVAILABLE_ID}&expected_version=0.6.3`,
  );
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body, readAsset('dashboard.html'));
  assert.match(dashboard.body, /src="\/core\.js"/);
  assert.match(dashboard.body, /src="\/vendor\/mermaid\.min\.js"/);
  assert.match(dashboard.body, /src="\/app\.js"/);
  assert.match(dashboard.body, /href="\/styles\.css"/);

  for (const asset of ['core.js', 'motion.js', 'app.js', 'intro.js', 'styles.css', 'vendor/mermaid.min.js']) {
    const response = await request(server, `/${asset}`);
    assert.equal(response.status, 200, asset);
    assert.equal(response.body, readAsset(asset));
  }
  const font = await request(server, '/fonts/PretendardVariable.woff2');
  assert.equal(font.status, 200);
  assert.equal(font.headers['content-type'], 'font/woff2');
  assert.equal(font.body.slice(0, 4), 'wOF2');
  assert.equal(Number(font.headers['content-length']), fs.statSync(path.join(ASSET_ROOT, 'fonts/PretendardVariable.woff2')).size);

  const listed = JSON.parse((await request(server, '/api/v1/projects')).body);
  assert.deepEqual(listed.projects, projects);
  const loadedIndex = JSON.parse((await request(server, `/api/v1/projects/${AVAILABLE_ID}/index`)).body);
  assert.equal(loadedIndex.issues[0].id, 'PL-0002');
  const detail = JSON.parse((await request(
    server,
    `/api/v1/projects/${AVAILABLE_ID}/documents/spec/SPEC-0005`,
  )).body);
  assert.equal(detail.content_type, 'text/markdown');

  const removed = await request(server, `/api/v1/projects/${UNAVAILABLE_ID}`, { method: 'DELETE', origin: true });
  assert.equal(removed.status, 204);
  assert.deepEqual(forgotten, [UNAVAILABLE_ID]);
});

test('project choice, search, independent issue axes, documents, and flow ordering use API fields', () => {
  assert.deepEqual(Object.keys(core.ISSUE_TYPES), [
    'bug', 'task', 'feature', 'research', 'documentation', 'maintenance',
  ]);
  assert.deepEqual(Object.keys(core.RISKS), ['critical', 'high', 'medium', 'low']);
  assert.deepEqual(
    ['open', 'doing', 'blocked', 'resolved', 'cancelled', 'superseded'].map((status) => core.STATUSES[status]),
    ['정의됨', '작업 중', '보류', '완료', '취소', '대체됨'],
  );
  assert.equal(core.initialProjectId(projects, UNAVAILABLE_ID), AVAILABLE_ID);
  assert.deepEqual(core.projectOptions(projects, 'gone').map((item) => item.id), [UNAVAILABLE_ID]);
  assert.deepEqual(core.projectOptions(projects).map((item) => item.root), ['C:\\work\\same', 'C:\\gone\\same']);

  assert.deepEqual(core.selectIssues(indexFixture, {
    quick: 'active', type: 'task', status: 'doing', risk: 'high', search: 'Pulse 화면 계약', sort: 'risk-asc',
  }).map((item) => item.id), ['PL-0002']);
  assert.deepEqual(core.selectIssues(indexFixture, {
    quick: 'blocked', type: 'bug', status: 'blocked', risk: 'critical', sort: 'id-asc',
  }).map((item) => item.id), ['PL-0001']);
  assert.deepEqual(core.selectIssues(indexFixture, { quick: 'completed-group' }).map((item) => item.id), ['PL-0003']);
  assert.deepEqual(core.selectIssues(indexFixture, { quick: 'all', sort: 'date-desc' }).map((item) => item.id), [
    'PL-0002', 'PL-0001', 'PL-0003',
  ]);
  assert.deepEqual(core.selectIssues(indexFixture, { quick: 'all', sort: 'risk-asc' }).map((item) => item.id), [
    'PL-0001', 'PL-0002', 'PL-0003',
  ]);

  const documents = core.selectDocuments(indexFixture, { kind: 'spec', status: 'ready', search: 'PL-9999' });
  assert.deepEqual(documents.map((item) => item.id), ['SPEC-0005']);
  assert.deepEqual(core.relatedState(documents[0]), {
    label: 'PL-0002, PL-9999 · 연결 확인 필요',
    mismatch: true,
  });
  assert.deepEqual(
    core.selectDocuments(indexFixture, { kind: 'spec', status: 'completed' }).map((item) => item.id),
    ['SPEC-0006'],
  );
  assert.equal(core.STATUSES.completed, '완료');
  assert.equal(core.STATUSES.cancelled, '취소');
  assert.equal(core.STATUSES.superseded, '대체됨');
  assert.equal(Object.hasOwn(core.STATUSES, 'complete'), false);
  assert.deepEqual(core.signalLabels(indexFixture.issues[0].flow_signal_ids), ['구현 가능']);
  assert.deepEqual(core.signalLabels(indexFixture.issues[1].flow_signal_ids), ['연결 확인 필요']);
  assert.doesNotMatch(core.signalLabels(indexFixture.issues[0].flow_signal_ids).join(' '), /issue:|implementation-ready/);
  assert.deepEqual(core.selectSignals(indexFixture).map((item) => item.signal), [
    'link-mismatch',
    'implementation-ready',
  ]);
});

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

test('latest project index gate ignores delayed prior success and error', async () => {
  const gate = core.createLatestRequestGate();
  const view = { projectId: 'A', index: null, error: null, loading: false };
  const load = async (projectId, pending) => {
    const request = gate.begin(projectId);
    view.loading = true;
    view.error = null;
    try {
      const index = await pending;
      if (!gate.isCurrent(request, view.projectId)) return;
      view.index = index;
      view.loading = false;
    } catch (error) {
      if (!gate.isCurrent(request, view.projectId)) return;
      view.error = error.message;
      view.loading = false;
    }
  };

  const delayedA = deferred();
  const currentB = deferred();
  const loadA = load('A', delayedA.promise);
  view.projectId = 'B';
  gate.invalidate();
  const loadB = load('B', currentB.promise);
  currentB.resolve({ project: 'B' });
  await loadB;
  delayedA.resolve({ project: 'A' });
  await loadA;
  assert.deepEqual(view, { projectId: 'B', index: { project: 'B' }, error: null, loading: false });

  const delayedError = deferred();
  const currentAgain = deferred();
  view.projectId = 'A';
  gate.invalidate();
  const staleLoad = load('A', delayedError.promise);
  view.projectId = 'B';
  gate.invalidate();
  const currentLoad = load('B', currentAgain.promise);
  currentAgain.resolve({ project: 'B-current' });
  await currentLoad;
  delayedError.reject(new Error('A failure'));
  await staleLoad;
  assert.deepEqual(view, { projectId: 'B', index: { project: 'B-current' }, error: null, loading: false });
});

test('document response disposition caches captured key without replacing current detail', async () => {
  const projectId = AVAILABLE_ID;
  const plan = deferred();
  const spec = deferred();
  const gate = core.createDocumentRequestGate();
  const view = { projectId, selected: 'plan:PLAN-0002', detail: null, cache: new Map() };
  const renderOrder = [];
  const load = async (key, pending) => {
    const requestProjectId = view.projectId;
    const requestKey = key;
    const request = gate.begin(requestProjectId, requestKey);
    const detail = await pending;
    const disposition = gate.disposition(
      request,
      view.projectId,
      view.selected,
    );
    if (!disposition.cache) return;
    view.cache.set(requestKey, detail);
    if (!disposition.render) return;
    view.detail = detail;
    renderOrder.push(requestKey);
  };

  const planLoad = load('plan:PLAN-0002', plan.promise);
  view.selected = 'spec:SPEC-0005';
  const specLoad = load('spec:SPEC-0005', spec.promise);
  spec.resolve({ id: 'SPEC-0005' });
  await specLoad;
  plan.resolve({ id: 'PLAN-0002' });
  await planLoad;

  assert.deepEqual(view.detail, { id: 'SPEC-0005' });
  assert.deepEqual(renderOrder, ['spec:SPEC-0005']);
  assert.deepEqual(view.cache.get('plan:PLAN-0002'), { id: 'PLAN-0002' });
  assert.deepEqual(view.cache.get('spec:SPEC-0005'), { id: 'SPEC-0005' });
});

test('newest same-document success wins over an older late success', async () => {
  const projectId = AVAILABLE_ID;
  const older = deferred();
  const newest = deferred();
  const gate = core.createDocumentRequestGate();
  const key = 'plan:PLAN-0002';
  const view = { projectId, selected: key, detail: null, cache: new Map() };
  const renderOrder = [];
  const load = async (pending) => {
    const request = gate.begin(projectId, key);
    const detail = await pending;
    const disposition = gate.disposition(request, view.projectId, view.selected);
    if (!disposition.cache) return;
    view.cache.set(key, detail);
    if (!disposition.render) return;
    view.detail = detail;
    renderOrder.push(detail.body);
  };

  const olderLoad = load(older.promise);
  const newestLoad = load(newest.promise);
  newest.resolve({ id: 'PLAN-0002', body: 'newest detail' });
  await newestLoad;
  older.resolve({ id: 'PLAN-0002', body: 'older late detail' });
  await olderLoad;

  assert.equal(view.cache.get(key).body, 'newest detail');
  assert.equal(view.detail.body, 'newest detail');
  assert.deepEqual(renderOrder, ['newest detail']);
});

test('newest same-document success is not replaced by an older late error', async () => {
  const projectId = AVAILABLE_ID;
  const older = deferred();
  const newest = deferred();
  const gate = core.createDocumentRequestGate();
  const key = 'plan:PLAN-0002';
  const view = {
    projectId,
    selected: key,
    detail: null,
    error: null,
    cache: new Map(),
  };
  const load = async (pending) => {
    const request = gate.begin(projectId, key);
    try {
      const detail = await pending;
      const disposition = gate.disposition(request, view.projectId, view.selected);
      if (!disposition.cache) return;
      view.cache.set(key, detail);
      if (!disposition.render) return;
      view.detail = detail;
      view.error = null;
    } catch (error) {
      const disposition = gate.disposition(request, view.projectId, view.selected);
      if (!disposition.render) return;
      view.error = error.message;
    }
  };

  const olderLoad = load(older.promise);
  const newestLoad = load(newest.promise);
  newest.resolve({ id: 'PLAN-0002', body: 'newest detail' });
  await newestLoad;
  older.reject(new Error('record-unavailable'));
  await olderLoad;

  assert.equal(view.cache.get(key).body, 'newest detail');
  assert.equal(view.detail.body, 'newest detail');
  assert.equal(view.error, null);
});

test('index completion reloads the document selected during refresh after clearing its early detail', async () => {
  const projectId = AVAILABLE_ID;
  const index = deferred();
  const earlyPlan = deferred();
  const reloadedPlan = deferred();
  const gate = core.createDocumentRequestGate();
  const view = {
    projectId,
    selected: 'plan:PLAN-0001',
    cache: new Map(),
    detail: null,
  };
  let reloadStarted = false;

  const loadDocument = async (key, pending) => {
    const request = gate.begin(view.projectId, key);
    const detail = await pending;
    const disposition = gate.disposition(request, view.projectId, view.selected);
    if (!disposition.cache) return;
    view.cache.set(key, detail);
    if (disposition.render) view.detail = detail;
  };
  const refresh = async () => {
    await index.promise;
    gate.invalidate();
    view.cache.clear();
    view.detail = null;
    const reloadKey = view.selected;
    if (reloadKey && reloadKey === view.selected) {
      reloadStarted = true;
      await loadDocument(reloadKey, reloadedPlan.promise);
    }
  };

  const pendingRefresh = refresh();
  view.selected = 'plan:PLAN-0002';
  const pendingEarlyPlan = loadDocument(view.selected, earlyPlan.promise);
  earlyPlan.resolve({ id: 'PLAN-0002', body: 'detail before index completion' });
  await pendingEarlyPlan;
  assert.equal(view.cache.get('plan:PLAN-0002').body, 'detail before index completion');

  index.resolve({ read_at: '2026-08-19T00:00:01.000Z' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reloadStarted, true);
  assert.equal(view.selected, 'plan:PLAN-0002');
  assert.equal(view.cache.has('plan:PLAN-0002'), false);
  assert.equal(view.detail, null);

  reloadedPlan.resolve({ id: 'PLAN-0002', body: 'detail after index completion' });
  await pendingRefresh;
  assert.equal(view.cache.get('plan:PLAN-0002').body, 'detail after index completion');
  assert.equal(view.detail.body, 'detail after index completion');
});

test('collapsed rail cues distinguish same-name projects before selection', () => {
  assert.deepEqual(core.projectRailCue(projects[0], projects), { primary: '같1', secondary: '' });
  assert.deepEqual(core.projectRailCue(projects[1], projects), { primary: '같2', secondary: '' });

  const posixCasePeers = [
    { name: 'same', root: '/Users/A/same', availability: 'available' },
    { name: 'same', root: '/Users/a/same', availability: 'available' },
  ];
  const upperCue = core.projectRailCue(posixCasePeers[0], posixCasePeers);
  const lowerCue = core.projectRailCue(posixCasePeers[1], posixCasePeers);
  assert.match(upperCue.primary, /^s[12]$/);
  assert.match(lowerCue.primary, /^s[12]$/);
  assert.equal(upperCue.secondary, '');
  assert.equal(lowerCue.secondary, '');
  assert.notDeepEqual(upperCue, lowerCue);

  const drivePeers = [
    { name: 'same', root: 'C:\\same', availability: 'available' },
    { name: 'same', root: 'D:\\same', availability: 'available' },
  ];
  assert.deepEqual(core.projectRailCue(drivePeers[0], drivePeers), { primary: 's1', secondary: '' });
  assert.deepEqual(core.projectRailCue(drivePeers[1], drivePeers), { primary: 's2', secondary: '' });
  assert.deepEqual(core.projectRailCue(drivePeers[0], [...drivePeers].reverse()), { primary: 's1', secondary: '' });
  assert.deepEqual(core.projectRailCue({ name: 'solo', availability: 'unavailable' }, []), { primary: 'so', secondary: '' });
});

test('focus restoration transitions preserve controls at 768 and keep 390 drawer return focus', () => {
  const focusState = { active: 'BODY' };
  const rootFor = (focusKeys) => ({
    querySelectorAll() {
      return focusKeys.map((focusKey) => ({
        dataset: { focusKey },
        disabled: false,
        focus() { focusState.active = focusKey; },
      }));
    },
  });

  const projectKey768 = core.projectSelectionFocusKey(AVAILABLE_ID, 768);
  assert.equal(projectKey768, `project:${AVAILABLE_ID}`);
  assert.equal(core.restoreFocusByKey(rootFor([projectKey768]), projectKey768), true);
  assert.equal(focusState.active, projectKey768);
  assert.equal(core.projectSelectionFocusKey(AVAILABLE_ID, 681), projectKey768);

  focusState.active = 'menu-button';
  const projectKey390 = core.projectSelectionFocusKey(AVAILABLE_ID, 390);
  assert.equal(projectKey390, null);
  assert.equal(core.projectSelectionFocusKey(AVAILABLE_ID, 680), null);
  assert.equal(core.restoreFocusByKey(rootFor([`project:${AVAILABLE_ID}`]), projectKey390), false);
  assert.equal(focusState.active, 'menu-button');

  const filterKeys = [
    'work:quick:active',
    'work:type',
    'work:status',
    'work:risk',
    'work:sort:id', 'work:sort:title', 'work:sort:type', 'work:sort:status', 'work:sort:risk', 'work:sort:date',
    'documents:kind',
    'documents:status',
    'documents:sort',
  ];
  for (const focusKey of filterKeys) {
    focusState.active = 'BODY';
    assert.equal(core.restoreFocusByKey(rootFor(filterKeys), focusKey), true, focusKey);
    assert.equal(focusState.active, focusKey, focusKey);
  }
});

test('document DOM replacements restore focus for loading, success, failure, fallback, and stale discard', () => {
  const focusDocument = { body: { id: 'BODY' }, activeElement: null };
  focusDocument.activeElement = focusDocument.body;
  const focusNode = (focusKey) => ({
    dataset: { focusKey },
    disabled: false,
    isConnected: false,
    focus() { focusDocument.activeElement = this; },
  });
  const root = {
    children: [],
    querySelectorAll() { return this.children; },
    replaceChildren(...children) {
      if (this.children.includes(focusDocument.activeElement)) {
        focusDocument.activeElement = focusDocument.body;
      }
      for (const child of this.children) child.isConnected = false;
      this.children = children;
      for (const child of this.children) child.isConnected = true;
    },
  };
  const planKey = core.documentOptionFocusKey('plan', 'PLAN-0002');
  const specKey = core.documentOptionFocusKey('spec', 'SPEC-0005');

  const originalPlan = focusNode(planKey);
  root.replaceChildren(originalPlan);
  originalPlan.focus();
  assert.equal(focusDocument.activeElement, originalPlan);

  for (const phase of ['loading', 'success', 'failure']) {
    const replacement = focusNode(planKey);
    root.replaceChildren(replacement);
    assert.equal(focusDocument.activeElement, focusDocument.body, phase);
    assert.equal(core.restoreFocusByKey(root, planKey, 'documents:kind'), true, phase);
    assert.equal(focusDocument.activeElement, replacement, phase);
  }

  const kindFilter = focusNode('documents:kind');
  root.replaceChildren(kindFilter);
  assert.equal(focusDocument.activeElement, focusDocument.body);
  assert.equal(core.restoreFocusByKey(root, planKey, 'documents:kind'), true);
  assert.equal(focusDocument.activeElement, kindFilter);

  const currentSpec = focusNode(specKey);
  root.replaceChildren(currentSpec);
  currentSpec.focus();
  const stalePlan = core.documentRequestDisposition(
    AVAILABLE_ID,
    'plan:PLAN-0002',
    AVAILABLE_ID,
    'spec:SPEC-0005',
  );
  assert.deepEqual(stalePlan, { cache: true, render: false });
  assert.equal(focusDocument.activeElement, currentSpec);
});

test('background mode and image replacement are separate keyboard controls', () => {
  const html = readAsset('dashboard.html');
  const app = readAsset('app.js');
  const fileInput = html.match(/<input id="background-file"[\s\S]*?>/)?.[0] || '';
  const visibleButton = html.match(/<button class="icon-button" id="background-button"[^>]*>/)?.[0] || '';
  const modeSelect = html.match(/<select id="background-mode"[\s\S]*?<\/select>/)?.[0] || '';
  assert.match(fileInput, /tabindex="-1"/);
  assert.match(fileInput, /aria-hidden="true"/);
  assert.match(fileInput, /\shidden(?:\s|>)/);
  assert.doesNotMatch(visibleButton, /tabindex="-1"|aria-hidden="true"|\shidden(?:\s|>)/);
  assert.match(modeSelect, /단색 배경/);
  assert.match(modeSelect, /이미지 배경/);
  assert.match(app, /elements\.background\.addEventListener\('click', \(\) => elements\.backgroundFile\.click\(\)\)/);
  assert.match(app, /elements\.backgroundMode\.addEventListener\('change'/);

  let pickerActivations = 0;
  const focusNodes = [
    { id: 'background-mode', tabIndex: 0, ariaHidden: false, hidden: false, click() {} },
    { id: 'background-button', tabIndex: 0, ariaHidden: false, hidden: false, click() { pickerActivations += 1; } },
    { id: 'background-file', tabIndex: -1, ariaHidden: true, hidden: true, click() { pickerActivations += 1; } },
  ];
  assert.deepEqual(
    focusNodes.filter((node) => node.tabIndex >= 0 && !node.ariaHidden && !node.hidden).map((node) => node.id),
    ['background-mode', 'background-button'],
  );
  focusNodes[2].click();
  assert.equal(pickerActivations, 1);
});

test('dashboard user-facing artifact names are Korean and registration guidance is direct', () => {
  const html = readAsset('dashboard.html');
  const app = readAsset('app.js');
  const visibleSource = `${html}\n${app}`;

  assert.match(html, /id="global-search"[^>]*placeholder="검색"/);
  assert.match(app, /이슈, 플랜 또는 스펙 추가 시 프로젝트가 등록됩니다\./);
  assert.doesNotMatch(html, /프로젝트 원본은 이 화면에서 변경하지 않습니다\./);
  assert.doesNotMatch(visibleSource, /['">](?:Issue|Plan|Spec)(?:\s|<|없음|과|또는|→)/);
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

  assert.match(rendered, /<h1>제목<\/h1>/);
  assert.match(rendered, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(rendered, /<script|<img|<iframe/i);
  assert.match(rendered, /href="https:\/\/example\.com\/path\?a=1&amp;b=2"/);
  assert.match(rendered, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(rendered, /href="javascript:/i);
  assert.doesNotMatch(rendered, /<img\s/i);
  assert.match(rendered, /<table>/);
  assert.match(rendered, /<code>&lt;b&gt;<\/code>/);
  assert.match(rendered, /<pre><code class="language-html">&lt;iframe/);
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

test('actual markup and styles expose responsive, keyboard, tooltip, and state contracts', () => {
  const html = readAsset('dashboard.html');
  const css = readAsset('styles.css');
  const app = readAsset('app.js');

  assert.match(html, /role="tablist"/);
  assert.match(html, /aria-label="등록 프로젝트"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-controls="project-panel"/);
  assert.match(html, /<aside class="project-panel[\s\S]*?<nav class="project-panel-navigation"[\s\S]*?id="architecture-link"/);
  assert.doesNotMatch(html, /<div class="context-actions">\s*<a[^>]+id="architecture-link"/);
  assert.match(html, /src="\/vendor\/mermaid\.min\.js"/);
  assert.doesNotMatch(html, /id="rail-toggle"/);
  assert.ok((html.match(/data-tooltip=/g) || []).length >= 4);

  assert.match(css, /grid-template-columns:\s*248px minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 899px\) and \(min-width: 681px\)/);
  assert.match(css, /\.app-shell\.project-panel-collapsed\s*\{[\s\S]*?grid-template-columns:\s*76px minmax\(0, 1fr\)/);
  assert.match(css, /\.project-panel-link\s*\{[\s\S]*?width:\s*100%/);
  assert.match(css, /\.document-layout\.is-list-collapsed\s*\{[\s\S]*?grid-template-columns:\s*48px minmax\(0, 1fr\)/);
  assert.match(css, /\.markdown-body code\s*\{[\s\S]*?background:\s*var\(--markdown-code-bg\)/);
  assert.match(css, /\.markdown-body h1,[\s\S]*?border-bottom:\s*1px solid var\(--markdown-heading-line\)/);
  assert.match(css, /\.markdown-body \.mermaid\s*\{/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*?\.project-panel\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?z-index:\s*60;/);
  assert.match(css, /\.drawer-open \.project-panel[\s\S]*?transform:\s*translateX\(0\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /backdrop-filter:/);
  assert.match(html, /<details class="appearance-settings">[\s\S]*?<summary[^>]*>/);

  assert.match(app, /new URLSearchParams\(globalThis\.location\.search\)\.get\('expected_version'\)/);
  assert.match(app, /new URLSearchParams\(globalThis\.location\.search\)\.get\('project'\)/);
  assert.match(app, /architectureParams\.set\('project', projectId\)/);
  assert.match(app, /method: 'DELETE'/);
  assert.match(app, /indexRequestGate\.isCurrent\(request, state\.selectedProjectId\)/);
  assert.match(app, /state\.documents\.set\(requestKey, detail\)/);
  assert.match(app, /documentRequestGate\.invalidate\(\)[\s\S]*state\.documents\.clear\(\)[\s\S]*state\.selectedDocument/);
  assert.match(app, /openDocument\([\s\S]*\{ force: true \}/);
  assert.match(app, /state\.documentErrors\.set\(requestKey/);
  assert.match(app, /문서를 읽을 수 없음/);
  assert.match(app, /documentRequestGate\.disposition\([\s\S]*?documentRequest,[\s\S]*?state\.selectedDocument/);
  assert.match(app, /elements\.panel\.inert = true/);
  assert.match(app, /setWorkspaceInert\(true\)/);
  assert.match(app, /event\.key === 'Tab'[\s\S]*?containDrawerFocus\(event\)/);
  assert.match(app, /event\.shiftKey \? last : first/);
  assert.match(app, /state\.drawerReturnFocus = document\.activeElement/);
  assert.match(app, /setProjectPanelCollapsed\(!state\.projectPanelCollapsed\)/);
  assert.match(app, /state\.workListCollapsed = !state\.workListCollapsed/);
  assert.match(app, /state\.documentListCollapsed = !state\.documentListCollapsed/);
  assert.match(app, /querySelectorAll\('pre > code\.language-mermaid'\)/);
  assert.match(app, /mermaid\.run\(\{ nodes:/);
  assert.match(app, /firstProject \|\| elements\.projectSearch/);
  assert.match(app, /focusTarget\.focus\(\)/);
  assert.match(app, /event\.key === 'Escape'/);
  assert.match(app, /ArrowLeft/);
  assert.match(app, /indexedDB\.open\('emeth-dashboard'/);
  assert.match(app, /setInterval\([\s\S]*?30000/);
  assert.match(app, /visibilitychange[\s\S]*?visibilityState === 'visible'[\s\S]*?loadIndex\(false, true\)/);
  assert.equal((app.match(/\.innerHTML\s*=/g) || []).length, 1);
  assert.match(app, /body\.innerHTML = core\.renderMarkdown/);
  assert.match(app, /cell\.setAttribute\('aria-sort'/);
  assert.match(app, /make\('table', 'issue-table'\)/);
  assert.doesNotMatch(app, /selectControl\('정렬 기준', state\.issueSort/);
  assert.match(app, /core\.signalLabels\(issue\.flow_signal_ids\)/);
  assert.doesNotMatch(app, /\['complete', '완료'\]/);
  assert.match(app, /\['completed', '완료'\]/);
  assert.match(app, /option\.setAttribute\('aria-label', `\$\{project\.name\}/);
  assert.match(app, /option\.dataset\.focusKey = `project:\$\{project\.id\}`/);
  assert.match(app, /projectSelectionFocusKey\(project\.id, globalThis\.innerWidth\)/);
  assert.match(app, /core\.restoreFocusByKey\(elements\.projectList, focusKey\)/);
  assert.match(app, /core\.restoreFocusByKey\(elements\.viewPanel, focusKey, fallbackFocusKey\)/);
  assert.match(app, /option\.dataset\.focusKey = core\.documentOptionFocusKey/);
  assert.equal((app.match(/renderView\(focusKey, 'documents:kind'\)/g) || []).length, 2);
  for (const focusKey of [
    'work:type', 'work:status', 'work:risk',
    'documents:kind', 'documents:status', 'documents:sort',
  ]) {
    assert.match(app, new RegExp(`['\"]${focusKey}['\"]`), focusKey);
  }
});
