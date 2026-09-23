const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'skills', 'issue-ledger', 'scripts', 'issue-ledger.js');
const model = require(path.join(
  repoRoot,
  'skills',
  'issue-ledger',
  'lib',
  'issue-model.js'
));

function configEnv(root) {
  const projectRoot = path.dirname(path.dirname(root));
  const configRoot = path.join(projectRoot, '.test-config');
  return process.platform === 'win32'
    ? { ...process.env, APPDATA: configRoot }
    : { ...process.env, XDG_CONFIG_HOME: configRoot };
}

function makeIssue() {
  return {
    schema_version: 2,
    identity: {
      id: 'PL-0001',
      aliases: [],
      type: 'feature',
      mode: 'simple',
      title: '연결 작업 테스트',
      risk: 'low'
    },
    origin: {
      kind: '사용자 요청',
      summary: 'Plan과 Spec의 연결 상태를 유지한다.',
      refs: []
    },
    state: {
      status: 'open',
      current_summary: '연결된 산출물이 없다.',
      next_action: 'Spec을 작성한다.'
    },
    objective: {
      summary: '연결된 작업의 현재 상태를 한 곳에서 확인한다.',
      constraints: []
    },
    criteria: [
      { id: 'C1', text: '연결 상태가 일치한다.', evidence_refs: [] }
    ],
    milestones: [],
    relations: [],
    context: [],
    artifacts: [],
    evidence: [],
    events: [],
    created_at: '2026-08-12T00:00:00.000Z',
    updated_at: '2026-08-12T00:00:00.000Z'
  };
}

function createFixture(t, issue = makeIssue()) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'proofline-link-work-'));
  const root = path.join(projectRoot, '.emeth', 'issues');
  const filePath = path.join(root, 'PL-0001.json');
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(filePath, model.serializeIssue(issue), 'utf8');
  return { projectRoot, root, filePath };
}

function runLinkWork(root, overrides = {}) {
  const values = {
    issueId: 'PL-0001',
    kind: 'spec',
    workId: 'SPEC-0001',
    workPath: '.emeth\\specs\\SPEC-0001-example\\SPEC.md',
    currentSummary: 'SPEC-0001 구현을 진행 중이다.',
    nextAction: '구현 검토를 완료한다.',
    status: 'doing',
    updatedAt: '2026-08-12T01:00:00.000Z',
    relatedIssues: null,
    planInline: false,
    ...overrides
  };
  const projectRoot = path.dirname(path.dirname(root));
  const artifactPath = path.resolve(projectRoot, values.workPath.replace(/\\/g, '/'));
  if (!fs.existsSync(artifactPath)) {
    const relatedIssues = values.relatedIssues === null ? [values.issueId] : values.relatedIssues;
    const planLinks = values.planInline
      ? `related_issues: [${relatedIssues.join(', ')}]\n`
      : `related_issues:\n${relatedIssues.map((id) => `  - ${id}\n`).join('')}`;
    const metadata = values.kind === 'plan'
      ? `---\nid: ${values.workId}\ntitle: Example\nstatus: ready\n${planLinks}---\n`
      : `---\n${JSON.stringify({
        schema_version: 2,
        id: values.workId,
        title: 'Example',
        kind: 'feature',
        status: 'ready',
        revision: 1,
        supersedes: [],
        superseded_by: null,
        related_issues: relatedIssues
      }, null, 2)}\n---\n`;
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, metadata, 'utf8');
  }
  const args = [
    cliPath,
    'link-work',
    values.issueId,
    '--kind', values.kind,
    '--work-id', values.workId,
    '--path', values.workPath,
    '--current-summary', values.currentSummary,
    '--next-action', values.nextAction,
    '--root', root,
    '--project-root', projectRoot,
    '--updated-at', values.updatedAt
  ];
  if (values.status) {
    args.push('--status', values.status);
  }
  return spawnSync(process.execPath, args, { encoding: 'utf8', env: configEnv(root) });
}

test('link-work stores one canonical context link and is idempotent', (t) => {
  const { root, filePath } = createFixture(t);
  const first = runLinkWork(root);

  assert.equal(first.status, 0, first.stderr);
  const linked = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.deepEqual(linked.context, [{
    kind: 'Spec',
    location: '.emeth/specs/SPEC-0001-example/SPEC.md'
  }]);
  assert.equal(linked.state.status, 'doing');
  assert.equal(linked.state.current_summary, 'SPEC-0001 구현을 진행 중이다.');
  assert.equal(linked.state.next_action, '구현 검토를 완료한다.');
  assert.deepEqual(linked.events.map(({ kind, from, to }) => ({ kind, from, to })), [
    { kind: 'transition', from: 'open', to: 'doing' }
  ]);

  const beforeNoOp = fs.readFileSync(filePath, 'utf8');
  const second = runLinkWork(root, { updatedAt: '2026-08-12T02:00:00.000Z' });
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /^no-op: /);
  assert.equal(fs.readFileSync(filePath, 'utf8'), beforeNoOp);
});

test('Design work links round-trip through the issue ledger and dashboard with readiness signals', (t) => {
  const { root, projectRoot, filePath } = createFixture(t);
  const overrides = { kind: 'design', workId: 'DESIGN-0001', workPath: '.emeth/designs/DESIGN-0001-example/DESIGN.md' };
  assert.equal(runLinkWork(root, overrides).status, 0);
  const issue = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.deepEqual(issue.context, [{ kind: 'Design', location: overrides.workPath }]);
  const { buildProjectIndex } = require('../dashboard/records/project-index.js');
  const index = buildProjectIndex({ id: '11111111-1111-4111-8111-111111111111', root: projectRoot }).publicIndex;
  assert.deepEqual(index.issues[0].design_ids, ['DESIGN-0001']);
  assert.deepEqual(index.designs[0].linked_issue_ids, ['PL-0001']);
  assert.equal(index.diagnostics.length, 0);
  assert.ok(index.issues[0].flow_signal_ids.includes('issue:PL-0001:implementation-ready'));
  const before = fs.readFileSync(filePath, 'utf8');
  const rejected = runLinkWork(root, { ...overrides, workId: 'DESIGN-0002', workPath: '.emeth/designs/DESIGN-0002-missing/DESIGN.md', relatedIssues: [] });
  assert.equal(rejected.status, 1);
  assert.equal(fs.readFileSync(filePath, 'utf8'), before);
});

