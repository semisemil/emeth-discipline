'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { prepareLaunch } = require('../skills/start-implementation/scripts/prepare-launch.js');
const { resolveContract } = require('../dashboard/records/development-contracts.js');
const { buildProjectIndex } = require('../dashboard/records/project-index.js');
const { selectDocuments } = require('../dashboard/assets/core.js');
const memory = require('../skills/architecture-memory/scripts/memory.js');
const recording = require('../skills/architecture-memory/scripts/record.js');
const storage = require('../skills/architecture-memory/scripts/storage.js');
const workflow = require('../skills/architecture-memory/scripts/workflow.js');
const { notice } = require('../lib/architecture-memory.js');

const repo = path.resolve(__dirname, '..');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proofline-design-'));
  const project = path.join(root, 'project');
  fs.mkdirSync(project);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env, APPDATA: path.join(root, 'config'), XDG_CONFIG_HOME: path.join(root, 'config') };
  const write = (name, text) => { const file = path.join(project, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
  return { root, project, env, write, read: name => fs.readFileSync(path.join(project, name), 'utf8') };
}
function document(id = 'DESIGN-0001', overrides = {}, body = '# 알림 설계\n\n접수에 성공하면 처리 ID를 반환한다.') {
  return `---\n${JSON.stringify({ schema_version: 2, id, title: '알림 설계', kind: 'feature', status: 'ready', revision: 1,
    supersedes: [], superseded_by: null, related_issues: [], ...overrides }, null, 2)}\n---\n\n${body}\n`;
}
function save(f, text = document(), extra = []) {
  const id = JSON.parse(text.split('---')[1]).id;
  const result = spawnSync(process.execPath, [path.join(repo, 'writers/document-writer.js'), 'write', '--kind', 'design',
    '--project-root', f.project, '--relative-path', `.proofline/designs/${id}-notification/DESIGN.md`, ...extra],
  { input: text, encoding: 'utf8', env: f.env, windowsHide: true });
  return { ...result, value: result.status === 0 ? JSON.parse(result.stdout) : JSON.parse(result.stderr) };
}
function section(id, value) { return `## ${id}\n<!-- am: {"id":"${id}","terms":["offline"]} -->\n\n**confirmed/current**\n\n${value}\n`; }
function receipt(f, id) { return memory.read(memory.loadRecords(f.project), { ids: [id] }).documents.flatMap(d => d.sections).find(s => s.id === id).receipt; }

test('the first Design is saved, indexed and executable with a minimal connected Memory and no Git survey', t => {
  const f = fixture(t);
  const result = save(f);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.value.write.kind, 'design');
  assert.equal(result.value.memory.status, 'created');
  const manifest = JSON.parse(f.read('docs/architecture/.architecture-memory/manifest.json'));
  assert.equal(manifest.documents.length, 1);
  assert.equal(manifest.git_checkpoint.revision, null);
  assert.equal(fs.existsSync(path.join(f.project, 'docs/architecture/.architecture-memory/work/state.json')), false);
  assert.match(notice({ cwd: f.project, thread_id: 'design-test' }, { dataRoot: path.join(f.root, 'hooks') }), /new durable project context/);
  const launch = prepareLaunch({ cwd: f.project, design: 'DESIGN-0001', projectRoot: f.project, projectId: 'project', model: 'chosen-model', reasoning: 'high' });
  assert.equal(launch.prompt, '$emeth-discipline:implement DESIGN-0001');
  const index = buildProjectIndex({ id: '11111111-1111-4111-8111-111111111111', root: f.project }).publicIndex;
  assert.equal(index.designs[0].status, 'ready');
  assert.equal(selectDocuments(index, { kind: 'design' })[0].id, 'DESIGN-0001');
  assert.equal(save(f).value.write.status, 'no-op');
});

