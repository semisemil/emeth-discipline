'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const writer = path.resolve(__dirname, '../writers/document-writer.js');
const directory = '.emeth/designs/DESIGN-0001-notification';
const overview = '# 알림 설계\r\n\r\n[접수](contracts/request.md)와 [전달](delivery.md).\r\n\r\n'
  + '운영 조건\r\n---------\r\n\r\n저장 완료 후 전달한다.\r\n\r\n### 재시도\r\n\r\n실패 시 재시도한다.\r\n\r\n'
  + '## 완료 조건\r\n\r\n전달 결과를 기록한다.\r\n';
const section = '## 접수 ###\r\n\r\n요청 ID를 반환한다.\r\n\r\n### 오류\r\n\r\n오류 사유를 기록한다.\r\n\r\n'
  + '````markdown\r\n## 접수\r\n```\r\n## 가짜 종료\r\n````\r\n\r\n'
  + '~~~\r\n## 접수\r\n~~~\r\n\r\n    ## 접수\r\n\r\n'
  + '<!--\r\n## 접수\r\n-->\r\n\r\n<pre>\r\n## 접수\r\n</pre>\r\n\r\n';
const request = '# 접수 계약\r\n\r\n' + section + '## 전달\r\n\r\n수신자에게 전달한다.\r\n';
const delivery = '# 전달\n\n결과를 기록한다.\n';

function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-document-read-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const project = path.join(temporary, 'project');
  fs.mkdirSync(project);
  const env = { ...process.env, APPDATA: path.join(temporary, 'config'), XDG_CONFIG_HOME: path.join(temporary, 'config') };
  function run(command, extra = [], input) {
    const args = [writer, command, '--project-root', project, '--id', 'DESIGN-0001', ...extra];
    if (command !== 'read') args.push('--memory', 'off');
    const result = spawnSync(process.execPath, args, { env, input: input === undefined ? undefined : JSON.stringify(input), encoding: 'utf8', windowsHide: true });
    return { ...result, value: JSON.parse(result.status === 0 ? result.stdout : result.stderr) };
  }
  const create = run('create', ['--title', '알림 설계', '--slug', 'notification', '--status', 'ready', '--input-format', 'documents'], {
    body: overview, documents: [{ path: 'contracts/request.md', body: request }, { path: 'delivery.md', body: delivery }],
  });
  assert.equal(create.status, 0, create.stderr);
  const file = name => path.join(project, directory, name);
  return { project, env, run, create, file };
}

test('full reads retain the complete response while document reads return only the selected source', t => {
  const f = fixture(t);
  const source = fs.readFileSync(f.file('DESIGN.md'), 'utf8');
  const full = f.run('read');
  assert.equal(full.status, 0, full.stderr);
  assert.deepEqual(full.value, {
    id: 'DESIGN-0001', path: `${directory}/DESIGN.md`, text: source,
    documents: [{ path: `${directory}/contracts/request.md`, body: request }, { path: `${directory}/delivery.md`, body: delivery }],
  });
  for (const [name, text] of [['DESIGN.md', source], ['contracts/request.md', request]]) {
    const selected = f.run('read', ['--document', name]);
    assert.equal(selected.status, 0, selected.stderr);
    assert.deepEqual(selected.value, { id: 'DESIGN-0001', path: `${directory}/${name}`, text });
  }
});

test('section reads preserve the heading, child sections, code examples, and original line endings', t => {
  const f = fixture(t);
  const result = f.run('read', ['--document', 'contracts/request.md', '--section', '접수']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.value, { id: 'DESIGN-0001', path: `${directory}/contracts/request.md`, text: section });
  const last = f.run('read', ['--document', 'contracts/request.md', '--section', '전달']);
  assert.equal(last.status, 0, last.stderr);
  assert.equal(last.value.text, '## 전달\r\n\r\n수신자에게 전달한다.\r\n');
});

test('section selection defaults to the overview and supports Setext headings', t => {
  const f = fixture(t);
  const result = f.run('read', ['--section', '운영 조건']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.value, {
    id: 'DESIGN-0001', path: `${directory}/DESIGN.md`,
    text: '운영 조건\r\n---------\r\n\r\n저장 완료 후 전달한다.\r\n\r\n### 재시도\r\n\r\n실패 시 재시도한다.\r\n\r\n',
  });
  const child = f.run('read', ['--section', '재시도']);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.value.text, '### 재시도\r\n\r\n실패 시 재시도한다.\r\n\r\n');
});