test('link-work rejects a mismatched work ID before changing the issue', (t) => {
  const { root, filePath } = createFixture(t);
  const before = fs.readFileSync(filePath, 'utf8');
  const result = runLinkWork(root, { workId: 'SPEC-0002' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /SPEC-0002의 Spec 경로가 아닙니다/);
  assert.equal(fs.readFileSync(filePath, 'utf8'), before);
});

test('link-work accepts a Plan without changing the active issue status', (t) => {
  const { root, filePath } = createFixture(t);
  const result = runLinkWork(root, {
    kind: 'plan',
    workId: 'PLAN-0001',
    workPath: '.emeth/plan/PLAN-0001-example/PLAN.md',
    currentSummary: 'PLAN-0001이 명세 입력으로 준비되었다.',
    nextAction: '구현 명세를 작성한다.',
    status: null
  });

  assert.equal(result.status, 0, result.stderr);
  const linked = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.equal(linked.state.status, 'open');
  assert.deepEqual(linked.context, [{
    kind: 'Plan',
    location: '.emeth/plan/PLAN-0001-example/PLAN.md'
  }]);
  assert.deepEqual(linked.events, []);
});

test('link-work accepts an inline Plan related_issues array', (t) => {
  const { root, filePath } = createFixture(t);
  const result = runLinkWork(root, {
    kind: 'plan',
    workId: 'PLAN-0002',
    workPath: '.emeth/plan/PLAN-0002-inline/PLAN.md',
    currentSummary: 'PLAN-0002가 준비되었다.',
    nextAction: '명세 여부를 결정한다.',
    status: null,
    planInline: true
  });

  assert.equal(result.status, 0, result.stderr);
  const linked = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.equal(linked.context[0].location, '.emeth/plan/PLAN-0002-inline/PLAN.md');
});

test('link-work rejects a missing explicit issue before changing other issues', (t) => {
  const { root, filePath } = createFixture(t);
  const before = fs.readFileSync(filePath, 'utf8');
  const result = runLinkWork(root, { issueId: 'PL-9999' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /이슈를 찾지 못했습니다: PL-9999/);
  assert.equal(fs.readFileSync(filePath, 'utf8'), before);
});

test('link-work requires the Plan or Spec to link back to the issue', (t) => {
  const { root, filePath } = createFixture(t);
  const before = fs.readFileSync(filePath, 'utf8');
  const result = runLinkWork(root, { relatedIssues: [] });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /SPEC-0001 related_issues에서 PL-0001을 찾지 못했습니다/);
  assert.equal(fs.readFileSync(filePath, 'utf8'), before);
});

test('generic update cannot bypass linked-artifact validation', (t) => {
  const { projectRoot, root, filePath } = createFixture(t);
  const before = fs.readFileSync(filePath, 'utf8');
  const operationPath = path.join(projectRoot, 'operation.json');
  fs.writeFileSync(operationPath, JSON.stringify({
    type: 'link_work',
    current_summary: '우회 갱신',
    next_action: '없음',
    work: {
      kind: 'spec',
      id: 'SPEC-0001',
      location: '.emeth/specs/SPEC-0001-example/SPEC.md'
    }
  }), 'utf8');

  const result = spawnSync(process.execPath, [
    cliPath,
    'update',
    'PL-0001',
    '--operation', operationPath,
    '--root', root
  ], { encoding: 'utf8', env: configEnv(root) });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /link_work는 역링크를 검증하는 link-work 명령으로 실행해야 합니다/);
  assert.equal(fs.readFileSync(filePath, 'utf8'), before);
});

test('link-work does not reopen or advance a terminal issue', (t) => {
  const issue = makeIssue();
  issue.state = {
    status: 'resolved',
    current_summary: '연결 작업이 검증되었다.'
  };
  issue.criteria[0].evidence_refs = ['E1'];
  issue.evidence.push({
    id: 'E1',
    kind: 'test',
    location: 'tests/issue-ledger-link-work.test.js',
    observation: '연결 상태가 일치한다.',
    observed_at: '2026-08-12T00:30:00.000Z'
  });
  const { root, filePath } = createFixture(t, issue);
  const before = fs.readFileSync(filePath, 'utf8');
  const result = runLinkWork(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /종료된 이슈에는 연결 작업 진행을 기록할 수 없습니다/);
  assert.equal(fs.readFileSync(filePath, 'utf8'), before);
});

test('the existing set_state operation still owns validated transitions', () => {
  const result = model.applyOperation(makeIssue(), {
    type: 'set_state',
    status: 'blocked',
    current_summary: '외부 승인을 기다린다.',
    next_action: '승인 결과를 확인한다.',
    blocker: '승인이 없다.',
    unblock_condition: '승인이 기록된다.',
    updated_at: '2026-08-12T01:00:00.000Z'
  });

  assert.equal(result.issue.state.status, 'blocked');
  assert.equal(result.issue.state.blocker, '승인이 없다.');
  assert.deepEqual(result.issue.events.map(({ from, to }) => ({ from, to })), [
    { from: 'open', to: 'blocked' }
  ]);
});
