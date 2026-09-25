'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { getRegistryPath } = require('../dashboard/registry.js');
const cli = path.resolve(__dirname, '../writers/document-writer.js');

function fixture(t, { bom = false, newline = '\n' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-patch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, 'project');
  const file = path.join(project, '.emeth/designs/DESIGN-0001-test/DESIGN.md');
  const snapshot = path.join(path.dirname(file), 'revisions/REV-1.md');
  const metadata = { schema_version: 2, id: 'DESIGN-0001', title: '부분 수정', kind: 'feature', status: 'draft', revision: 1,
    supersedes: [], superseded_by: null, related_issues: [] };
  const original = Buffer.from((bom ? '\ufeff' : '') + ('---\n' + JSON.stringify(metadata, null, 2)
    + '\n---\n# 요구사항\n\n성공하면 ID를 반환한다.\n\n유지할 문장.  \n').replace(/\n/g, newline));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, original);
  const env = { ...process.env, APPDATA: path.join(root, 'config'), XDG_CONFIG_HOME: path.join(root, 'config') };
  const run = (command, input, extra = []) => {
    const result = spawnSync(process.execPath, [cli, command, '--project-root', project, '--id', 'DESIGN-0001', ...extra],
      { env, input: input === undefined ? undefined : typeof input === 'string' || Buffer.isBuffer(input) ? input : JSON.stringify(input),
        encoding: 'utf8', windowsHide: true, timeout: 10000 });
    return { ...result, value: JSON.parse(result.status === 0 ? result.stdout : result.stderr) };
  };
  const read = () => run('read').value;
  const patch = (edits, extra = ['--change-kind', 'major', '--memory', 'off']) =>
    run('patch', { edits }, extra);
  return { project, file, snapshot, original, env, run, read, patch };
}
const changes = [
  { old: '성공하면 ID를 반환한다.', new: '성공하면 접수 ID를 반환한다.' },
];

for (const options of [{}, { bom: true, newline: '\r\n' }]) {
  test(`read and patch preserve unrelated bytes (${JSON.stringify(options)})`, t => {
    const f = fixture(t, options);
    const read = f.read();
    assert.equal(Object.hasOwn(read, 'sha256'), false);
    assert.equal(read.text, f.original.toString('utf8').replace(/^\ufeff/, ''));
    assert.equal(fs.existsSync(getRegistryPath({ env: f.env })), false);
    assert.equal(fs.existsSync(path.join(f.project, 'docs')), false);
    const result = f.patch(changes);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.value.write.revision, 2);
    assert.equal(result.value.memory.status, 'disabled');
    assert.notEqual(result.value.registration.status, 'failed');
    assert.deepEqual(fs.readFileSync(f.snapshot), f.original);
    const expected = Buffer.from(f.original.toString('utf8').replace('"revision": 1', '"revision": 2')
      .replace('성공하면 ID를 반환한다.', '성공하면 접수 ID를 반환한다.'));
    assert.deepEqual(fs.readFileSync(f.file), expected);
    assert.equal(Object.hasOwn(result.value, 'sha256'), false);
    assert.equal(Object.hasOwn(result.value, 'text'), false);
  });
}

test('patch preserves intervening changes outside matched spans without requiring a hash', t => {
  const f = fixture(t);
  f.read();
  fs.appendFileSync(f.file, '\n다른 작성자의 변경\n');
  const current = fs.readFileSync(f.file);
  assert.equal(f.patch(changes).status, 0);
  assert.deepEqual(fs.readFileSync(f.snapshot), current);
  assert.ok(fs.readFileSync(f.file, 'utf8').endsWith('\n다른 작성자의 변경\n'));
  assert.equal(f.patch(changes).value.error.code, 'document-patch-match');
});

test('all edits are checked before saving; absent and ambiguous matches leave no partial changes', t => {
  const f = fixture(t);
  for (const old of ['missing text', '\n']) {
    const result = f.patch([changes[0], { old, new: 'replacement' }]);
    assert.equal(result.value.error.code, 'document-patch-match');
    assert.deepEqual(fs.readFileSync(f.file), f.original);
    assert.equal(fs.existsSync(f.snapshot), false);
  }
});

