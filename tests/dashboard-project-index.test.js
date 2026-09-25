'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  ProjectIndexService,
  buildProjectIndex,
  buildProjectSummary,
} = require('../dashboard/records/project-index.js');

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const STATE_STARTER = path.join(
  __dirname,
  '..',
  'skills',
  'issue-ledger',
  'assets',
  'state-starter',
);

function makeRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-project-index-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.emeth', 'issues'), { recursive: true });
  return root;
}

function issue(overrides = {}) {
  return {
    schema_version: 2,
    identity: {
      id: 'PL-0001', aliases: [], type: 'feature', mode: 'simple', title: 'Dashboard', risk: 'low',
    },
    origin: { kind: 'request', summary: 'Dashboard API', refs: [] },
    state: { status: 'open', current_summary: 'API 대기', next_action: 'API 구현' },
    objective: { summary: '기록을 표시한다.', constraints: [] },
    criteria: [{ id: 'C1', text: '기록이 보인다.', evidence_refs: [] }],
    milestones: [], relations: [], context: [], artifacts: [], evidence: [], events: [],
    created_at: '2026-08-17T00:00:00.000Z',
    updated_at: '2026-08-17T01:00:00.000Z',
    ...overrides,
  };
}

function writeIssue(root, value = issue()) {
  fs.writeFileSync(path.join(root, '.emeth', 'issues', `${value.identity.id}.json`), JSON.stringify(value), 'utf8');
}

function flowIssue(id, status, context = []) {
  const value = issue();
  value.identity = { ...value.identity, id, title: id };
  value.state = { ...value.state, status };
  if (status === 'blocked') {
    value.state.blocker = 'External condition';
    value.state.unblock_condition = 'External condition resolved';
  }
  value.context = context;
  return value;
}

function writePlan(root, id, slug, values = {}) {
  const directory = path.join(root, '.emeth', 'plan', `${id}-${slug}`);
  fs.mkdirSync(directory, { recursive: true });
  const related = values.relatedIssues === undefined ? ['PL-0001'] : values.relatedIssues;
  const text = [
    '---',
    `id: ${values.bodyId || id}`,
    `title: ${values.title || id}`,
    `status: ${values.status || 'ready'}`,
    ...(related.length ? ['related_issues:', ...related.map((issueId) => `  - ${issueId}`)] : []),
    '---',
    values.body || '# Plan',
  ].join('\n');
  fs.writeFileSync(path.join(directory, 'PLAN.md'), text, 'utf8');
  return `.emeth/plan/${id}-${slug}/PLAN.md`;
}

function writeSpec(root, id, slug, values = {}) {
  const directory = path.join(root, '.emeth', 'specs', `${id}-${slug}`);
  fs.mkdirSync(directory, { recursive: true });
  const metadata = {
    schema_version: 2,
    id: values.bodyId || id,
    title: values.title || id,
    kind: 'feature',
    status: values.status || 'ready',
    revision: values.revision || 1,
    supersedes: [],
    superseded_by: null,
    related_issues: values.relatedIssues === undefined ? ['PL-0001'] : values.relatedIssues,
  };
  fs.writeFileSync(path.join(directory, 'SPEC.md'), `---\n${JSON.stringify(metadata, null, 2)}\n---\n${values.body || '# Spec'}`, 'utf8');
  return `.emeth/specs/${id}-${slug}/SPEC.md`;
}

function project(root) {
  return { id: PROJECT_ID, root, registered_at: '2026-08-17T00:00:00.000Z' };
}

