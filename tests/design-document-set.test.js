'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const writer = path.resolve(__dirname, '../writers/document-writer.js');
const contracts = path.resolve(__dirname, '../dashboard/records/development-contracts.js');

function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-design-set-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const project = path.join(temporary, 'project');
  fs.mkdirSync(project);
  const env = { ...process.env, APPDATA: path.join(temporary, 'config'), XDG_CONFIG_HOME: path.join(temporary, 'config') };
  const run = (command, input, extra = []) => {
    const args = [writer, command, '--project-root', project, ...extra];
    if (command !== 'create') args.push('--id', 'DESIGN-0001');
    if (!['read', 'recover'].includes(command)) args.push('--memory', 'off');
    const result = spawnSync(process.execPath, args, { env, input: input === undefined ? undefined : JSON.stringify(input), encoding: 'utf8', windowsHide: true });
    return { ...result, value: JSON.parse(result.status === 0 ? result.stdout : result.stderr) };
  };
  const create = input => run('create', input, ['--title', '알림 개발 설계', '--slug', 'notification', '--status', 'ready', '--input-format', 'documents']);
  const directory = path.join(project, '.emeth/designs/DESIGN-0001-notification');
  const read = name => fs.readFileSync(path.join(directory, name), 'utf8');
  const execute = () => {
    const result = spawnSync(process.execPath, [contracts, '--project-root', project, '--id', 'DESIGN-0001'], { env, encoding: 'utf8', windowsHide: true });
    return { ...result, value: JSON.parse(result.status === 0 ? result.stdout : result.stderr) };
  };
  return { project, directory, env, run, create, read, execute };
}

const overview = '# 알림 개발 설계\n\n[접수 계약](contracts/request.md)과 [전달 설계](delivery.md)를 따른다.\n';
const request = '# 접수 계약\n\n접수 성공 시 요청 ID를 반환한다.\n';
const delivery = '# 전달 설계\n\n저장 완료 후 알림을 전송한다.\n';
const input = { body: overview, documents: [{ path: 'contracts/request.md', body: request }, { path: 'delivery.md', body: delivery }] };

test('a saved overview and detailed designs reach both editing and implementation readers intact', t => {
  const f = fixture(t);
  const result = f.create(input);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.value.write.revision, 1);
  assert.ok(f.read('DESIGN.md').endsWith(overview));
  assert.equal(f.read('contracts/request.md'), request);
  assert.equal(f.read('delivery.md'), delivery);
  const editing = f.run('read');
  assert.equal(editing.status, 0, editing.stderr);
  const implementing = f.execute();
  assert.equal(implementing.status, 0, implementing.stderr);
  for (const result of [editing, implementing]) {
    assert.deepEqual(result.value.documents.map(document => document.body), [request, delivery]);
    assert.ok(result.value.documents[0].path.endsWith('/contracts/request.md'));
  }
});

test('a failed first save can be retried with its ID while preserving other files in the directory', t => {
  const f = fixture(t);
  fs.mkdirSync(f.directory, { recursive: true });
  fs.writeFileSync(path.join(f.directory, 'author-notes.txt'), '독립적인 기록');
  const result = f.run('create', input, ['--id', 'DESIGN-0001', '--title', '알림 개발 설계', '--slug', 'notification', '--status', 'ready', '--input-format', 'documents']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.value.write.id, 'DESIGN-0001');
  assert.equal(f.read('author-notes.txt'), '독립적인 기록');
  assert.deepEqual(f.execute().value.documents.map(document => document.body), [request, delivery]);
});

