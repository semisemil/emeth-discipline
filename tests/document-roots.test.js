'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { buildProjectIndex, ProjectIndexService } = require('../plugins/emeth-discipline/dashboard/records/project-index.js');
const { ArchitectureService } = require('../plugins/emeth-discipline/dashboard/architecture.js');
const { nextDocumentId, DOCUMENT_SKILLS } = require('../plugins/emeth-discipline/lib/document-number.js');
const { notice } = require('../plugins/emeth-discipline/lib/architecture-memory.js');
const W = require('../plugins/emeth-discipline/skills/architecture-memory/scripts/workflow.js');
const A = require('../plugins/emeth-discipline/skills/architecture-memory/scripts/author.js');
const repo = path.resolve(__dirname, '../plugins/emeth-discipline');
const projectId = '11111111-1111-4111-8111-111111111111';

function fixture(t, config) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-document-roots-'));
  const project = path.join(temporary, 'code');
  const vault = path.join(temporary, 'vault', 'Example');
  fs.mkdirSync(path.join(project, '.emeth'), { recursive: true });
  const write = (file, content) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };
  write(path.join(project, '.emeth/documents.json'), JSON.stringify({ schema_version: 1, ...(config ? config(vault) : { root: vault }) }));
  const env = { ...process.env, APPDATA: path.join(temporary, 'config'), XDG_CONFIG_HOME: path.join(temporary, 'config') };
  t.after(() => { assert.equal(path.dirname(temporary), os.tmpdir()); fs.rmSync(temporary, { recursive: true, force: true }); });
  const cli = (file, args, input) => spawnSync(process.execPath, [path.join(repo, file), ...args], { input, env, encoding: 'utf8', windowsHide: true });
  const writer = (command, args = [], input) => {
    const result = cli('writers/document-writer.js', [command, '--project-root', project, ...args], input);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const projectRecord = { id: projectId, root: project };
  return { temporary, project, vault, env, write, cli, writer, projectRecord };
}

test('one external root owns Design creation, reads, revisions, status, numbering and dashboard detail', t => {
  const f = fixture(t);
  const created = f.writer('create', ['--title', 'Example', '--slug', 'example', '--status', 'ready', '--input-format', 'documents'],
    JSON.stringify({ body: '# Overview\n\n[Contract](contract.md)', documents: [{ path: 'contract.md', body: '# Contract\n\nReturn the request ID.' }] }));
  const directory = path.join(f.vault, 'designs', 'DESIGN-0001-example');
  assert.equal(created.write.absolute_path, path.join(directory, 'DESIGN.md'));
  assert.equal(created.memory.status, 'created');
  assert.equal(fs.existsSync(path.join(f.project, '.emeth/designs')), false);
  assert.equal(fs.existsSync(path.join(f.project, 'docs/architecture')), false);
  const overview = fs.readFileSync(path.join(directory, 'DESIGN.md'), 'utf8');
  const read = f.writer('read', ['--id', 'DESIGN-0001', '--document', 'contract.md', '--section', 'Contract']);
  assert.equal(read.absolute_path, path.join(directory, 'contract.md'));
  assert.equal(read.text, '# Contract\n\nReturn the request ID.');
  f.writer('patch', ['--id', 'DESIGN-0001', '--change-kind', 'major'], JSON.stringify({ documents: [{ path: 'contract.md', edits: [{ old: 'request ID', new: 'receipt ID' }] }] }));
  assert.equal(fs.readFileSync(path.join(directory, 'revisions/REV-1/DESIGN.md'), 'utf8'), overview);
  assert.equal(fs.readFileSync(path.join(directory, 'revisions/REV-1/contract.md'), 'utf8'), '# Contract\n\nReturn the request ID.');
  const status = f.writer('status', ['--id', 'DESIGN-0001', '--status', 'completed']);
  assert.equal(status.document_status, 'completed');
  assert.equal(status.write.revision, 2);
  assert.equal(fs.readFileSync(path.join(directory, 'contract.md'), 'utf8'), '# Contract\n\nReturn the receipt ID.');
  f.writer('status', ['--id', 'DESIGN-0001', '--status', 'ready']);
  const contract = f.cli('dashboard/records/development-contracts.js', ['--project-root', f.project, '--id', 'DESIGN-0001']);
  assert.equal(contract.status, 0, contract.stderr);
  assert.equal(JSON.parse(contract.stdout).documents[0].body, '# Contract\n\nReturn the receipt ID.');
  const pointers = f.cli('dashboard/records/development-contracts.js', ['--project-root', f.project, '--id', 'DESIGN-0001', '--format', 'paths']);
  assert.equal(pointers.status, 0, pointers.stderr);
  const paths = JSON.parse(pointers.stdout);
  assert.equal(paths.absolute_path, path.join(directory, 'DESIGN.md'));
  assert.equal(paths.documents[0].absolute_path, path.join(directory, 'contract.md'));
  assert.equal(fs.readFileSync(paths.documents[0].absolute_path, 'utf8'), '# Contract\n\nReturn the receipt ID.');
  assert.equal(nextDocumentId(f.project, DOCUMENT_SKILLS['/emeth-discipline:development-design']), 'DESIGN-0002');
  const registryPath = path.join(f.temporary, 'projects.json');
  f.write(registryPath, JSON.stringify({ schema_version: 1, projects: [{ ...f.projectRecord, registered_at: '2026-10-12T00:00:00.000Z' }] }));
  const watched = [];
  const service = new ProjectIndexService({ registryOptions: { registryPath }, watch: target => { watched.push(target); return { close() {} }; } });
  t.after(() => service.close());
  assert.equal(service.getIndex(projectId).designs[0].revision, 2);
  assert.match(service.getDocument(projectId, 'design', 'DESIGN-0001').body, /Overview/);
  assert.ok(watched.includes(directory));
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.vault, 'designs/.emeth-project.json'), 'utf8')).project_root, f.project);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.vault, 'architecture/.emeth-project.json'), 'utf8')).project_root, f.project);
});

