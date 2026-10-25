'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const writer = path.resolve(__dirname, '../plugins/emeth-discipline/writers/document-writer.js');
const contracts = path.resolve(__dirname, '../plugins/emeth-discipline/dashboard/records/development-contracts.js');

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
  const execute = (extra = ['--format', 'paths']) => {
    const result = spawnSync(process.execPath, [contracts, '--project-root', project, '--id', 'DESIGN-0001', ...extra], { env, encoding: 'utf8', windowsHide: true });
    return { ...result, value: JSON.parse(result.status === 0 ? result.stdout : result.stderr) };
  };
  return { project, directory, env, run, create, read, execute };
}

const overview = '# 알림 개발 설계\n\n[접수 계약](contracts/request.md)과 [전달 설계](delivery.md)를 따른다.\n';
const request = '# 접수 계약\n\n접수 성공 시 요청 ID를 반환한다.\n';
const delivery = '# 전달 설계\n\n저장 완료 후 알림을 전송한다.\n';
const input = { body: overview, documents: [{ path: 'contracts/request.md', body: request }, { path: 'delivery.md', body: delivery }] };

test('existing design artifacts are saved byte-for-byte and reach the implementation reader', t => {
  const f = fixture(t);
  const source = path.join(f.project, 'chosen sketch.md');
  const bytes = Buffer.from('\ufeff# 선택한 설계\r\n\r\n[근거](rationale.md)\r\n`send(input): Receipt`\r\n', 'utf8');
  fs.writeFileSync(source, bytes);
  const result = f.create({ body: '# 설계\n\n[구현 계약](sketch.md)과 [근거](rationale.md).\n', documents: [
    { path: 'sketch.md', source }, { path: 'rationale.md', body: '# 근거\n\n호출자는 접수 ID만 필요하다.\n' },
  ] });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readFileSync(path.join(f.directory, 'sketch.md')), bytes);
  assert.deepEqual(fs.readFileSync(source), bytes);
  const handoff = f.execute();
  assert.equal(handoff.status, 0, handoff.stderr);
  assert.deepEqual(fs.readFileSync(handoff.value.documents.find(d => d.path.endsWith('/sketch.md')).absolute_path), bytes);
});

test('a Design revision can adopt an existing artifact without rewriting it or its prior contract', t => {
  const f = fixture(t);
  assert.equal(f.create(input).status, 0);
  const source = path.join(f.project, 'verification.md');
  const text = '# 검증 시나리오\r\n\r\n저장에 실패하면 알림을 보내지 않는다.\r\n';
  fs.writeFileSync(source, text);
  const oldOverview = f.read('DESIGN.md');
  const result = f.run('patch', { edits: [{ old: overview, new: overview + '\n[검증](verification.md)\n' }], documents: [
    { path: 'verification.md', source },
  ] }, ['--change-kind', 'major']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.value.write.revision, 2);
  assert.equal(f.read('verification.md'), text);
  assert.equal(f.read('revisions/REV-1/DESIGN.md'), oldOverview);
  assert.equal(f.read('contracts/request.md'), request);
  assert.equal(fs.readFileSync(f.execute().value.documents.find(d => d.path.endsWith('/verification.md')).absolute_path, 'utf8'), text);
});

test('source failures leave no partial Design and allow retry while preserving independent notes', t => {
  const f = fixture(t);
  const missing = path.join(f.project, 'missing.md');
  const failed = f.create({ body: overview, documents: [{ path: 'delivery.md', body: delivery }, { path: 'contracts/request.md', source: missing }] });
  assert.notEqual(failed.status, 0);
  assert.equal(fs.existsSync(f.directory), false);
  fs.mkdirSync(f.directory, { recursive: true });
  fs.writeFileSync(path.join(f.directory, 'author-notes.txt'), '독립적인 기록');
  const result = f.run('create', input, ['--id', 'DESIGN-0001', '--title', '알림 개발 설계', '--slug', 'notification', '--status', 'ready', '--input-format', 'documents']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.value.write.id, 'DESIGN-0001');
  assert.equal(f.read('author-notes.txt'), '독립적인 기록');
  assert.deepEqual(f.execute().value.documents.map(document => fs.readFileSync(document.absolute_path, 'utf8')), [request, delivery]);
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
  const partial = f.run('read', undefined, ['--document', 'contracts/request.md']);
  assert.equal(partial.value.error.code, 'design-document-set-pending');
  const blocked = f.run('read').value.error;
  assert.equal(blocked.code, 'design-document-set-pending');
  assert.match(blocked.message, /recover --project-root <project> --id DESIGN-0001/);
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
