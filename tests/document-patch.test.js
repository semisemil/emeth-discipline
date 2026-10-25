'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { getRegistryPath } = require('../plugins/emeth-discipline/dashboard/registry.js');
const cli = path.resolve(__dirname, '../plugins/emeth-discipline/writers/document-writer.js');

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

test('Design write and patch support in-revision edits while operational saves preserve content', t => {
  const f = fixture(t, { bom: true, newline: '\r\n' });
  const revised = Buffer.from(f.original.toString('utf8').replace(changes[0].old, changes[0].new));
  const write = spawnSync(process.execPath, [cli, 'write', '--kind', 'design', '--project-root', f.project,
    '--relative-path', '.emeth/designs/DESIGN-0001-test/DESIGN.md', '--memory', 'off'],
  { env: f.env, input: revised, encoding: 'utf8', windowsHide: true });
  assert.equal(write.status, 0, write.stderr);
  assert.equal(JSON.parse(write.stdout).write.revision, 1);
  assert.equal(JSON.parse(write.stdout).write.snapshot, null);
  assert.deepEqual(fs.readFileSync(f.file), revised);
  const edit = [{ old: '유지할 문장.', new: '의미를 유지한 설명.' }];
  const rejected = f.patch(edit, ['--change-kind', 'operational', '--memory', 'off']);
  assert.equal(rejected.value.error.code, 'contract-revision-required');
  assert.deepEqual(fs.readFileSync(f.file), revised);
  const patched = f.patch(edit, ['--memory', 'off']);
  assert.equal(patched.status, 0, patched.stderr);
  assert.equal(patched.value.write.revision, 1);
  assert.equal(patched.value.write.snapshot, null);
  assert.deepEqual(fs.readFileSync(f.file), Buffer.from(revised.toString('utf8').replace(edit[0].old, edit[0].new)));
  assert.equal(fs.existsSync(f.snapshot), false);
});

test('read and patch preserve BOM, CRLF and unrelated bytes', t => {
  const f = fixture(t, { bom: true, newline: '\r\n' });
  const read = f.read();
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

test('filesystem and registration failures preserve the document publication boundary', t => {
  const f = fixture(t);
  const registry = getRegistryPath({ env: f.env });
  const source = `const fs = require('node:fs');
    for (const name of ['linkSync', 'renameSync']) {
      const original = fs[name];
      fs[name] = (from, to, ...args) => {
        if (to === process.argv[2]) throw Object.assign(new Error(process.argv[3] + ': publication failed'), { code: process.argv[3] });
        return original(from, to, ...args);
      };
    }
    require(process.argv[1]).main(process.argv.slice(4));`;
  const run = (target, code, args, input) => spawnSync(process.execPath, ['-e', source, cli, target, code,
    ...args, '--project-root', f.project], { input, env: f.env, encoding: 'utf8', windowsHide: true });
  const created = path.join(f.project, '.emeth/designs/DESIGN-0002-failed/DESIGN.md');
  for (const [target, args, input] of [
    [created, ['create', '--id', 'DESIGN-0002', '--title', 'Failed creation', '--slug', 'failed', '--memory', 'off'], '# New document'],
    [f.file, ['patch', '--id', 'DESIGN-0001', '--change-kind', 'major', '--memory', 'off'], JSON.stringify({ edits: changes })],
  ]) {
    const failed = run(target, 'EIO', args, input);
    assert.equal(failed.status, 1);
    assert.equal(JSON.parse(failed.stderr).error.code, 'document-write-failed');
    assert.deepEqual(fs.readFileSync(f.file), f.original);
    assert.equal(fs.existsSync(created), false);
    assert.equal(fs.existsSync(registry), false);
  }
  const result = run(registry, 'EACCES', ['patch', '--id', 'DESIGN-0001', '--change-kind', 'major', '--language', 'ko'], JSON.stringify({ edits: changes }));
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.write.status, 'updated');
  assert.equal(value.registration.status, 'failed');
  assert.equal(value.registration.error.code, 'registry-write-failed');
  assert.match(value.registration.error.message, /EACCES/);
  assert.equal(value.memory.status, 'created');
  assert.ok(fs.existsSync(path.join(f.project, '.emeth/architecture.json')));
  assert.deepEqual(fs.readFileSync(f.file), Buffer.from(f.original.toString('utf8')
    .replace('"revision": 1', '"revision": 2').replace(changes[0].old, changes[0].new)));
  assert.deepEqual(fs.readFileSync(f.snapshot), f.original);
  assert.equal(fs.existsSync(registry), false);
});