test('summary and index expose the newest issue by creation time, independently of later updates', (t) => {
  const root = makeRoot(t);
  const older = issue({ updated_at: '2026-09-05T00:00:00.000Z' });
  const newer = issue({ created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z' });
  newer.identity = { ...newer.identity, id: 'PL-0002', title: '새로 등록된 작업' };
  writeIssue(root, older);
  writeIssue(root, newer);
  const expected = { id: 'PL-0002', title: '새로 등록된 작업', created_at: newer.created_at };
  assert.deepEqual(buildProjectSummary(project(root)).latest_issue, expected);
  assert.deepEqual(buildProjectIndex(project(root)).publicIndex.project.latest_issue, expected);
  older.created_at = newer.created_at;
  writeIssue(root, older);
  assert.deepEqual(buildProjectSummary(project(root)).latest_issue, expected);
  assert.equal(buildProjectSummary(project(makeRoot(t))).latest_issue, null);
  assert.equal(buildProjectSummary(project(path.join(root, 'missing'))).latest_issue, null);
});

test('project index returns canonical records, reciprocal links, and multiple flow signals', (t) => {
  const root = makeRoot(t);
  const planPath = writePlan(root, 'PLAN-0001', 'dashboard', { status: 'draft' });
  const specPath = writeSpec(root, 'SPEC-0001', 'dashboard', { status: 'ready' });
  writeIssue(root, issue({
    context: [
      { kind: 'Plan', location: planPath },
      { kind: 'Spec', location: specPath },
    ],
  }));

  const built = buildProjectIndex(project(root), { now: () => '2026-08-18T00:00:00.000Z' });
  const result = built.publicIndex;
  assert.equal(result.project.availability, 'available');
  assert.deepEqual(result.project.counts, { active: 1, blocked: 0 });
  assert.deepEqual(result.issues[0].plan_ids, ['PLAN-0001']);
  assert.deepEqual(result.issues[0].spec_ids, ['SPEC-0001']);
  assert.deepEqual(result.flow_signals.map((signal) => signal.signal), ['plan-draft', 'implementation-ready']);
  assert.equal(result.diagnostics.length, 0);
  assert.deepEqual(result.plans[0].linked_issue_ids, ['PL-0001']);
  assert.deepEqual(result.specs[0].linked_issue_ids, ['PL-0001']);
  assert.ok([...built.recordMap.values()].every((record) => record.body === undefined));
});

test('production state-starter example Issue is excluded by the canonical filename owner', (t) => {
  const root = makeRoot(t);
  fs.cpSync(STATE_STARTER, path.join(root, '.emeth'), { recursive: true });

  const result = buildProjectIndex(project(root)).publicIndex;
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.project.counts, { active: 0, blocked: 0 });
  assert.deepEqual(result.flow_signals, []);
  assert.deepEqual(result.diagnostics, []);
});

test('canonical Issue filenames use content IDs unless the filename provides an identity', (t) => {
  const root = makeRoot(t);
  const issuesDirectory = path.join(root, '.emeth', 'issues');
  fs.writeFileSync(
    path.join(issuesDirectory, 'other.json'),
    JSON.stringify(flowIssue('PL-0043', 'open')),
    'utf8',
  );
  fs.writeFileSync(path.join(issuesDirectory, 'malformed.json'), '{not-json', 'utf8');
  fs.writeFileSync(
    path.join(issuesDirectory, 'PL-0001.json'),
    JSON.stringify(flowIssue('PL-0044', 'open')),
    'utf8',
  );
  const legacy = {
    id: 'PL-0045',
    status: 'open',
    title: 'Named Markdown mismatch',
    evidence: [],
    risk: 'low',
    created_at: '2026-08-17T00:00:00.000Z',
    updated_at: '2026-08-17T01:00:00.000Z',
  };
  fs.writeFileSync(
    path.join(issuesDirectory, 'PL-0002-title.md'),
    `---\n${JSON.stringify(legacy, null, 2)}\n---\nBody`,
    'utf8',
  );

  const result = buildProjectIndex(project(root)).publicIndex;
  assert.deepEqual(result.issues.map((item) => item.id), ['PL-0043']);
  assert.deepEqual(result.project.counts, { active: 1, blocked: 0 });
  assert.deepEqual(result.flow_signals.map((item) => item.target.id), ['PL-0043']);
  assert.deepEqual(
    result.diagnostics.map((item) => ({ code: item.code, path: item.relative_path })),
    [
      { code: 'record-metadata-invalid', path: '.emeth/issues/malformed.json' },
      { code: 'record-id-mismatch', path: '.emeth/issues/PL-0001.json' },
      { code: 'record-id-mismatch', path: '.emeth/issues/PL-0002-title.md' },
    ],
  );
});

test('mismatched links and duplicate IDs are diagnosed and excluded without changing sources', (t) => {
  const root = makeRoot(t);
  const planPath = writePlan(root, 'PLAN-0001', 'first', { relatedIssues: [] });
  writePlan(root, 'PLAN-0001', 'second', { relatedIssues: [] });
  writeSpec(root, 'SPEC-0002', 'wrong-folder', { bodyId: 'SPEC-9999', relatedIssues: [] });
  writeIssue(root, issue({ context: [{ kind: 'Plan', location: planPath }] }));

  const before = fs.readFileSync(path.join(root, '.emeth', 'issues', 'PL-0001.json'), 'utf8');
  const result = buildProjectIndex(project(root)).publicIndex;
  assert.deepEqual(result.plans, []);
  assert.deepEqual(result.specs, []);
  assert.ok(result.diagnostics.some((item) => item.code === 'record-duplicate-id'));
  assert.ok(result.diagnostics.some((item) => item.code === 'record-id-mismatch'));
  assert.ok(result.diagnostics.some((item) => item.code === 'link-mismatch'));
  assert.ok(result.flow_signals.some((item) => item.signal === 'link-mismatch'));
  assert.equal(fs.readFileSync(path.join(root, '.emeth', 'issues', 'PL-0001.json'), 'utf8'), before);
});

test('source changes invalidate the index cache and documents load bodies on demand', (t) => {
  const root = makeRoot(t);
  const planPath = writePlan(root, 'PLAN-0001', 'cache', { body: '<script>alert(1)</script>' });
  writeIssue(root, issue({ context: [{ kind: 'Plan', location: planPath }] }));
  const registryPath = path.join(root, 'config', 'projects.json');
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify({ schema_version: 1, projects: [project(root)] }), 'utf8');
  const service = new ProjectIndexService({ registryOptions: { registryPath } });

  assert.equal(service.getIndex(PROJECT_ID).plans[0].status, 'ready');
  writePlan(root, 'PLAN-0001', 'cache', { status: 'draft', body: 'changed' });
  assert.equal(service.getIndex(PROJECT_ID).plans[0].status, 'draft');
  assert.equal(service.getIndex(PROJECT_ID, { refresh: true }).plans[0].status, 'draft');
  const document = service.getDocument(PROJECT_ID, 'plan', 'PLAN-0001');
  assert.equal(document.body, 'changed');
  assert.equal(document.content_type, 'text/markdown');
});

