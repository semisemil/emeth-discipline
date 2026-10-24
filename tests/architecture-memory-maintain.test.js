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
const S = require('../plugins/emeth-discipline/skills/architecture-memory/scripts/storage.js');
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

test('real CLI searches and partial reads preserve offline and synchronization answers after a cross-document split', t => {
  const f = fixture(t);
  const scope = f.add('저장 확정의 뜻', '저장 확정은 접수 ID와 본문을 디스크에 기록한 상태를 뜻한다.', { terms: ['저장 확정'] });
  f.add('고객 데이터 경계', '고객별 접수 데이터는 분리한다.', { always: true });
  const bundle = f.add('키오스크 오프라인 접수와 복구 재전송',
    '공장 접수 단말에만 적용한다.\n망 점검 중에도 접수를 계속한다.\n안전 인터록이 작동하면 접수를 중단한다.\n'
    + '완료 응답은 저장 확정 뒤에 보낸다.\n이유: 망 점검 중 현장 작업과 접수 기록을 보존해야 한다.\n근거: 사용자, 2026-09-05 현장 설명.\n\n'
    + '연결 복구 후 미전송 접수를 서버에 보낸다.\n같은 접수 ID를 재사용해서 중복 접수를 방지한다.\n서버 확인 전에는 로컬 기록을 삭제하지 않는다.\n'
    + '일시적인 전송 실패는 재시도한다.\n영구적인 거부는 운영자에게 표시한다.\n순서는 단말별 접수 시각을 따른다.\n'
    + '재전송 결과에는 서버 확인 시각과 접수 ID를 남긴다.\n전송 중 새 접수도 로컬 저장을 계속한다.\n'
    + '서버 점검 중에는 대기열을 유지한다.\n근거: 사용자, 2026-09-06 전송 설명.',
    { paths: ['src/terminal', 'src/sync'], terms: ['키오스크', '네트워크단절', '복구', '재전송'], links: [scope] });
  const transferDoc = f.run('document', { kind: 'context', title: '전송 운영' }).documents[0].id;
  const caller = f.add('복구 재전송 운영자 안내', '전송 상태는 담당 운영자에게 제공한다.', { document: transferDoc, links: [bundle] });
  const unrelated = f.add('사무실 보고서', '사무실 보고서는 다음 날 발행한다.');
  const questions = ['키오스크 오프라인 접수 조건', '네트워크단절', '복구 재전송 조건'];
  const before = questions.map(question => f.query(question));
  const offlineContract = text => {
    for (const expected of [/공장 접수 단말에만/, /망 점검 중에도 접수를 계속/, /안전 인터록.*접수를 중단/,
      /완료 응답.*저장 확정 뒤/, /접수 ID와 본문을 디스크에 기록/, /현장 작업과 접수 기록을 보존/, /2026-09-05/, /고객별 접수 데이터는 분리/]) {
      assert.match(text, expected);
    }
  };
  const syncContract = text => {
    for (const expected of [/공장 접수 단말에만/, /연결 복구 후 미전송 접수/, /접수 ID.*중복 접수를 방지/,
      /서버 확인 전.*삭제하지/, /영구적인 거부.*운영자/, /서버 점검 중.*대기열/, /2026-09-06/, /고객별 접수 데이터는 분리/]) assert.match(text, expected);
  };
  offlineContract(before[0].text); offlineContract(before[1].text); syncContract(before[2].text);
  const oldUnrelated = f.read(unrelated).text;
  const manifestBefore = JSON.parse(f.snapshot()[0]);
  const outcome = f.cli('author.js', 'reorganize', {
    revision: f.load().revision,
    sections: [
      { document: 'context', id: bundle, expected: f.read(bundle).receipt, title: '키오스크 오프라인 접수',
        body: '공장 접수 단말에만 적용한다.\n망 점검 중에도 접수를 계속한다.\n안전 인터록이 작동하면 접수를 중단한다.\n'
          + '완료 응답은 저장 확정 뒤에 보낸다.\n이유: 망 점검 중 현장 작업과 접수 기록을 보존해야 한다.\n근거: 사용자, 2026-09-05 현장 설명.',
        paths: ['src/terminal'], terms: ['키오스크', '네트워크단절'], links: [scope] },
      { document: transferDoc, ref: 'sync', title: '복구 재전송 조건', confidence: 'confirmed', lifecycle: 'current',
        body: '공장 접수 단말에만 적용한다.\n연결 복구 후 미전송 접수를 서버에 보낸다.\n같은 접수 ID를 재사용해서 중복 접수를 방지한다.\n'
          + '서버 확인 전에는 로컬 기록을 삭제하지 않는다.\n일시적인 전송 실패는 재시도한다.\n영구적인 거부는 운영자에게 표시한다.\n'
          + '순서는 단말별 접수 시각을 따른다.\n재전송 결과에는 서버 확인 시각과 접수 ID를 남긴다.\n전송 중 새 접수도 로컬 저장을 계속한다.\n'
          + '서버 점검 중에는 대기열을 유지한다.\n근거: 사용자, 2026-09-06 전송 설명.',
        paths: ['src/sync'], terms: ['복구', '재전송'] },
      { document: transferDoc, id: caller, expected: f.read(caller).receipt,
        body: '전송 상태는 담당 운영자에게 제공한다.', links: ['@sync'] },
    ],
  });
  const after = questions.map(question => f.query(question));
  offlineContract(after[0].text); offlineContract(after[1].text); syncContract(after[2].text);
  assert.equal(after[0].id, bundle);
  assert.equal(after[2].id, outcome.refs.sync);
  assert.doesNotMatch(after[0].text, /영구적인 거부|서버 확인 시각/);
  assert.doesNotMatch(after[2].text, /안전 인터록|디스크/);
  assert.ok(after.every((answer, index) => answer.chars < before[index].chars));
  assert.equal(f.read(unrelated).text, oldUnrelated);
  assert.deepEqual(JSON.parse(f.snapshot()[0]), manifestBefore);
  const checked = f.cli('memory.js', 'check');
  assert.equal(checked.valid, true);
  const byPath = f.cli('memory.js', 'search', undefined, ['--path', 'src/sync/main.js']);
  assert.equal(byPath.matches[0].id, outcome.refs.sync);
  const inspected = f.cli('memory.js', 'inspect', undefined, ['--id', bundle]);
  assert.equal(inspected.sections[0].read_chars, after[0].chars);
  t.diagnostic(JSON.stringify({ questions, before_chars: before.map(item => item.chars), after_chars: after.map(item => item.chars) }));
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

test('inspection is read-only, bounded and includes transitive, shared and cyclic prerequisites once', t => {
  const f = fixture(t);
  const base = f.add('공통 조건', '공장 단말만 포함한다.', { always: true });
  const power = f.add('전원', '정전 시에도 보관한다.');
  const terminal = f.add('단말', '접수를 계속한다.', { paths: ['src/terminal'], links: [power] });
  f.run('section', { document: 'context', id: power, expected: f.read(power).receipt,
    body: '정전 시에도 보관한다.', confidence: 'confirmed', lifecycle: 'current', links: [terminal] });
  for (let i = 0; i < 9; i++) f.add(`운영 주제 ${i}`, `운영 조건 ${i}.`);
  const before = f.snapshot();
  const report = f.cli('memory.js', 'inspect', undefined, ['--id', terminal]);
  const row = report.sections[0];
  assert.equal(row.document, 'context');
  assert.equal(row.required_count, 2);
  assert.deepEqual(row.required_by, [power]);
  const read = f.cli('memory.js', 'read', undefined, ['--id', terminal]);
  assert.deepEqual(new Set(read.documents.flatMap(doc => doc.sections.map(section => section.id))), new Set([base, power, terminal]));
  assert.equal(row.read_chars, read.documents.reduce((size, doc) => size + doc.intro.length
    + doc.sections.reduce((sum, section) => sum + section.text.length, 0), 0));
  const delivered = [];
  let offset = 0;
  do {
    const page = f.cli('memory.js', 'inspect', undefined, ['--offset', String(offset), '--revision', report.revision, '--max-chars', '1500']);
    assert.ok(JSON.stringify(page).length <= 1500);
    assert.ok(page.sections.length);
    delivered.push(...page.sections.map(item => item.id));
    offset = page.next_offset;
  } while (offset !== null);
  assert.equal(new Set(delivered).size, f.load().records.length);
  assert.equal(delivered.length, f.load().records.length);
  assert.equal(f.cli('memory.js', 'inspect', undefined, ['--path', 'src/terminal/main.js']).total, 1);
  assert.deepEqual(f.snapshot(), before);
  f.add('추가 조건', '새로운 운영 조건.');
  assert.throws(() => M.inspect(f.load(), { revision: report.revision }), { code: 'memory-changed' });
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

test('reorganization in an initialization draft becomes searchable only after its owning workflow applies', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-maintain-draft-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'app.js'), 'console.log("terminal");\n');
  W.begin(root, 'init', { language: 'ko' });
  A.run(root, 'scaffold');
  for (const document of ['system-context', 'containers', 'context']) A.run(root, 'section', {
    document, title: `${document} 역할`, body: '공장 단말의 현장 접수.', confidence: 'confirmed', lifecycle: 'current',
  });
  const initial = A.run(root, 'read', { ids: ['@global'] });
  const changed = A.run(root, 'reorganize', { revision: initial.revision, sections: [
    { document: 'context', ref: 'offline', title: '오프라인 접수', body: '망 점검 중에도 접수를 계속한다.', confidence: 'confirmed', lifecycle: 'current' },
  ] });
  assert.equal(changed.target, 'draft');
  assert.equal(fs.existsSync(path.join(root, '.emeth/architecture.json')), false);
  assert.match(JSON.stringify(A.run(root, 'read', { ids: [changed.refs.offline] })), /망 점검 중에도/);
  W.apply(root);
  const found = M.search(M.loadRecords(root), { query: '오프라인 접수' });
  assert.equal(found.matches[0].id, changed.refs.offline);
  assert.match(JSON.stringify(M.read(M.loadRecords(root), { ids: [found.matches[0].id], revision: found.revision })), /망 점검 중에도/);
});

test('interrupted reorganization recovers the edited body and new prerequisite without duplicating sections', t => {
  const f = fixture(t);
  const old = f.add('보관', '접수 기록을 보관한다.');
  const manifest = f.snapshot()[0];
  const atomicWrite = S.atomicWrite;
  let interrupted = false;
  S.atomicWrite = (file, text) => {
    atomicWrite(file, text);
    if (file.endsWith('.md') && !interrupted) { interrupted = true; throw new Error('Interrupted reorganization'); }
  };
  try {
    assert.throws(() => f.run('reorganize', { revision: f.load().revision, sections: [
      { document: 'context', id: old, expected: f.read(old).receipt, body: '접수 기록은 저장 조건을 따른다.', links: ['@storage'] },
      { document: 'context', ref: 'storage', title: '저장 조건', body: '정전 후에도 보관한다.', confidence: 'confirmed', lifecycle: 'current' },
    ] }), /Interrupted reorganization/);
  } finally { S.atomicWrite = atomicWrite; }
  assert.throws(f.load, { code: 'memory-record-pending' });
  assert.equal(f.run('recover').status, 'resumed');
  assert.equal(f.run('recover').status, 'no-op');
  assert.equal(f.snapshot()[0], manifest);
  const records = f.load();
  const storage = records.records.filter(item => item.title === '저장 조건');
  assert.equal(storage.length, 1);
  assert.deepEqual(records.byId.get(old).links, [storage[0].id]);
  assert.match(f.read(old).text, /접수 기록은 저장 조건을 따른다/);
  assert.match(f.read(storage[0].id).text, /정전 후에도 보관/);
});
