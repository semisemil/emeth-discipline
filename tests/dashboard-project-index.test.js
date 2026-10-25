'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildProjectIndex,
  buildProjectSummary,
} = require('../plugins/emeth-discipline/dashboard/records/project-index.js');

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
function makeRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-project-index-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.emeth', 'issues'), { recursive: true });
  return root;
}

function issue(overrides = {}) {
  const template = fs.readFileSync(path.join(__dirname, '../plugins/emeth-discipline/skills/issue-ledger/assets/templates/issue-objective.json'), 'utf8');
  const value = JSON.parse(template.replace(/REPLACE: [^"]*/g, 'Dashboard'));
  value.identity.id = 'PL-0001';
  return { ...value,
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
    `id: ${id}`,
    `title: ${id}`,
    `status: ${values.status || 'ready'}`,
    ...(related.length ? ['related_issues:', ...related.map((issueId) => `  - ${issueId}`)] : []),
    '---',
    '# Plan',
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
    title: id,
    kind: 'feature',
    status: values.status || 'ready',
    revision: 1,
    supersedes: [],
    superseded_by: null,
    related_issues: values.relatedIssues === undefined ? ['PL-0001'] : values.relatedIssues,
  };
  fs.writeFileSync(path.join(directory, 'SPEC.md'), `---\n${JSON.stringify(metadata, null, 2)}\n---\n# Spec`, 'utf8');
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