test('watchers invalidate only one project and watcher failure leaves signature refresh available', (t) => {
  const firstRoot = makeRoot(t);
  const secondRoot = makeRoot(t);
  const secondId = '22222222-2222-4222-8222-222222222222';
  writeIssue(firstRoot, issue());
  writeIssue(secondRoot, issue({
    identity: { ...issue().identity, id: 'PL-0002', title: 'Second' },
  }));
  const registryPath = path.join(firstRoot, 'config', 'projects.json');
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify({
    schema_version: 1,
    projects: [
      project(firstRoot),
      { id: secondId, root: secondRoot, registered_at: '2026-08-17T00:00:00.000Z' },
    ],
  }), 'utf8');

  const listeners = new Map();
  const service = new ProjectIndexService({
    registryOptions: { registryPath },
    watch: (directory, listener) => {
      listeners.set(directory, listener);
      return { close() {} };
    },
  });
  t.after(() => service.close());
  service.listProjects();
  service.getIndex(PROJECT_ID);
  service.getIndex(secondId);
  assert.equal(service.summaryCache.size, 2);
  assert.equal(service.cache.size, 2);

  const firstIssues = fs.realpathSync(path.join(firstRoot, '.emeth', 'issues'));
  listeners.get(firstIssues)('change', 'PL-0001.json');
  assert.equal(service.summaryCache.has(PROJECT_ID), false);
  assert.equal(service.cache.has(PROJECT_ID), false);
  assert.equal(service.summaryCache.has(secondId), true);
  assert.equal(service.cache.has(secondId), true);

  const failingService = new ProjectIndexService({
    registryOptions: { registryPath },
    watch: () => {
      throw Object.assign(new Error('watch unavailable'), { code: 'ENOSPC' });
    },
  });
  t.after(() => failingService.close());
  assert.equal(failingService.getIndex(PROJECT_ID).issues[0].status, 'open');
  const changed = issue();
  changed.state = { status: 'blocked', current_summary: 'Watcher failed', next_action: 'Poll source', blocker: 'watch', unblock_condition: 'poll' };
  writeIssue(firstRoot, changed);
  assert.equal(failingService.getIndex(PROJECT_ID).issues[0].status, 'blocked');
  assert.equal(failingService.getIndex(secondId).issues[0].title, 'Second');
});