test('patch uses existing revision, identity, body and snapshot checks', t => {
  const f = fixture(t);
  for (const [edits, args, error] of [
    [[changes[0]], ['--change-kind', 'operational'], 'contract-revision-required'],
    [[{ old: '부분 수정', new: '다른 제목' }], ['--change-kind', 'operational'], 'document-identity-changed'],
    [[{ old: '"status": "draft"', new: '"status": "unknown"' }], ['--change-kind', 'operational'], 'record-metadata-invalid'],
    [[{ old: '"supersedes": []', new: '"supersedes": ["DESIGN-0099"]' }], ['--change-kind', 'operational'], 'contract-unavailable'],
  ]) {
    const result = f.patch(edits, [...args, '--memory', 'off']);
    assert.equal(result.value.error.code, error, result.stderr);
    assert.deepEqual(fs.readFileSync(f.file), f.original);
  }
  fs.mkdirSync(path.dirname(f.snapshot));
  fs.writeFileSync(f.snapshot, 'conflicting snapshot');
  assert.equal(f.patch(changes).value.error.code, 'snapshot-conflict');
  assert.deepEqual(fs.readFileSync(f.file), f.original);
});

test('operational and no-op patches preserve revision and skip snapshots', t => {
  const f = fixture(t);
  const result = f.patch([{ old: '"status": "draft"', new: '"status": "ready"' }], ['--change-kind', 'operational', '--memory', 'off']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.value.write.revision, 1);
  assert.equal(fs.existsSync(f.snapshot), false);
  const before = fs.statSync(f.file).mtimeMs;
  const same = f.patch([{ old: '유지할 문장.', new: '유지할 문장.' }]);
  assert.equal(same.value.write.status, 'no-op');
  assert.equal(same.value.registration, null);
  assert.equal(fs.statSync(f.file).mtimeMs, before);
  const followup = f.patch(changes);
  assert.equal(followup.status, 0, followup.stderr);
});

test('patch retains Memory connection and separates registration failure from saved content', t => {
  const f = fixture(t);
  const registry = getRegistryPath({ env: f.env });
  fs.mkdirSync(path.dirname(registry), { recursive: true });
  fs.writeFileSync(registry, '{invalid');
  const result = f.patch(changes, ['--change-kind', 'major', '--language', 'ko']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.value.registration.status, 'failed');
  assert.equal(result.value.memory.status, 'created');
  assert.ok(fs.existsSync(path.join(f.project, '.emeth/architecture.json')));
  assert.deepEqual(fs.readFileSync(f.snapshot), f.original);
});

test('malformed patches, active locks and missing IDs do not save', t => {
  const f = fixture(t);
  for (const input of ['{', {}, { edits: [] },
    { edits: [{ old: '', new: 'x' }] },
    { edits: [{ old: 'x', new: 1 }] }]) {
    assert.equal(f.run('patch', input).value.error.code, 'document-patch-invalid');
    assert.deepEqual(fs.readFileSync(f.file), f.original);
  }
  const lock = path.join(f.project, '.emeth/.design-write.lock');
  fs.writeFileSync(lock, String(process.pid));
  assert.equal(f.patch(changes).value.error.code, 'document-locked');
  fs.unlinkSync(lock);
  fs.unlinkSync(f.file);
  assert.equal(f.run('read').value.error.code, 'contract-unavailable');
});

test('sequential insertion and deletion apply once and preserve untouched text', t => {
  const f = fixture(t);
  const result = f.patch([
    { old: '# 요구사항', new: '# 요구사항\n\n새 조건.' },
    { old: '새 조건.', new: '확정된 조건.' },
    { old: '성공하면 ID를 반환한다.\n\n', new: '' },
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(f.file, 'utf8'), f.original.toString('utf8')
    .replace('"revision": 1', '"revision": 2').replace('# 요구사항', '# 요구사항\n\n확정된 조건.')
    .replace('성공하면 ID를 반환한다.\n\n', ''));
});

test('oversized resulting document is rejected without publishing changes', t => {
  const f = fixture(t);
  const result = f.patch([changes[0], { old: '유지할 문장.', new: 'x'.repeat(2 * 1024 * 1024 - 240) }]);
  assert.equal(result.value.error.code, 'document-too-large');
  assert.deepEqual(fs.readFileSync(f.file), f.original);
  assert.equal(fs.existsSync(f.snapshot), false);
});

test('replacement cycles are rejected by the shared Design validator', t => {
  const f = fixture(t);
  const other = path.join(f.project, '.emeth/designs/DESIGN-0002-other/DESIGN.md');
  fs.mkdirSync(path.dirname(other));
  fs.writeFileSync(other, f.original.toString('utf8').replaceAll('DESIGN-0001', 'DESIGN-0002')
    .replace('"supersedes": []', '"supersedes": ["DESIGN-0001"]'));
  const result = f.patch([{ old: '"supersedes": []', new: '"supersedes": ["DESIGN-0002"]' }],
    ['--change-kind', 'operational', '--memory', 'off']);
  assert.equal(result.value.error.code, 'contract-successor-cycle');
  assert.deepEqual(fs.readFileSync(f.file), f.original);
});
