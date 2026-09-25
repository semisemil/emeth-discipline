'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const A = require('../skills/architecture-memory/scripts/author.js');
const R = require('../skills/architecture-memory/scripts/record.js');
const W = require('../skills/architecture-memory/scripts/workflow.js');
const M = require('../skills/architecture-memory/scripts/memory.js');
const S = require('../skills/architecture-memory/scripts/storage.js');

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-author-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'app.js'), 'console.log("app");\n');
  const run = (command, input, extra = {}) => A.run(root, command, input, { ...options, ...extra });
  const begin = W.begin(root, 'init', { language: 'ko', ...options });
  const read = (id) => run('read', { ids: [id] }).documents.flatMap(doc => doc.sections).find(section => section.id === id);
  const add = (document, title, body) => run('section', { document, title, body, confidence: 'confirmed', lifecycle: 'current' }).ids[0];
  const manifest = () => JSON.parse(fs.readFileSync(path.join(root, 'docs/architecture', W.MANIFEST), 'utf8'));
  const live = file => fs.readFileSync(path.join(root, 'docs/architecture', file), 'utf8');
  function baseline() {
    run('scaffold');
    add('system-context', '목적', '오프라인 현장 접수.');
    add('containers', '실행 단위', '| ID | 책임 |\n|---|---|\n| CNT-1 | 접수 저장 |\n| CNT-2 | 동기화 |');
    const context = add('context', '저장 조건', '망 점검 중에도 접수를 보존한다.');
    W.apply(root);
    return context;
  }
  return { root, run, begin, read, add, manifest, live, baseline };
}
function choice(f, current, overrides = {}) {
  return { title: '로컬 저장', status: 'accepted', date: 'unknown', body: '### 결정\n로컬 저장을 사용한다.\n\n### 근거\n망 점검 중 접수를 유지한다.',
    current: { id: current, expected: f.read(current).receipt, body: '접수 기록은 로컬에 보존한다.', confidence: 'confirmed', lifecycle: 'planned' }, ...overrides };
}

test('scaffold creates registered base files only in the draft, preserves edits and does not claim a completed baseline', t => {
  const f = fixture(t);
  assert.equal(f.run('scaffold').target, 'draft');
  for (const [, , file] of W.BASE) assert.ok(fs.existsSync(path.join(f.begin.draft, file)));
  assert.equal(fs.existsSync(path.join(f.root, S.BINDING)), false);
  assert.throws(() => W.apply(f.root), { code: 'memory-baseline-incomplete' });
  const id = f.add('context', '운영', '사용자가 제공한 조건.');
  const before = fs.readFileSync(path.join(f.begin.draft, '04-context.md'), 'utf8');
  assert.equal(f.run('scaffold').status, 'no-op');
  assert.equal(fs.readFileSync(path.join(f.begin.draft, '04-context.md'), 'utf8'), before);
  assert.equal(f.read(id).confidence, 'confirmed');
});

test('section creation and revision share live/draft contracts, preserve metadata and reject stale receipts', t => {
  const f = fixture(t);
  const id = f.baseline();
  const checkpoint = f.manifest().git_checkpoint;
  const first = f.read(id);
  const input = { document: 'context', id, expected: first.receipt, body: '새 조건.', confidence: 'proposed', lifecycle: 'planned' };
  assert.equal(f.run('section', input).target, 'live');
  assert.equal(f.read(id).confidence, 'proposed');
  assert.deepEqual(f.manifest().git_checkpoint, checkpoint);
  assert.throws(() => f.run('section', input), { code: 'memory-record-changed' });
  assert.throws(() => f.run('section', { document: 'context', title: '잘못된 링크', body: '조건', confidence: 'confirmed', lifecycle: 'current', links: ['AM-missing'] }), { code: 'memory-link-missing' });
  assert.equal(f.read(id).text.includes('새 조건.'), true);
});

test('component creation adds its file, registration and both indexes, preserving unrelated content', t => {
  const f = fixture(t);
  f.baseline();
  const context = f.live('04-context.md');
  const first = f.run('component', { title: '접수 저장소', container: 'CNT-1', reason: '저장 책임 분리', sections: [
    { title: '책임', body: '접수 기록 저장.', confidence: 'confirmed', lifecycle: 'planned' },
  ] });
  const second = f.run('component', { title: '동기화', container: 'CNT-2', reason: '연결 복구 시 전송' });
  const components = f.manifest().documents.filter(doc => doc.kind === 'component');
  assert.equal(components.length, 2);
  assert.equal(f.manifest().documents.filter(doc => doc.kind === 'component-index').length, 1);
  for (const doc of components) assert.ok(f.live('components/README.md').includes(path.posix.basename(doc.path)));
  assert.equal((f.live('README.md').match(/components\/README.md/g) || []).length, 1);
  assert.equal(f.live('04-context.md'), context);
  assert.notEqual(first.documents[0].id, second.documents[0].id);
  assert.match(f.live('components/README.md'), /CNT-1: 저장 책임 분리/);
  assert.throws(() => f.run('component', { title: '중복', container: 'CNT-1', reason: '중복 생성' }), { code: 'memory-author-invalid' });
  assert.throws(() => f.run('component', { title: '오류', container: 'CNT-999', reason: '없음' }), { code: 'memory-author-invalid' });
});