test('changing only a detailed contract revisions and snapshots the whole set, preserving independent text', t => {
  const f = fixture(t);
  assert.equal(f.create(input).status, 0);
  fs.appendFileSync(path.join(f.directory, 'delivery.md'), '\n독립적으로 추가한 조건.\n');
  const original = f.read('DESIGN.md');
  const independent = f.read('delivery.md');
  const patch = { documents: [{ path: 'contracts/request.md', edits: [{ old: '요청 ID', new: '접수 ID' }] }] };
  const operational = f.run('patch', patch, ['--change-kind', 'operational']);
  assert.equal(operational.value.error.code, 'contract-revision-required');
  assert.equal(f.read('contracts/request.md'), request);
  const revised = f.run('patch', patch, ['--change-kind', 'major']);
  assert.equal(revised.status, 0, revised.stderr);
  assert.equal(revised.value.write.revision, 2);
  assert.equal(f.read('revisions/REV-1.md'), original);
  assert.equal(f.read('revisions/REV-1/DESIGN.md'), original);
  assert.ok(revised.value.write.snapshot.path.endsWith('/revisions/REV-1/DESIGN.md'));
  assert.equal(f.read('revisions/REV-1/contracts/request.md'), request);
  assert.equal(f.read('revisions/REV-1/delivery.md'), independent);
  assert.equal(f.read('delivery.md'), independent);
  assert.ok(f.read('DESIGN.md').endsWith(overview));
  assert.equal(f.execute().value.documents[0].body, request.replace('요청 ID', '접수 ID'));
  const noOp = f.run('patch', { documents: [{ path: 'contracts/request.md', edits: [{ old: '접수 ID', new: '접수 ID' }] }] }, ['--change-kind', 'major']);
  assert.equal(noOp.value.write.status, 'no-op');
  assert.equal(noOp.value.write.revision, 2);
});

test('invalid paths and unmatched edits cannot publish any part of the proposed set', t => {
  const f = fixture(t);
  for (const name of ['../outside.md', '/outside.md', 'DESIGN.md', 'revisions/old.md', 'a/../outside.md']) {
    assert.equal(f.create({ body: overview, documents: [{ path: name, body: request }] }).value.error.code, 'design-document-path-invalid');
    assert.equal(fs.existsSync(path.join(f.directory, 'DESIGN.md')), false);
  }
  assert.equal(f.create(input).status, 0);
  const original = f.read('DESIGN.md');
  const result = f.run('patch', { edits: [{ old: '알림 개발 설계', new: '개정된 설계' }], documents: [
    { path: 'contracts/request.md', edits: [{ old: '요청 ID', new: '접수 ID' }] },
    { path: 'delivery.md', edits: [{ old: '존재하지 않는 문장', new: '새 문장' }] },
  ] }, ['--change-kind', 'major']);
  assert.equal(result.value.error.code, 'document-patch-match');
  assert.equal(f.read('DESIGN.md'), original);
  assert.equal(f.read('contracts/request.md'), request);
  assert.equal(f.read('delivery.md'), delivery);
  assert.equal(fs.existsSync(path.join(f.directory, 'revisions')), false);
});

test('reorganizing a single-file Design creates linked details and retiring a detail preserves its history', t => {
  const f = fixture(t);
  const legacy = spawnSync(process.execPath, [writer, 'create', '--project-root', f.project, '--title', '알림 개발 설계', '--slug', 'notification', '--status', 'ready', '--memory', 'off'], { input: '# 기존 본문\n\n저장 완료 후 알림을 전송한다.\n', env: f.env, encoding: 'utf8', windowsHide: true });
  assert.equal(legacy.status, 0, legacy.stderr);
  const reorganized = f.run('patch', { edits: [{ old: '# 기존 본문\n\n저장 완료 후 알림을 전송한다.', new: overview.trim() }], documents: input.documents }, ['--change-kind', 'major']);
  assert.equal(reorganized.status, 0, reorganized.stderr);
  assert.equal(f.execute().value.documents.length, 2);
  const retired = f.run('patch', { edits: [{ old: '[접수 계약](contracts/request.md)과 [전달 설계](delivery.md)를 따른다.', new: '[접수 계약](contracts/request.md)을 따른다.' }], documents: [{ path: 'delivery.md', remove: true }] }, ['--change-kind', 'major']);
  assert.equal(retired.status, 0, retired.stderr);
  assert.equal(f.execute().value.documents.length, 1);
  assert.equal(fs.existsSync(path.join(f.directory, 'delivery.md')), false);
  assert.equal(f.read('revisions/REV-2/delivery.md'), delivery);
});