test('external architecture baseline, authoring, retrieval and Git reconciliation use the code project', t => {
  const f = fixture(t);
  const git = (...args) => { const result = spawnSync('git', args, { cwd: f.project, encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
  f.write(path.join(f.project, 'app.js'), 'const store = "local";\n');
  git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Fixture'); git('add', '.'); git('commit', '-qm', 'baseline');
  const baseline = git('rev-parse', 'HEAD');
  W.begin(f.project, 'init', { language: 'ko' });
  A.run(f.project, 'scaffold');
  A.run(f.project, 'section', { document: 'system-context', title: 'Purpose', body: 'Store requests offline.', confidence: 'confirmed', lifecycle: 'current' });
  A.run(f.project, 'section', { document: 'containers', title: 'Runtime', body: 'The application owns the local store.', confidence: 'confirmed', lifecycle: 'current' });
  const section = A.run(f.project, 'section', { document: 'context', title: 'Storage', body: 'Keep requests locally.', confidence: 'confirmed', lifecycle: 'current' });
  W.apply(f.project);
  const architecture = path.join(f.vault, 'architecture');
  const manifest = () => JSON.parse(fs.readFileSync(path.join(architecture, '.architecture-memory/manifest.json'), 'utf8'));
  assert.equal(manifest().git_checkpoint.revision, baseline);
  assert.match(notice({ cwd: f.project, thread_id: 'external-root' }, { dataRoot: path.join(f.temporary, 'hooks') }), /Project architecture documents are connected/);
  const read = f.cli('skills/architecture-memory/scripts/memory.js', ['read', '--project-root', f.project, '--id', section.ids[0]]);
  assert.equal(read.status, 0, read.stderr);
  const receipt = JSON.parse(read.stdout).documents[0].sections[0].receipt;
  A.run(f.project, 'section', { document: 'context', id: section.ids[0], expected: receipt, title: 'Storage', body: 'Keep requests durably.', confidence: 'confirmed', lifecycle: 'current' });
  const service = new ArchitectureService({ projectService: { findProject: () => f.projectRecord } });
  assert.match(service.getDocument(projectId, 'context').body, /Keep requests durably/);
  f.write(path.join(f.project, 'app.js'), 'const store = "durable";\n');
  git('add', 'app.js'); git('commit', '-qm', 'durable source');
  W.begin(f.project, 'update');
  assert.match(W.source(f.project, { path: 'app.js' }).text, /durable/);
  W.classify(f.project, { path: 'app.js', effect: 'none', reason: 'The existing storage contract already describes the source.' });
  W.apply(f.project);
  assert.equal(manifest().git_checkpoint.revision, git('rev-parse', 'HEAD'));
  assert.equal(fs.existsSync(path.join(f.project, 'docs/architecture')), false);
});

test('independent custom directories keep issue storage and linked Design identity in the code project', t => {
  const f = fixture(t, vault => ({ architecture: '../vault/Example/context', designs: path.join(vault, 'implementation') }));
  const issue = {
    schema_version: 2, identity: { id: 'PL-0001', aliases: [], type: 'feature', mode: 'simple', title: 'Request storage', risk: 'low' },
    origin: { kind: 'request', summary: 'Keep requests in storage.', refs: [] },
    state: { status: 'open', current_summary: 'Design pending', next_action: 'Write the storage contract' },
    objective: { summary: 'Store incoming requests.', constraints: [] },
    criteria: [{ id: 'C1', text: 'Return a stored request ID.', evidence_refs: [] }],
    milestones: [], relations: [], context: [], artifacts: [], evidence: [], events: [],
    created_at: '2026-10-12T00:00:00.000Z', updated_at: '2026-10-12T00:00:00.000Z',
  };
  const issueFile = path.join(f.project, '.emeth/issues/PL-0001.json');
  f.write(issueFile, JSON.stringify(issue));
  const text = `---\n${JSON.stringify({ schema_version: 2, id: 'DESIGN-0001', title: 'Example', kind: 'feature', status: 'ready', revision: 1, supersedes: [], superseded_by: null, related_issues: ['PL-0001'] })}\n---\n\n# Contract\n`;
  f.writer('write', ['--kind', 'design', '--relative-path', '.emeth/designs/DESIGN-0001-example/DESIGN.md'], text);
  const link = f.cli('skills/issue-ledger/scripts/issue-ledger.js', ['link-work', 'PL-0001', '--kind', 'design', '--work-id', 'DESIGN-0001', '--path', '.emeth/designs/DESIGN-0001-example/DESIGN.md', '--current-summary', 'Design ready', '--next-action', 'Implement', '--root', path.dirname(issueFile), '--project-root', f.project]);
  assert.equal(link.status, 0, link.stderr);
  assert.equal(JSON.parse(fs.readFileSync(issueFile, 'utf8')).state.status, 'open');
  const index = buildProjectIndex(f.projectRecord).publicIndex;
  assert.deepEqual(index.designs[0].linked_issue_ids, ['PL-0001']);
  assert.equal(index.diagnostics.some(d => d.code === 'link-mismatch'), false);
  assert.ok(fs.existsSync(path.join(f.vault, 'context/.architecture-memory/manifest.json')));
  assert.equal(fs.existsSync(path.join(f.vault, 'issues')), false);
});

test('invalid settings and another project ownership fail without writing the default paths', t => {
  const f = fixture(t);
  f.writer('create', ['--title', 'Example', '--slug', 'example'], '# Example');
  const other = path.join(f.temporary, 'other-code');
  f.write(path.join(other, '.emeth/documents.json'), JSON.stringify({ schema_version: 1, root: f.vault }));
  const result = f.cli('writers/document-writer.js', ['create', '--project-root', other, '--title', 'Other', '--slug', 'other'], '# Other');
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).error.code, 'document-project-mismatch');
  f.write(path.join(f.project, '.emeth/documents.json'), '{broken');
  const invalid = f.cli('writers/document-writer.js', ['create', '--project-root', f.project, '--title', 'Other', '--slug', 'other'], '# Other');
  assert.equal(invalid.status, 1);
  assert.equal(JSON.parse(invalid.stderr).error.code, 'document-roots-invalid');
  assert.equal(fs.existsSync(path.join(f.project, '.emeth/designs')), false);
  assert.equal(fs.existsSync(path.join(other, '.emeth/designs')), false);
});

test('architecture authoring preserves another project\'s external draft', t => {
  const f = fixture(t);
  W.begin(f.project, 'init');
  A.run(f.project, 'scaffold');
  const directory = path.join(f.vault, 'architecture');
  const context = path.join(directory, '.architecture-memory/work/draft/04-context.md');
  const before = fs.readFileSync(context);
  const other = path.join(f.temporary, 'other-code');
  fs.mkdirSync(other);
  const result = f.cli('skills/architecture-memory/scripts/author.js', ['section', '--project-root', other, '--root', directory],
    JSON.stringify({ document: 'context', title: 'Foreign context', body: 'This context belongs to the other project.', confidence: 'confirmed', lifecycle: 'current' }));
  assert.equal(result.status, 1, result.stdout);
  assert.equal(JSON.parse(result.stderr).error.code, 'document-project-mismatch');
  assert.deepEqual(fs.readFileSync(context), before);
});

test('architecture patch preserves another project\'s pending publication', t => {
  const f = fixture(t);
  f.writer('create', ['--title', 'Example', '--slug', 'example'], '# Example');
  const directory = path.join(f.vault, 'architecture');
  const context = path.join(directory, '04-context.md');
  const before = fs.readFileSync(context, 'utf8');
  const journal = path.join(directory, '.architecture-memory/work/record.json');
  const pending = JSON.stringify({ entries: [{ path: '04-context.md', before: crypto.createHash('sha256').update(before).digest('hex'), after: before + '\nOwner publication pending.\n' }] });
  f.write(journal, pending);
  const other = path.join(f.temporary, 'other-code');
  f.write(path.join(other, '.emeth/documents.json'), JSON.stringify({ schema_version: 1, root: f.vault }));
  f.write(path.join(other, '.emeth/architecture.json'), JSON.stringify({ schema_version: 1, root: 'docs/architecture' }));
  const result = f.cli('skills/architecture-memory/scripts/record.js', ['patch', '--project-root', other, '--document', 'context'], JSON.stringify({ edits: [] }));
  assert.equal(result.status, 1, result.stdout);
  assert.equal(JSON.parse(result.stderr).error.code, 'document-project-mismatch');
  assert.equal(fs.readFileSync(context, 'utf8'), before);
  assert.equal(fs.readFileSync(journal, 'utf8'), pending);
});

test('relocating existing collections and selecting their new root preserves documents and resumes architecture work', t => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.project, '.emeth/documents.json'));
  f.write(path.join(f.project, 'app.js'), 'const store = "local";\n');
  f.writer('create', ['--title', 'Example', '--slug', 'example', '--status', 'ready'], '# Existing contract');
  W.begin(f.project, 'init');
  A.run(f.project, 'scaffold');
  A.run(f.project, 'section', { document: 'system-context', title: 'Purpose', body: 'Store requests offline.', confidence: 'confirmed', lifecycle: 'current' });
  A.run(f.project, 'section', { document: 'containers', title: 'Runtime', body: 'One application owns storage.', confidence: 'confirmed', lifecycle: 'current' });
  W.apply(f.project);
  const original = f.writer('read', ['--id', 'DESIGN-0001']);
  const originalContext = fs.readFileSync(path.join(f.project, 'docs/architecture/04-context.md'), 'utf8');
  fs.mkdirSync(f.vault, { recursive: true });
  for (const [from, to] of [['.emeth/designs', 'designs'], ['docs/architecture', 'architecture']]) {
    const source = path.resolve(f.project, from);
    const target = path.resolve(f.vault, to);
    assert.ok(source.startsWith(f.temporary + path.sep) && target.startsWith(f.temporary + path.sep));
    fs.renameSync(source, target);
  }
  f.write(path.join(f.project, '.emeth/documents.json'), JSON.stringify({ schema_version: 1, root: f.vault }));
  assert.equal(f.writer('read', ['--id', 'DESIGN-0001']).text, original.text);
  assert.equal(nextDocumentId(f.project, DOCUMENT_SKILLS['/emeth-discipline:development-design']), 'DESIGN-0002');
  assert.equal(W.begin(f.project, 'init').connection_only, true);
  assert.equal(W.apply(f.project).status, 'applied');
  assert.equal(fs.readFileSync(path.join(f.vault, 'architecture/04-context.md'), 'utf8'), originalContext);
  f.writer('status', ['--id', 'DESIGN-0001', '--status', 'completed']);
  assert.equal(fs.existsSync(path.join(f.project, '.emeth/designs')), false);
  assert.equal(fs.existsSync(path.join(f.project, 'docs/architecture')), false);
});