test('accepted ADR creation and supersession keep historical bodies and update current effects and indexes together', t => {
  const f = fixture(t);
  const current = f.baseline();
  const one = f.run('decision', choice(f, current));
  const old = one.documents.find(doc => doc.kind === 'decision');
  assert.equal(old.id, 'ADR-0001');
  const oldSections = M.sections(f.live(old.path)).sections;
  assert.ok(f.live('04-context.md').includes('(decisions/ADR-0001.md)'));
  const two = f.run('decision', choice(f, current, { title: '영속 큐', supersedes: old.id }));
  const next = two.documents.find(doc => doc.kind === 'decision');
  assert.equal(next.id, 'ADR-0002');
  assert.deepEqual(M.sections(f.live(old.path)).sections.map(x => x.text), oldSections.map(x => x.text));
  assert.match(f.live(old.path), /Status: superseded/);
  assert.match(f.live(old.path), /Superseded by: ADR-0002/);
  assert.match(f.live(next.path), /Supersedes: ADR-0001/);
  assert.match(f.live('decisions/README.md'), /ADR-0001.*superseded/);
  assert.match(f.live('decisions/README.md'), /ADR-0002.*accepted/);
  assert.ok(f.live('04-context.md').includes('(decisions/ADR-0002.md)'));
  const before = f.live('decisions/README.md');
  assert.throws(() => f.run('decision', choice(f, current, { title: '중복 대체', supersedes: old.id })), { code: 'memory-author-invalid' });
  assert.equal(f.live('decisions/README.md'), before);
});

test('new documents and decisions work before publication in custom roots', t => {
  const f = fixture(t, { root: 'docs/custom-memory' });
  f.run('scaffold');
  const current = f.add('context', '보관', '원본 보존.');
  const made = f.run('document', { kind: 'context', title: '현장 조건', sections: [
    { title: '연결', body: '간헐적 연결.', confidence: 'confirmed', lifecycle: 'current' },
  ] });
  const adr = f.run('decision', choice(f, current, { status: 'proposed' }));
  assert.equal(adr.target, 'draft');
  assert.equal(made.target, 'draft');
  assert.equal(fs.existsSync(path.join(f.root, 'docs/architecture/decisions/ADR-0001.md')), false);
  assert.ok(fs.existsSync(path.join(f.begin.draft, made.documents[0].path)));
  assert.equal(f.read(adr.ids[0]).confidence, 'proposed');
});

