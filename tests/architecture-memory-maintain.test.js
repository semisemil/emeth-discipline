'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const A = require('../plugins/emeth-discipline/skills/architecture-memory/scripts/author.js');
const M = require('../plugins/emeth-discipline/skills/architecture-memory/scripts/memory.js');
const R = require('../plugins/emeth-discipline/skills/architecture-memory/scripts/record.js');
const W = require('../plugins/emeth-discipline/skills/architecture-memory/scripts/workflow.js');
const scripts = path.resolve(__dirname, '../plugins/emeth-discipline/skills/architecture-memory/scripts');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-maintain-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  R.ensureMemory(root, { language: 'ko' });
  const directory = path.join(root, 'docs/architecture');
  const run = (command, input) => A.run(root, command, input);
  function cli(file, command, input, flags = []) {
    const result = spawnSync(process.execPath, [path.join(scripts, file), command, '--project-root', root, ...flags], {
      input: input === undefined ? undefined : JSON.stringify(input), encoding: 'utf8', windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }
  const load = () => M.loadRecords(root);
  const read = id => run('read', { ids: [id] }).documents.flatMap(doc => doc.sections).find(section => section.id === id);
  const add = (title, body, fields = {}) => run('section', { document: 'context', title, body,
    confidence: 'confirmed', lifecycle: 'current', ...fields }).ids[0];
  function snapshot() {
    const manifestText = fs.readFileSync(path.join(directory, W.MANIFEST), 'utf8');
    const manifest = JSON.parse(manifestText);
    return [manifestText, ...manifest.documents.map(doc => fs.readFileSync(path.join(directory, doc.path), 'utf8'))];
  }
  function query(question) {
    const found = cli('memory.js', 'search', undefined, ['--query', question, '--limit', '1']);
    assert.equal(found.matches.length, 1, question);
    const page = cli('memory.js', 'read', undefined,
      ['--id', found.matches[0].id, '--revision', found.revision, '--max-chars', '6000']);
    assert.equal(page.complete, true);
    const texts = page.documents.flatMap(doc => [doc.intro, ...doc.sections.map(section => section.text)]);
    return { id: found.matches[0].id, text: texts.join('\n'), chars: texts.reduce((size, text) => size + text.length, 0) };
  }
  return { directory, run, cli, load, read, add, snapshot, query };
}

test('real CLI reads preserve conditions and prerequisites after splitting a document', t => {
  const f = fixture(t);
  const scope = f.add('현장 범위', '공장 단말에만 적용한다.');
  f.add('고객 데이터 경계', '고객별 접수 데이터는 분리한다.', { always: true });
  const offline = '망 점검 중에도 접수를 계속한다. 안전 인터록이 작동하면 중단한다. 근거: 현장 운영 규정.';
  const sync = '연결 복구 후 같은 접수 ID로 재전송한다. 서버 확인 전에는 로컬 기록을 삭제하지 않는다. 근거: 전송 규정.';
  const bundle = f.add('오프라인 접수와 복구 재전송', offline + '\n\n' + sync,
    { paths: ['src/terminal', 'src/sync'], terms: ['오프라인', '재전송'], links: [scope] });
  const transfer = f.run('document', { kind: 'context', title: '전송 운영' }).documents[0].id;
  const questions = ['오프라인', '재전송'];
  const before = questions.map(question => f.query(question));
  for (const answer of before) {
    assert.ok(answer.text.includes(offline));
    assert.ok(answer.text.includes(sync));
  }
  const manifest = f.snapshot()[0];
  const outcome = f.cli('author.js', 'reorganize', { revision: f.load().revision, sections: [
    { document: 'context', id: bundle, expected: f.read(bundle).receipt, title: '오프라인 접수',
      body: offline, paths: ['src/terminal'], terms: ['오프라인'], links: [scope] },
    { document: transfer, ref: 'sync', title: '복구 재전송', body: sync,
      confidence: 'confirmed', lifecycle: 'current', paths: ['src/sync'], terms: ['재전송'], links: [scope] },
  ] });
  const after = questions.map(question => f.query(question));
  assert.equal(after[0].id, bundle);
  assert.equal(after[1].id, outcome.refs.sync);
  for (const [index, selected, other] of [[0, offline, sync], [1, sync, offline]]) {
    assert.ok(after[index].text.includes(selected));
    assert.ok(!after[index].text.includes(other));
    assert.match(after[index].text, /공장 단말에만/);
    assert.match(after[index].text, /고객별 접수 데이터는 분리/);
    assert.ok(after[index].chars < before[index].chars);
  }
  assert.equal(f.snapshot()[0], manifest);
  assert.equal(f.cli('memory.js', 'check').valid, true);
  const found = f.cli('memory.js', 'search', undefined, ['--path', 'src/sync/main.js']);
  assert.equal(found.matches[0].id, outcome.refs.sync);
});

test('consolidation rejects missed incoming prerequisites, preserves old direct reads and removes the duplicate from default search', t => {
  const f = fixture(t);
  const canonical = f.add('정전 보관 원칙', '정전 후에도 접수 기록을 보존한다. 근거: 현장 운영 규정.', { terms: ['정전'] });
  const duplicate = f.add('정전 보관의 반복 설명', '정전 후에도 접수 기록을 보존한다. 근거: 현장 운영 규정.', { terms: ['정전'] });
  const caller = f.add('단말 운영', '정전 보관 원칙에 따라 현장 접수를 보존한다.', { links: [duplicate] });
  const before = f.snapshot();
  const redirect = { id: duplicate, expected: f.read(duplicate).receipt, to: [canonical] };
  assert.throws(() => f.run('reorganize', { revision: f.load().revision, redirects: [redirect] }), /Update required links/);
  assert.deepEqual(f.snapshot(), before);
  f.cli('author.js', 'reorganize', { revision: f.load().revision,
    sections: [{ document: 'context', id: caller, expected: f.read(caller).receipt,
      body: '정전 보관 원칙에 따라 현장 접수를 보존한다.', links: [canonical] }], redirects: [redirect] });
  const found = f.cli('memory.js', 'search', undefined, ['--query', '정전', '--limit', '50']);
  assert.ok(found.matches.some(item => item.id === canonical));
  assert.ok(!found.matches.some(item => item.id === duplicate));
  assert.equal(f.read(duplicate).lifecycle, 'historical');
  const old = f.cli('memory.js', 'read', undefined, ['--id', duplicate]);
  assert.match(JSON.stringify(old), /정전 후에도 접수 기록을 보존/);
  assert.equal(f.read(caller).text.includes(duplicate), false);
});

test('shortening preserves unresolved differences, status, source preamble and document verification fields', t => {
  const f = fixture(t);
  const id = f.add('전송 계획의 미확인 차이', '운영팀은 30일 보관을 요청했다. 운영팀의 요청은 30일 보관이다.\n'
    + '보안팀은 7일 보관을 요청했다. 두 요청의 차이는 미해결이다.\n근거: 운영팀과 보안팀 회의 기록.',
    { confidence: 'unknown', lifecycle: 'planned', terms: ['보관 요청'] });
  const manifestPath = path.join(f.directory, W.MANIFEST);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.git_checkpoint = { revision: 'a'.repeat(40), branch_at_check: 'main', checked_at: '2026-10-01T00:00:00.000Z' };
  manifest.documents[0].verified_at = '2026-10-01T00:00:00.000Z';
  manifest.documents[0].source_revision = 'a'.repeat(40);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const before = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const input = { revision: f.load().revision, sections: [{ document: 'context', id, expected: f.read(id).receipt,
    body: '운영팀은 30일, 보안팀은 7일 보관을 요청했다. 차이는 미해결이다.\n근거: 운영팀과 보안팀 회의 기록.' }],
    introductions: [{ document: 'context', body: '# 프로젝트 맥락\n\n기록한 주제만 포함한다. 코드베이스 전체를 분석한 상태는 아니다.' }] };
  f.cli('author.js', 'reorganize', input);
  const answer = f.query('보관 요청');
  for (const expected of [/운영팀은 30일/, /보안팀은 7일/, /미해결/, /회의 기록/, /unknown\/planned/, /코드베이스 전체를 분석한 상태는 아니다/]) assert.match(answer.text, expected);
  assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), before);
  const saved = f.snapshot();
  assert.throws(() => f.run('reorganize', { revision: f.load().revision, sections: [{ ...input.sections[0], expected: f.read(id).receipt,
    confidence: 'confirmed', lifecycle: 'current' }] }), /preserves existing confidence/);
  assert.deepEqual(f.snapshot(), saved);
});