test('record directory symlinks cannot expose files outside the registered project', (t) => {
  const root = makeRoot(t);
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-external-records-'));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  const externalRecord = path.join(external, 'PLAN.md');
  fs.writeFileSync(externalRecord, [
    '---',
    'id: PLAN-0003',
    'title: External',
    'status: ready',
    '---',
    'secret outside content',
  ].join('\n'), 'utf8');
  const planRoot = path.join(root, '.emeth', 'plan');
  fs.mkdirSync(planRoot, { recursive: true });
  fs.symlinkSync(external, path.join(planRoot, 'PLAN-0003-escape'), process.platform === 'win32' ? 'junction' : 'dir');

  const result = buildProjectIndex(project(root)).publicIndex;
  assert.deepEqual(result.plans, []);
  assert.ok(result.diagnostics.some((item) => item.code === 'record-path-outside-project'));
  assert.doesNotMatch(JSON.stringify(result), /secret outside content/);
});

test('all seven flow rules use active open or doing separately from blocked', (t) => {
  const root = makeRoot(t);
  writeIssue(root, flowIssue('PL-0101', 'open'));

  const draftPlan = writePlan(root, 'PLAN-0102', 'draft', {
    status: 'draft', relatedIssues: ['PL-0102'],
  });
  writeIssue(root, flowIssue('PL-0102', 'doing', [{ kind: 'Plan', location: draftPlan }]));

  const readyPlan = writePlan(root, 'PLAN-0103', 'ready', { relatedIssues: ['PL-0103'] });
  writeIssue(root, flowIssue('PL-0103', 'open', [{ kind: 'Plan', location: readyPlan }]));

  const draftSpec = writeSpec(root, 'SPEC-0104', 'draft', {
    status: 'draft', relatedIssues: ['PL-0104'],
  });
  writeIssue(root, flowIssue('PL-0104', 'open', [{ kind: 'Spec', location: draftSpec }]));

  const readySpec = writeSpec(root, 'SPEC-0105', 'ready', { relatedIssues: ['PL-0105'] });
  writeIssue(root, flowIssue('PL-0105', 'open', [{ kind: 'Spec', location: readySpec }]));

  const completedSpec = writeSpec(root, 'SPEC-0106', 'completed', {
    status: 'completed', relatedIssues: ['PL-0106'],
  });
  writeIssue(root, flowIssue('PL-0106', 'open', [{ kind: 'Spec', location: completedSpec }]));

  const mismatchedPlan = writePlan(root, 'PLAN-0107', 'mismatch', { relatedIssues: [] });
  writeIssue(root, flowIssue('PL-0107', 'open', [{ kind: 'Plan', location: mismatchedPlan }]));

  const blockedCompletedSpec = writeSpec(root, 'SPEC-0108', 'blocked-issue', {
    status: 'completed', relatedIssues: ['PL-0108'],
  });
  writeIssue(root, flowIssue('PL-0108', 'blocked', [{ kind: 'Spec', location: blockedCompletedSpec }]));

  const result = buildProjectIndex(project(root)).publicIndex;
  const signalFor = (issueId, signal) => result.flow_signals.some((item) => (
    item.target.kind === 'issue' && item.target.id === issueId && item.signal === signal
  ));
  assert.equal(signalFor('PL-0101', 'work-definition-only'), true);
  assert.equal(signalFor('PL-0102', 'plan-draft'), true);
  assert.equal(signalFor('PL-0103', 'spec-needed'), true);
  assert.equal(signalFor('PL-0104', 'implementation-not-ready'), true);
  assert.equal(signalFor('PL-0105', 'implementation-ready'), true);
  assert.equal(signalFor('PL-0106', 'state-mismatch'), true);
  assert.equal(signalFor('PL-0107', 'link-mismatch'), true);
  assert.equal(signalFor('PL-0108', 'work-definition-only'), false);
  assert.equal(signalFor('PL-0108', 'state-mismatch'), false);
  assert.deepEqual(result.project.counts, { active: 7, blocked: 1 });
});