test('status changes preserve all detail bytes and missing details prevent ready handoff', t => {
  const f = fixture(t);
  assert.equal(f.create(input).status, 0);
  assert.equal(f.run('status', undefined, ['--status', 'completed']).status, 0);
  assert.equal(f.read('contracts/request.md'), request);
  assert.equal(f.read('delivery.md'), delivery);
  assert.equal(f.run('status', undefined, ['--status', 'ready']).status, 0);
  fs.unlinkSync(path.join(f.directory, 'delivery.md'));
  assert.equal(f.execute().status, 1);
  assert.equal(f.run('status', undefined, ['--status', 'ready']).value.error.code, 'contract-unavailable');
});

test('handoff rejects a document set changed during reading instead of mixing revisions', t => {
  const f = fixture(t);
  assert.equal(f.create(input).status, 0);
  const { resolveContract } = require('../dashboard/records/development-contracts.js');
  const open = fs.openSync;
  const read = fs.readSync;
  const descriptors = new Set();
  let changed = false;
  fs.openSync = (file, ...args) => {
    const descriptor = open(file, ...args);
    if (path.resolve(file) === path.join(f.directory, 'contracts/request.md')) descriptors.add(descriptor);
    else descriptors.delete(descriptor);
    return descriptor;
  };
  fs.readSync = (descriptor, ...args) => {
    const bytes = read(descriptor, ...args);
    if (!changed && descriptors.has(descriptor)) {
      changed = true;
      const result = f.run('patch', { documents: [{ path: 'delivery.md', edits: [{ old: '저장 완료 후', new: '영구 저장 완료 후' }] }] }, ['--change-kind', 'major']);
      assert.equal(result.status, 0, result.stderr);
    }
    return bytes;
  };
  try {
    assert.throws(() => resolveContract(f.project, 'DESIGN-0001'), error => error.code === 'document-changed');
  } finally {
    fs.openSync = open;
    fs.readSync = read;
  }
  assert.equal(f.execute().value.revision, 2);
  assert.equal(f.execute().value.documents[1].body, delivery.replace('저장 완료 후', '영구 저장 완료 후'));
});

test('an interrupted publication blocks handoff and recovery preserves external changes', t => {
  const f = fixture(t);
  assert.equal(f.create(input).status, 0);
  const original = f.read('DESIGN.md');
  const patch = { documents: [
    { path: 'contracts/request.md', edits: [{ old: '요청 ID', new: '접수 ID' }] },
    { path: 'delivery.md', edits: [{ old: '저장 완료 후', new: '영구 저장 완료 후' }] },
  ] };
  // Fail the second filesystem install and the rollback of the first one.
  const script = `const fs = require('node:fs'); const rename = fs.renameSync; let interrupted = false;
    fs.renameSync = (from, to) => { if (to === ${JSON.stringify(path.join(f.directory, 'delivery.md'))}) { interrupted = true; throw new Error('interrupted install'); }
      if (interrupted && to === ${JSON.stringify(path.join(f.directory, 'contracts/request.md'))}) throw new Error('interrupted rollback'); return rename(from, to); };
    require(${JSON.stringify(writer)}).main(['patch', '--project-root', ${JSON.stringify(f.project)}, '--id', 'DESIGN-0001', '--change-kind', 'major', '--memory', 'off'], Buffer.from(${JSON.stringify(JSON.stringify(patch))}));`;
  const interrupted = spawnSync(process.execPath, ['-e', script], { env: f.env, encoding: 'utf8', windowsHide: true });
  assert.equal(JSON.parse(interrupted.stderr).error.code, 'design-document-set-pending');
  assert.equal(f.execute().value.error.code, 'design-document-set-pending');
  assert.equal(f.run('read').value.error.code, 'design-document-set-pending');
  const file = path.join(f.directory, 'contracts/request.md');
  fs.writeFileSync(file, '독립적인 변경');
  assert.equal(f.run('recover').value.error.code, 'document-changed');
  assert.equal(fs.readFileSync(file, 'utf8'), '독립적인 변경');
  fs.writeFileSync(file, request.replace('요청 ID', '접수 ID'));
  assert.equal(f.run('recover').value.status, 'recovered');
  assert.equal(f.read('DESIGN.md'), original);
  assert.equal(f.read('contracts/request.md'), request);
  assert.equal(f.read('delivery.md'), delivery);
  const retried = f.run('patch', patch, ['--change-kind', 'major']);
  assert.equal(retried.status, 0, retried.stderr);
  assert.equal(f.execute().value.revision, 2);
});