test('stale revisions, stale receipts and missing links reject an entire batch before publication; an empty batch is a no-op', t => {
  const f = fixture(t);
  const id = f.add('접수', '접수 원본을 보존한다.');
  const stale = f.load().revision;
  f.add('추가 조건', '접수의 출처를 보존한다.');
  const saved = f.snapshot();
  assert.throws(() => f.run('reorganize', { revision: stale, sections: [] }), { code: 'memory-changed' });
  assert.deepEqual(f.snapshot(), saved);
  const valid = { document: 'context', id, expected: f.read(id).receipt, body: '접수 원본을 보존한다.' };
  assert.throws(() => f.run('reorganize', { revision: f.load().revision, sections: [
    { document: 'context', ref: 'new', title: '새 절', body: '새 조건.', confidence: 'confirmed', lifecycle: 'current' },
    { ...valid, expected: 'stale' },
  ] }), { code: 'memory-record-changed' });
  assert.deepEqual(f.snapshot(), saved);
  assert.throws(() => f.run('reorganize', { revision: f.load().revision, sections: [{ ...valid, links: ['AM-absent'] }] }), { code: 'memory-link-missing' });
  assert.deepEqual(f.snapshot(), saved);
  assert.equal(f.cli('author.js', 'reorganize', { revision: f.load().revision }).status, 'no-op');
  assert.deepEqual(f.snapshot(), saved);
});

test('reorganization preserves accepted ADR bodies and introductions', t => {
  const f = fixture(t);
  const current = f.add('보관', '로컬 보관을 계획한다.', { lifecycle: 'planned' });
  const adr = f.run('decision', { title: '로컬 보관 결정', status: 'accepted', body: '망 점검 중에도 현장 기록을 보존하기 위해 로컬 보관을 선택했다.',
    current: { id: current, expected: f.read(current).receipt, body: '로컬 보관을 계획한다.', confidence: 'confirmed', lifecycle: 'planned' } });
  const decision = adr.documents.find(doc => doc.kind === 'decision');
  const record = f.load().records.find(item => item.kind === 'decision');
  const saved = f.snapshot();
  const attempts = [
    { sections: [{ document: decision.id, id: record.id, expected: f.read(record.id).receipt, body: '더 짧은 결정 이유.' }] },
    { introductions: [{ document: decision.id, body: '# 바뀐 결정\n\n- Status: accepted' }] },
    { redirects: [{ id: record.id, expected: f.read(record.id).receipt, to: [current] }] },
  ];
  for (const input of attempts) assert.throws(() => f.run('reorganize', { revision: f.load().revision, ...input }), /Preserve accepted ADR bodies/);
  assert.deepEqual(f.snapshot(), saved);
});