test('legacy issues remain indexed and nested Spec revisions are excluded', (t) => {
  const root = makeRoot(t);
  const legacy = {
    id: 'PL-0042',
    status: 'in_progress',
    title: 'Legacy Issue',
    type: 'bug',
    evidence: [],
    risk: 'high',
    description: 'Legacy current summary',
    suggested_next_step: 'Continue verification',
    created_at: '2026-08-16T00:00:00.000Z',
    updated_at: '2026-08-17T00:00:00.000Z',
  };
  fs.writeFileSync(
    path.join(root, '.emeth', 'issues', 'PL-0042.md'),
    `---\n${JSON.stringify(legacy, null, 2)}\n---\n## Description\nLegacy body`,
    'utf8',
  );
  writeSpec(root, 'SPEC-0020', 'current', { revision: 2, relatedIssues: [] });
  const revisionDirectory = path.join(
    root,
    '.emeth',
    'specs',
    'SPEC-0020-current',
    'revisions',
    'revision-1',
  );
  fs.mkdirSync(revisionDirectory, { recursive: true });
  fs.writeFileSync(path.join(revisionDirectory, 'SPEC.md'), `---\n${JSON.stringify({
    schema_version: 2,
    id: 'SPEC-0020',
    title: 'OLD-REVISION-MUST-NOT-INDEX',
    kind: 'feature',
    status: 'draft',
    revision: 1,
    supersedes: [],
    superseded_by: null,
    related_issues: [],
  }, null, 2)}\n---\nOld revision`, 'utf8');

  const result = buildProjectIndex(project(root)).publicIndex;
  assert.deepEqual(result.issues.map((item) => ({ id: item.id, status: item.status })), [
    { id: 'PL-0042', status: 'doing' },
  ]);
  assert.deepEqual(result.specs.map((item) => ({ id: item.id, revision: item.revision })), [
    { id: 'SPEC-0020', revision: 2 },
  ]);
  assert.equal(result.diagnostics.some((item) => item.code === 'record-duplicate-id'), false);
});

test('invalid Plan YAML scalars are excluded with relative-path diagnostics', (t) => {
  const root = makeRoot(t);
  for (const [id, slug, title] of [
    ['PLAN-0030', 'null-title', 'null'],
    ['PLAN-0031', 'mapping-title', 'A: B'],
    ['PLAN-0099', 'bad-single-quote', "'bad'quote'"],
    ['PLAN-0100', 'sequence-indicator', '- bad'],
    ['PLAN-0101', 'block-indicator', '|'],
    ['PLAN-0102', 'anchor-indicator', '&anchor'],
    ['PLAN-0103', 'alias-indicator', '*anchor'],
    ['PLAN-0104', 'collection-indicator', '[bad]'],
  ]) {
    const directory = path.join(root, '.emeth', 'plan', `${id}-${slug}`);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'PLAN.md'),
      `---\nid: ${id}\ntitle: ${title}\nstatus: ready\n---\nBody`,
      'utf8',
    );
  }

  const result = buildProjectIndex(project(root)).publicIndex;
  assert.deepEqual(result.plans, []);
  assert.deepEqual(
    result.diagnostics
      .filter((item) => item.code === 'record-metadata-invalid')
      .map((item) => item.relative_path),
    [
      '.emeth/plan/PLAN-0030-null-title/PLAN.md',
      '.emeth/plan/PLAN-0031-mapping-title/PLAN.md',
      '.emeth/plan/PLAN-0099-bad-single-quote/PLAN.md',
      '.emeth/plan/PLAN-0100-sequence-indicator/PLAN.md',
      '.emeth/plan/PLAN-0101-block-indicator/PLAN.md',
      '.emeth/plan/PLAN-0102-anchor-indicator/PLAN.md',
      '.emeth/plan/PLAN-0103-alias-indicator/PLAN.md',
      '.emeth/plan/PLAN-0104-collection-indicator/PLAN.md',
    ],
  );
});