test('overview section reads distinguish body separators from metadata delimiters', t => {
  const f = fixture(t);
  const selected = '## 경계\r\n\r\n조건을 지킨다.\r\n\r\n---\r\n\r\n';
  const body = '---\r\n\r\n' + selected + '## 다음\r\n\r\n[접수](contracts/request.md)와 [전달](delivery.md).\r\n';
  const patched = f.run('patch', ['--change-kind', 'major'], { edits: [{ old: overview, new: body }] });
  assert.equal(patched.status, 0, patched.stderr);
  const result = f.run('read', ['--section', '경계']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.value.text, selected);
});

test('missing or ambiguous headings and nonmember paths fail without modifying saved documents', t => {
  const f = fixture(t);
  fs.appendFileSync(f.file('delivery.md'), '\n## 중복\n\n첫 번째.\n\n## 중복\n\n두 번째.\n');
  fs.writeFileSync(f.file('notes.md'), '# 개인 메모\n');
  const before = new Map(['DESIGN.md', 'contracts/request.md', 'delivery.md'].map(name => [name, {
    bytes: fs.readFileSync(f.file(name)), mtime: fs.statSync(f.file(name)).mtimeMs,
  }]));
  for (const [args, code] of [
    [['--section', '없는 절'], 'document-section-not-found'],
    [['--document', 'delivery.md', '--section', '중복'], 'document-section-ambiguous'],
    [['--document', 'notes.md'], 'contract-unavailable'],
    [['--document', '../outside.md'], 'design-document-path-invalid'],
    [['--section', '   '], 'invalid-argument'],
  ]) {
    const result = f.run('read', args);
    assert.equal(result.status, 1, result.stdout);
    assert.equal(result.value.error.code, code, result.stderr);
  }
  for (const [name, original] of before) {
    assert.deepEqual(fs.readFileSync(f.file(name)), original.bytes);
    assert.equal(fs.statSync(f.file(name)).mtimeMs, original.mtime);
  }
  assert.equal(fs.existsSync(f.file('revisions')), false);
});

test('partial reads retain validation of unselected members and pending document-set publication', t => {
  const f = fixture(t);
  fs.unlinkSync(f.file('delivery.md'));
  const missing = f.run('read', ['--document', 'contracts/request.md', '--section', '접수']);
  assert.equal(missing.status, 1);
  assert.equal(missing.value.error.code, 'record-unavailable');
  fs.writeFileSync(f.file('delivery.md'), delivery);
  fs.writeFileSync(f.file('.design-set-pending.json'), '{}');
  const pending = f.run('read', ['--document', 'DESIGN.md']);
  assert.equal(pending.status, 1);
  assert.equal(pending.value.error.code, 'design-document-set-pending');
});

test('compact CLI save results retain revision, snapshots, registration, and document status', t => {
  const f = fixture(t);
  assert.deepEqual(f.create.value, {
    schema_version: 1,
    write: { status: 'created', kind: 'design', id: 'DESIGN-0001', path: `${directory}/DESIGN.md`, revision: 1, snapshot: null },
    registration: { status: 'registered' }, memory: { status: 'disabled' },
  });
  const original = fs.readFileSync(f.file('contracts/request.md'));
  const patch = f.run('patch', ['--change-kind', 'major'], { documents: [{ path: 'contracts/request.md', edits: [{ old: '요청 ID', new: '접수 ID' }] }] });
  assert.equal(patch.status, 0, patch.stderr);
  assert.equal(patch.value.write.revision, 2);
  assert.deepEqual(patch.value.write.snapshot, { status: 'created', path: `${directory}/revisions/REV-1/DESIGN.md` });
  assert.deepEqual(patch.value.registration, { status: 'no-op' });
  assert.deepEqual(fs.readFileSync(f.file('revisions/REV-1/contracts/request.md')), original);
  const status = f.run('status', ['--status', 'completed']);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(status.value.document_status, 'completed');
  assert.equal(status.value.write.revision, 2);
  assert.equal(status.value.write.snapshot, null);
  const noOp = f.run('status', ['--status', 'completed']);
  assert.equal(noOp.status, 0, noOp.stderr);
  assert.equal(noOp.value.write.status, 'no-op');
  assert.equal(noOp.value.registration, null);
  const metadata = JSON.parse(fs.readFileSync(f.file('DESIGN.md'), 'utf8').split('---')[1]);
  assert.equal(metadata.title, '알림 설계');
  assert.deepEqual(metadata.documents, ['contracts/request.md', 'delivery.md']);
  assert.equal(metadata.status, 'completed');
});