test('contract CLI reports Memory state without initializing it or blocking the ready contract', t => {
  const f = fixture(t);
  assert.equal(save(f, document(), ['--memory', 'off']).status, 0);
  const read = () => {
    const result = spawnSync(process.execPath, [path.join(repo, 'dashboard/records/development-contracts.js'), '--project-root', f.project, '--id', 'DESIGN-0001'], { encoding: 'utf8', env: f.env, windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    const value = JSON.parse(result.stdout);
    assert.equal(value.id, 'DESIGN-0001');
    assert.equal(value.status, 'ready');
    return value.memory;
  };
  assert.equal(read().status, 'not-connected');
  assert.equal(fs.existsSync(path.join(f.project, 'docs')), false);
  recording.ensureMemory(f.project);
  assert.equal(read().status, 'connected');
  f.write('.proofline/architecture.json', '{broken');
  assert.equal(read().status, 'failed');
});

test('Design revision snapshots the old contract and rejects body changes under an operational revision', t => {
  const f = fixture(t);
  const original = document();
  assert.equal(save(f, original).status, 0);
  const changed = document('DESIGN-0001', { revision: 2 }, '# 새 계약\n\n실패하면 접수 ID를 반환하지 않는다.');
  assert.equal(save(f, changed, ['--change-kind', 'major']).status, 0);
  assert.equal(f.read('.proofline/designs/DESIGN-0001-notification/revisions/REV-1.md'), original);
  const invalid = save(f, document('DESIGN-0001', { revision: 2 }), ['--change-kind', 'operational']);
  assert.notEqual(invalid.status, 0);
  assert.equal(invalid.value.error.code, 'contract-revision-required');
  assert.equal(resolveContract(f.project, 'DESIGN-0001').revision, 2);
});

test('a legacy contract has one successor in the writer, dashboard and execution resolver without rewriting its file', t => {
  const f = fixture(t);
  const legacy = document('SPEC-0001');
  f.write('.proofline/specs/SPEC-0001-original/SPEC.md', legacy);
  f.write('.proofline/specs/SPEC-0002-independent/SPEC.md', document('SPEC-0002'));
  assert.equal(resolveContract(f.project, 'SPEC-0001').id, 'SPEC-0001');
  assert.equal(save(f, document('DESIGN-0001', { status: 'draft', supersedes: ['SPEC-0001'] })).status, 0);
  assert.throws(() => resolveContract(f.project, 'SPEC-0001'), error => error.code === 'contract-superseded');
  assert.throws(() => resolveContract(f.project, 'DESIGN-0001'), error => error.code === 'contract-not-ready');
  assert.equal(resolveContract(f.project, 'SPEC-0002').id, 'SPEC-0002');
  const conflicting = save(f, document('DESIGN-0002', { supersedes: ['SPEC-0001'] }));
  assert.equal(conflicting.value.error.code, 'contract-successor-conflict');
  const index = buildProjectIndex({ id: '11111111-1111-4111-8111-111111111111', root: f.project }).publicIndex;
  assert.equal(index.designs[0].status, 'draft');
  assert.equal(index.specs.find(record => record.id === 'SPEC-0001').status, 'superseded');
  assert.equal(index.specs.find(record => record.id === 'SPEC-0001').superseded_by, 'DESIGN-0001');
  assert.equal(f.read('.proofline/specs/SPEC-0001-original/SPEC.md'), legacy);
  assert.equal(save(f, document('DESIGN-0002', { supersedes: ['DESIGN-0001'] })).status, 0);
  const cycle = save(f, document('DESIGN-0001', { status: 'draft', supersedes: ['SPEC-0001', 'DESIGN-0002'] }), ['--change-kind', 'operational']);
  assert.equal(cycle.value.error.code, 'contract-successor-cycle');
  assert.equal(resolveContract(f.project, 'DESIGN-0002').id, 'DESIGN-0002');
});

test('manual successor conflicts block both the dashboard detail and execution', t => {
  const f = fixture(t);
  f.write('.proofline/specs/SPEC-0001-original/SPEC.md', document('SPEC-0001'));
  save(f, document('DESIGN-0001', { supersedes: ['SPEC-0001'] }));
  f.write('.proofline/designs/DESIGN-0002-manual/DESIGN.md', document('DESIGN-0002', { supersedes: ['SPEC-0001'] }));
  assert.throws(() => resolveContract(f.project, 'DESIGN-0001'), error => error.code === 'contract-successor-conflict');
  const { ProjectIndexService } = require('../dashboard/records/project-index.js');
  const { registerProject } = require('../dashboard/registry.js');
  const registryPath = path.join(f.root, 'registry.json');
  registerProject(f.project, { registryPath });
  const service = new ProjectIndexService({ registryOptions: { registryPath }, watch: () => ({ close() {} }) });
  t.after(() => service.close());
  const project = service.readProjects()[0];
  const index = service.getIndex(project.id);
  assert.equal(index.designs[0].status, 'blocked');
  assert.ok(index.diagnostics.some(item => item.code === 'contract-successor-conflict'));
  assert.equal(service.getDocument(project.id, 'design', 'DESIGN-0001').status, 'blocked');
});

test('disabled or prohibited Memory is preserved, and recording failure is separate from a successful Design write', t => {
  const f = fixture(t);
  assert.equal(save(f, document(), ['--memory', 'off']).value.memory.status, 'disabled');
  assert.equal(fs.existsSync(path.join(f.project, 'docs')), false);
  f.write('.proofline/architecture.json', JSON.stringify({ schema_version: 1, root: 'docs/architecture', enabled: false }));
  assert.equal(save(f).value.memory.status, 'disabled');
  assert.equal(fs.existsSync(path.join(f.project, 'docs')), false);
  fs.unlinkSync(path.join(f.project, '.proofline/architecture.json'));
  f.write('docs/architecture/manual.md', 'Keep existing user documentation.');
  const result = save(f);
  assert.equal(result.status, 0);
  assert.equal(result.value.memory.status, 'failed');
  assert.equal(f.read('docs/architecture/manual.md'), 'Keep existing user documentation.');
});

test('conversation patches retain independent changes and reject stale edits to the same record', t => {
  const f = fixture(t);
  recording.ensureMemory(f.project);
  recording.patch(f.project, { document: 'context' }, { edits: [
    { id: 'AM-offline', expected: null, text: section('AM-offline', 'Works offline. Source: user.') },
    { id: 'AM-retry', expected: null, text: section('AM-retry', 'Retry only idempotent requests. Source: API contract.') },
  ] });
  const offline = receipt(f, 'AM-offline');
  const retry = receipt(f, 'AM-retry');
  recording.patch(f.project, { document: 'context' }, { edits: [{ id: 'AM-retry', expected: retry, text: section('AM-retry', 'Retry twice. Source: revised API contract.') }] });
  recording.patch(f.project, { document: 'context' }, { edits: [{ id: 'AM-offline', expected: offline, text: section('AM-offline', 'Works offline at factory terminals. Source: user.') }] });
  assert.throws(() => recording.patch(f.project, { document: 'context' }, { edits: [{ id: 'AM-offline', expected: offline, text: section('AM-offline', 'Stale overwrite.') }] }), error => error.code === 'memory-record-changed');
  const text = f.read('docs/architecture/04-context.md');
  assert.match(text, /Retry twice/);
  assert.match(text, /factory terminals/);
  assert.doesNotMatch(text, /Stale overwrite/);
  assert.equal(JSON.parse(f.read('docs/architecture/.architecture-memory/manifest.json')).git_checkpoint.revision, null);
});

test('Git update can reconcile minimal Memory without requiring a full init baseline', t => {
  const f = fixture(t);
  const git = (...args) => { const result = spawnSync('git', args, { cwd: f.project, encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
  git('init'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  f.write('app.js', 'module.exports = 1;'); git('add', 'app.js'); git('commit', '-m', 'initial');
  recording.ensureMemory(f.project);
  const started = workflow.begin(f.project, 'update');
  assert.equal(started.status, 'draft');
  workflow.classify(f.project, { path: 'app.js', effect: 'none', reason: 'No recorded claim depends on this constant.' });
  assert.equal(workflow.apply(f.project).status, 'applied');
  assert.equal(JSON.parse(f.read('docs/architecture/.architecture-memory/manifest.json')).documents.length, 1);
});

test('related Memory documents publish together and ADR lifecycle updates invalidate old receipts', t => {
  const f = fixture(t);
  recording.ensureMemory(f.project, { language: 'ko' });
  assert.match(f.read('docs/architecture/04-context.md'), /프로젝트 맥락/);
  const linked = (id, link, text) => section(id, text).replace('"terms":["offline"]', `"links":["${link}"]`);
  const initial = '# ADR-001\n\nStatus: accepted';
  const batch = { documents: [
    { document: 'context', edits: [{ id: 'AM-current', expected: null, text: linked('AM-current', 'AM-decision', 'Current effect.') }] },
    { document: 'adr-001', path: 'decisions/ADR-001.md', kind: 'decision', intro: { before: null, after: initial },
      edits: [{ id: 'AM-decision', expected: null, text: linked('AM-decision', 'AM-current', 'Accepted rationale with literal $& and $` text.') }] },
  ] };
  assert.equal(recording.patch(f.project, {}, batch).status, 'updated');
  assert.equal(memory.loadRecords(f.project).byId.get('AM-current').links[0], 'AM-decision');
  const oldReceipt = receipt(f, 'AM-decision');
  const history = memory.loadRecords(f.project).byId.get('AM-decision').text;
  recording.patch(f.project, { document: 'adr-001' }, { intro: { before: initial, after: '# ADR-001\n\nStatus: superseded' }, edits: [] });
  assert.equal(memory.loadRecords(f.project).byId.get('AM-decision').text, history);
  assert.throws(() => recording.patch(f.project, { document: 'adr-001' }, { edits: [{ id: 'AM-decision', expected: oldReceipt, text: history }] }), error => error.code === 'memory-record-changed');
  const current = f.read('docs/architecture/04-context.md');
  assert.throws(() => recording.patch(f.project, {}, { documents: [
    { document: 'context', edits: [{ id: 'AM-new', expected: null, text: section('AM-new', 'Must not publish.') }] },
    { document: 'adr-001', edits: [{ id: 'AM-invalid', expected: null, text: linked('AM-invalid', 'AM-absent', 'Broken link.') }] },
  ] }), error => error.code === 'memory-link-missing');
  assert.equal(f.read('docs/architecture/04-context.md'), current);
});

test('interrupted conversation publication blocks retrieval and survey until recovery, preserving external edits', t => {
  const f = fixture(t);
  recording.ensureMemory(f.project);
  const originalWrite = storage.atomicWrite;
  storage.atomicWrite = (file, text) => { if (file.endsWith('extra.md')) throw new Error('simulated interruption'); originalWrite(file, text); };
  try {
    assert.throws(() => recording.patch(f.project, {}, { documents: [
      { document: 'context', edits: [{ id: 'AM-a', expected: null, text: section('AM-a', 'First file.') }] },
      { document: 'extra', path: 'extra.md', kind: 'context', edits: [{ id: 'AM-b', expected: null, text: section('AM-b', 'Second file.') }] },
    ] }), /simulated interruption/);
  } finally { storage.atomicWrite = originalWrite; }
  assert.throws(() => memory.loadRecords(f.project), error => error.code === 'memory-record-pending');
  assert.throws(() => workflow.begin(f.project, 'init'), error => error.code === 'memory-record-pending');
  f.write('docs/architecture/extra.md', 'External edit.');
  assert.throws(() => recording.ensureMemory(f.project), error => error.code === 'memory-target-changed');
  assert.equal(f.read('docs/architecture/extra.md'), 'External edit.');
  fs.unlinkSync(path.join(f.project, 'docs/architecture/extra.md'));
  recording.ensureMemory(f.project);
  const corpus = memory.loadRecords(f.project);
  assert.equal(corpus.byId.has('AM-a'), true);
  assert.equal(corpus.byId.has('AM-b'), true);
  assert.equal(corpus.state.manifest.git_checkpoint.revision, null);
  f.write('.proofline/architecture.json', JSON.stringify({ schema_version: 1, root: 'docs/architecture', enabled: false }));
  assert.throws(() => workflow.begin(f.project, 'update'), error => error.code === 'memory-not-initialized');
  assert.throws(() => recording.patch(f.project, { document: 'context' }, { edits: [{ id: 'AM-c', expected: null, text: section('AM-c', 'Disabled.') }] }), error => error.code === 'memory-disabled');
});

test('conversation replacement preserves literal text and rejects oversized or identity-changing sections before writing', t => {
  const f = fixture(t);
  recording.ensureMemory(f.project);
  recording.patch(f.project, { document: 'context' }, { edits: [{ id: 'AM-a', expected: null, text: section('AM-a', 'Original.') }] });
  const literal = section('AM-a', 'Keep $& and $` and $\' and $1 literally.');
  recording.patch(f.project, { document: 'context' }, { edits: [{ id: 'AM-a', expected: receipt(f, 'AM-a'), text: literal }] });
  assert.equal(memory.loadRecords(f.project).byId.get('AM-a').text, literal.trim());
  const before = f.read('docs/architecture/04-context.md');
  assert.throws(() => recording.patch(f.project, { document: 'context' }, { edits: [{ id: 'AM-a', expected: receipt(f, 'AM-a'), text: section('AM-other', 'Changed identity.') }] }), error => error.code === 'memory-patch-invalid');
  assert.throws(() => recording.patch(f.project, { document: 'context' }, { edits: [{ id: 'AM-huge', expected: null, text: section('AM-huge', 'a'.repeat(2 * 1024 * 1024)) }] }), error => error.code === 'memory-file-invalid');
  assert.equal(f.read('docs/architecture/04-context.md'), before);
  assert.equal(fs.existsSync(path.join(f.project, 'docs/architecture/.architecture-memory/work/record.json')), false);
});