test('all authoring operations target the Git update draft until apply publishes the reconciled result', t => {
  const f = fixture(t);
  const current = f.baseline();
  for (const args of [['init', '-q'], ['config', 'user.email', 'test@example.invalid'], ['config', 'user.name', 'Test'], ['add', 'app.js'], ['commit', '-qm', 'source']]) {
    const result = spawnSync('git', args, { cwd: f.root, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
  }
  const begun = W.begin(f.root, 'update');
  const before = f.live('04-context.md');
  const component = f.run('component', { title: '저장소', container: 'CNT-1', reason: '영속성', sections: [
    { title: '책임', body: '보존.', confidence: 'confirmed', lifecycle: 'planned' },
  ] });
  assert.equal(component.target, 'draft');
  const first = f.run('decision', choice(f, current));
  const second = f.run('decision', choice(f, current, { title: '두 번째 선택', supersedes: first.documents[0].id }));
  const extra = f.run('document', { kind: 'context', title: '추가 조건', sections: [
    { title: '환경', body: '현장.', confidence: 'confirmed', lifecycle: 'current' },
  ] });
  assert.equal(f.live('04-context.md'), before);
  assert.equal(fs.existsSync(path.join(f.root, 'docs/architecture', component.documents[0].path)), false);
  W.classify(f.root, { path: 'app.js', effect: 'architecture', reason: 'Record authored boundaries.' });
  W.apply(f.root);
  assert.equal(f.live(component.documents[0].path), fs.readFileSync(path.join(begun.draft, component.documents[0].path), 'utf8'));
  assert.match(f.live(second.documents[0].path), /Supersedes: ADR-0001/);
  assert.match(f.live(extra.documents[0].path), /현장/);
  assert.notEqual(f.manifest().git_checkpoint.revision, null);
});

test('legacy index rows and unrouted current sections gain routing without losing unrelated text', t => {
  const f = fixture(t);
  const current = f.baseline();
  const first = f.run('decision', choice(f, current));
  const indexPath = path.join(f.root, 'docs/architecture/decisions/README.md');
  fs.writeFileSync(indexPath, '# Decisions\n\n## Choices\n\n| ADR | Status | Note |\n|---|---|---|\n| [ADR-0001](ADR-0001.md) | accepted | Keep this note |\n');
  f.run('decision', choice(f, current, { title: '다음 선택', supersedes: first.documents[0].id }));
  assert.match(f.live('decisions/README.md'), /\[ADR-0001\]\(ADR-0001.md\) \| superseded \| Keep this note/);
  assert.equal((f.live('decisions/README.md').match(/\]\(ADR-0001.md\)/g) || []).length, 1);
  fs.appendFileSync(path.join(f.root, 'docs/architecture/04-context.md'), '\n## Legacy\nOld statement.\n');
  const legacy = M.loadRecords(f.root).records.find(record => record.title === 'Legacy');
  const updated = f.run('section', { document: 'context', id: legacy.id, expected: M.receiptFor(legacy), body: 'Current statement.', confidence: 'confirmed', lifecycle: 'current' });
  assert.notEqual(updated.ids[0], legacy.id);
  assert.match(f.read(updated.ids[0]).text, /Current statement/);
});

test('accepted ADR sections cannot be changed through the authoring section command', t => {
  const f = fixture(t);
  const current = f.baseline();
  const adr = f.run('decision', choice(f, current));
  const record = f.read(adr.ids[0]);
  assert.throws(() => f.run('section', { document: adr.documents[0].id, id: record.id, expected: record.receipt,
    body: 'Rewrite history.', confidence: 'confirmed', lifecycle: 'historical' }), { code: 'memory-author-invalid' });
  assert.throws(() => f.run('section', { document: adr.documents[0].id, title: 'Added history',
    body: 'New historical claim.', confidence: 'confirmed', lifecycle: 'historical' }), { code: 'memory-author-invalid' });
  assert.equal(f.read(record.id).text, record.text);
});

for (const target of ['draft', 'live']) test(`interrupted ${target} publication resumes the same allocation and preserves conflicts`, t => {
  const f = fixture(t);
  if (target === 'live') f.baseline(); else f.run('scaffold');
  const directory = target === 'draft' ? f.begin.draft : path.join(f.root, 'docs/architecture');
  const originalWrite = S.atomicWrite;
  let written;
  S.atomicWrite = (file, text) => {
    originalWrite(file, text);
    if (file.endsWith('.md') && !written) { written = file; throw new Error('Interrupted authoring'); }
  };
  try {
    assert.throws(() => f.run('document', { kind: 'context', title: '복구 대상' }), /Interrupted authoring/);
  } finally { S.atomicWrite = originalWrite; }
  const saved = fs.readFileSync(written, 'utf8');
  fs.appendFileSync(written, '\nExternal edit.\n');
  assert.throws(() => f.run('recover'), { code: 'memory-target-changed' });
  assert.match(fs.readFileSync(written, 'utf8'), /External edit/);
  if (target === 'draft') assert.throws(() => W.apply(f.root), { code: 'memory-record-pending' });
  fs.writeFileSync(written, saved);
  assert.equal(f.run('recover').status, 'resumed');
  assert.equal(f.run('recover').status, 'no-op');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, W.MANIFEST), 'utf8'));
  assert.equal(manifest.documents.filter(doc => doc.path === path.relative(directory, written).split(path.sep).join('/')).length, 1);
});

test('unregistered files, disabled memory and unfinished publication are preserved', t => {
  const f = fixture(t);
  const current = f.baseline();
  fs.writeFileSync(path.join(f.root, 'docs/architecture/decisions/ADR-0042.md'), 'User file.');
  const made = f.run('decision', choice(f, current));
  assert.equal(made.documents[0].id, 'ADR-0043');
  assert.equal(f.live('decisions/ADR-0042.md'), 'User file.');
  const binding = path.join(f.root, S.BINDING);
  const before = fs.readFileSync(binding, 'utf8');
  fs.writeFileSync(binding, JSON.stringify({ ...JSON.parse(before), enabled: false }));
  assert.throws(() => f.run('scaffold'), { code: 'memory-disabled' });
  fs.writeFileSync(binding, before);
  const journal = path.join(f.root, 'docs/architecture', S.WORK, 'record.json');
  fs.writeFileSync(journal, JSON.stringify({ entries: [] }));
  assert.throws(() => f.run('scaffold'), { code: 'memory-record-pending' });
  assert.equal(f.run('recover').status, 'resumed');
});

test('CLI accepts UTF-8 structured content and returns parseable errors', t => {
  const f = fixture(t);
  f.run('scaffold');
  const cli = path.resolve(__dirname, '../skills/architecture-memory/scripts/author.js');
  const result = spawnSync(process.execPath, [cli, 'section', '--project-root', f.root], { encoding: 'utf8', windowsHide: true,
    input: JSON.stringify({ document: 'context', title: '한글', body: '본문 **유지**.', confidence: 'confirmed', lifecycle: 'planned' }) });
  assert.equal(result.status, 0, result.stderr);
  assert.match(f.read(JSON.parse(result.stdout).ids[0]).text, /본문 \*\*유지\*\*/);
  const invalid = spawnSync(process.execPath, [cli, 'section', '--project-root', f.root], { encoding: 'utf8', windowsHide: true, input: '{}' });
  assert.equal(invalid.status, 1);
  assert.ok(JSON.parse(invalid.stderr).error.code);
});
