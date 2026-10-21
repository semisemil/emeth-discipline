'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const model = require('../plugins/emeth-discipline/skills/issue-ledger/lib/issue-model.js');

function makeIssue() {
  return {
    schema_version: 2,
    identity: {
      id: 'PL-0001', aliases: [], type: 'task', mode: 'simple', title: 'canonical 모델', risk: 'medium'
    },
    origin: { kind: 'test', summary: 'canonical 회귀', refs: [] },
    state: { status: 'open', current_summary: '열림', next_action: '검증한다' },
    objective: { summary: 'Issue v2 동작 보존', constraints: [] },
    criteria: [{ id: 'C1', text: '갱신된다', evidence_refs: [] }],
    relations: [], context: [], artifacts: [], evidence: [], events: [],
    created_at: '2026-08-17T00:00:00.000Z',
    updated_at: '2026-08-17T00:00:00.000Z'
  };
}

test('canonical model preserves v2 parse, serialize, and mutation behavior', () => {
  const issue = makeIssue();
  const parsed = model.parseIssueContent(model.serializeIssue(issue), 'PL-0001.json');
  assert.equal(parsed.schemaVersion, 2);
  assert.equal(parsed.id, 'PL-0001');
  assert.equal(parsed.currentSummary, '열림');

  const result = model.applyOperation(issue, {
    type: 'set_state',
    status: 'doing',
    current_summary: '진행 중',
    next_action: '완료한다',
    updated_at: '2026-08-17T01:00:00.000Z'
  });
  assert.equal(result.issue.state.status, 'doing');
  assert.equal(result.issue.state.current_summary, '진행 중');
  assert.equal(result.issue.events[0].kind, 'transition');
});

test('canonical model preserves legacy Markdown reading', () => {
  const legacy = `---\n${JSON.stringify({
    id: 'PL-0042',
    status: 'in_progress',
    title: '레거시 이슈',
    type: 'bug',
    evidence: [],
    risk: 'high',
    description: '기존 동작',
    suggested_next_step: '계속 검증',
    created_at: '2026-08-16T00:00:00.000Z',
    updated_at: '2026-08-17T00:00:00.000Z'
  }, null, 2)}\n---\n## 설명\n기존 동작\n`;
  const parsed = model.parseIssueContent(legacy, 'PL-0042.md');
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.status, 'doing');
  assert.equal(parsed.currentSummary, '기존 동작');
  assert.equal(parsed.nextAction, '계속 검증');
  assert.deepEqual(parsed.validation.warnings, ['레거시 Markdown 이슈입니다.']);
});
