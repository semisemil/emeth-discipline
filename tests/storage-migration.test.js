'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const test = require('node:test');
const { migrateProject, migrateDirectory } = require('../lib/storage-migration');
const { getCurrentMode, setCurrentMode } = require('../lib/rules-state');
const repo = path.resolve(__dirname, '..');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-migration-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, value) => {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, value);
  };
  const read = name => fs.readFileSync(path.join(root, name), 'utf8');
  const env = { ...process.env, APPDATA: path.join(root, 'config'), XDG_CONFIG_HOME: path.join(root, 'config'),
    PLUGIN_DATA: path.join(root, 'plugin'), HOME: root, USERPROFILE: root, PROOFLINE_BENCHMARK_DISABLE_DASHBOARD: '1' };
  return { root, write, read, env };
}

test('first startup migrates project records, links and saved session mode without a manual command', t => {
  const f = fixture(t);
  f.write('.proofline/issues/PL-0042.json', JSON.stringify({ location: '.proofline/designs/DESIGN-0001-example/DESIGN.md' }));
  f.write('.proofline/designs/DESIGN-0001-example/DESIGN.md', '# Existing design\n[issue](../../issues/PL-0042.json)');
  f.write('.proofline/STATE.md', '[Design](.proofline/designs/DESIGN-0001-example/DESIGN.md)');
  f.write('.proofline/attachment.bin', Buffer.from([0, 255, 128, 1]));
  f.write('plugin/proofline-mode/session.json', '{"mode":"focus"}');
  const result = spawnSync(process.execPath, [path.join(repo, 'hooks/run.js')], { cwd: f.root, env: f.env, encoding: 'utf8',
    input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: f.root, session_id: 'session' }) });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(f.root, '.proofline')), false);
  assert.equal(fs.existsSync(path.join(f.root, 'plugin/proofline-mode')), false);
  assert.equal(JSON.parse(f.read('plugin/rules-mode/session.json')).mode, 'focus');
  assert.equal(JSON.parse(f.read('.emeth/issues/PL-0042.json')).location, '.emeth/designs/DESIGN-0001-example/DESIGN.md');
  assert.match(f.read('.emeth/STATE.md'), /\(.emeth\/designs\//);
  assert.deepEqual(fs.readFileSync(path.join(f.root, '.emeth/attachment.bin')), Buffer.from([0, 255, 128, 1]));
  const prompt = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.equal(prompt, require('../lib/rules-prompt').composeProoflinePrompt('focus'));
  const before = fs.statSync(path.join(f.root, '.emeth/STATE.md')).mtimeMs;
  migrateProject(f.root);
  assert.equal(fs.statSync(path.join(f.root, '.emeth/STATE.md')).mtimeMs, before);
});

test('new projects create no storage as a side effect of migration', t => {
  const f = fixture(t);
  migrateProject(f.root);
  assert.deepEqual(fs.readdirSync(f.root), []);
});

test('a non-directory storage parent leaves persistence errors to the existing mode handler', t => {
  const f = fixture(t);
  f.write('blocked', 'preserve');
  const base = path.join(f.root, 'blocked');
  const original = fs.lstatSync;
  fs.lstatSync = file => {
    if (file.startsWith(base + path.sep)) throw Object.assign(new Error('not a directory'), { code: 'ENOTDIR' });
    return original(file);
  };
  try {
    assert.equal(migrateDirectory(base, 'proofline-mode', 'rules-mode'), path.join(base, 'rules-mode'));
  } finally { fs.lstatSync = original; }
  assert.equal(f.read('blocked'), 'preserve');
});

test('conflicting directories fail without changing either copy', t => {
  const f = fixture(t);
  f.write('.proofline/issues/old.json', 'old'); f.write('.emeth/issues/new.json', 'new');
  assert.throws(() => migrateProject(f.root), { code: 'migration-conflict' });
  assert.equal(f.read('.proofline/issues/old.json'), 'old');
  assert.equal(f.read('.emeth/issues/new.json'), 'new');
  assert.equal(fs.existsSync(path.join(f.root, '.proofline/.emeth-migration.json')), false);
});

test('interrupted link rewrite resumes on the next access', t => {
  const f = fixture(t);
  f.write('.proofline/STATE.md', '.proofline/issues/PL-0001.json');
  const rename = fs.renameSync;
  fs.renameSync = (from, to) => {
    if (to.endsWith('STATE.md')) throw Object.assign(new Error('simulated write denial'), { code: 'EACCES' });
    return rename(from, to);
  };
  try { assert.throws(() => migrateProject(f.root), { code: 'EACCES' }); }
  finally { fs.renameSync = rename; }
  assert.equal(f.read('.emeth/STATE.md'), '.proofline/issues/PL-0001.json');
  assert.equal(fs.existsSync(path.join(f.root, '.emeth/.emeth-migration.json')), true);
  migrateProject(f.root);
  assert.equal(f.read('.emeth/STATE.md'), '.emeth/issues/PL-0001.json');
  assert.equal(fs.existsSync(path.join(f.root, '.emeth/.emeth-migration.json')), false);
});

test('directory rename failure preserves the source and is retryable', t => {
  const f = fixture(t); f.write('.proofline/STATE.md', 'unchanged');
  const rename = fs.renameSync;
  fs.renameSync = () => { throw Object.assign(new Error('simulated busy directory'), { code: 'EBUSY' }); };
  try { assert.throws(() => migrateProject(f.root), { code: 'EBUSY' }); }
  finally { fs.renameSync = rename; }
  assert.equal(f.read('.proofline/STATE.md'), 'unchanged');
  migrateProject(f.root);
  assert.equal(f.read('.emeth/STATE.md'), 'unchanged');
});

test('migration refuses linked directories and leaves external data unchanged', t => {
  const f = fixture(t); f.write('outside/STATE.md', '.proofline/issues/PL-0001.json');
  fs.symlinkSync(path.join(f.root, 'outside'), path.join(f.root, '.proofline'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => migrateProject(f.root), { code: 'migration-path-invalid' });
  assert.equal(f.read('outside/STATE.md'), '.proofline/issues/PL-0001.json');
});

test('mode migration preserves all sessions and subsequent writes use the new directory', t => {
  const f = fixture(t);
  f.write('plugin/proofline-mode/a.json', '{"mode":"focus"}');
  f.write('plugin/proofline-mode/b.json', '{"mode":"core"}');
  const options = { env: f.env, homeDir: f.root };
  assert.equal(getCurrentMode('a', options).mode, 'focus');
  assert.equal(getCurrentMode('b', options).mode, 'core');
  assert.equal(setCurrentMode('a', 'normal', options).ok, true);
  assert.equal(JSON.parse(f.read('plugin/rules-mode/a.json')).mode, 'normal');
  assert.equal(fs.existsSync(path.join(f.root, 'plugin/proofline-mode')), false);
});

test('direct document numbering and architecture access migrate without a session hook', t => {
  const f = fixture(t);
  f.write('.proofline/issues/PL-0042.json', '{}');
  f.write('.proofline/architecture.json', JSON.stringify({ schema_version: 1, root: 'docs/architecture', enabled: false }));
  const storage = require('../skills/architecture-memory/scripts/storage');
  assert.equal(storage.binding(f.root).enabled, false);
  const numbers = require('../lib/document-number');
  assert.equal(numbers.nextDocumentId(f.root, numbers.DOCUMENT_SKILLS['$emeth-discipline:issue-ledger']), 'PL-0043');
  assert.equal(fs.existsSync(path.join(f.root, '.proofline')), false);
});

test('invalid migration names cannot escape the selected storage root', t => {
  const f = fixture(t);
  assert.throws(() => migrateDirectory(f.root, '../outside', 'rules-mode'), { code: 'migration-path-invalid' });
});

test('Git exclusions and exceptions are carried forward without removing existing rules', t => {
  const f = fixture(t);
  assert.equal(spawnSync('git', ['init', f.root], { encoding: 'utf8', windowsHide: true }).status, 0);
  f.write('.gitignore', '# project\n.proofline/*\n!.proofline/shared/\n');
  f.write('.git/info/exclude', '/.proofline/private/\n');
  f.write('.proofline/issues/PL-0001.json', '{}');
  migrateProject(f.root);
  assert.equal(f.read('.gitignore'), '# project\n.proofline/*\n!.proofline/shared/\n.emeth/*\n!.emeth/shared/\n');
  assert.equal(f.read('.git/info/exclude'), '/.proofline/private/\n/.emeth/private/\n');
  const ignored = spawnSync('git', ['-C', f.root, 'check-ignore', '.emeth/issues/PL-0001.json'], { encoding: 'utf8' });
  assert.equal(ignored.status, 0);
});

test('concurrent first accesses serialize migration and preserve every record', async t => {
  const f = fixture(t);
  for (let i = 0; i < 40; i++) f.write(`.proofline/issues/${i}.json`, '{"path":".proofline/designs/example"}');
  const runs = Array.from({ length: 4 }, () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(repo, 'lib/storage-migration.js'), f.root], { windowsHide: true });
    let error = ''; child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('exit', code => resolve({ code, error }));
  }));
  for (const result of await Promise.all(runs)) assert.equal(result.code, 0, result.error);
  assert.equal(fs.readdirSync(path.join(f.root, '.emeth/issues')).length, 40);
  assert.equal(JSON.parse(f.read('.emeth/issues/39.json')).path, '.emeth/designs/example');
});

test('startup from a subdirectory migrates the containing project', t => {
  const f = fixture(t); f.write('.proofline/STATE.md', 'kept'); f.write('src/file.js', '');
  const result = spawnSync(process.execPath, [path.join(repo, 'hooks/run.js')], { env: f.env, encoding: 'utf8',
    input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'resume', cwd: path.join(f.root, 'src') }) });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.read('.emeth/STATE.md'), 'kept');
});

test('dashboard and document CLI first access migrate legacy projects without a startup hook', t => {
  for (const surface of ['dashboard', 'writer']) {
    const f = fixture(t);
    const metadata = { schema_version: 2, id: 'DESIGN-0001', title: 'Existing design', kind: 'feature', status: 'draft',
      revision: 1, supersedes: [], superseded_by: null, related_issues: [] };
    const content = `---\n${JSON.stringify(metadata, null, 2)}\n---\n\n# Existing design\n`;
    f.write('.proofline/designs/DESIGN-0001-example/DESIGN.md', content);
    if (surface === 'dashboard') {
      const { buildProjectIndex } = require('../dashboard/records/project-index');
      const index = buildProjectIndex({ id: '11111111-1111-4111-8111-111111111111', root: f.root,
        registered_at: '2026-09-01T00:00:00.000Z' }).publicIndex;
      assert.equal(index.designs[0].relative_path, '.emeth/designs/DESIGN-0001-example/DESIGN.md');
      assert.deepEqual(index.diagnostics, []);
    } else {
      const result = spawnSync(process.execPath, [path.join(repo, 'writers/document-writer.js'), 'read',
        '--project-root', f.root, '--id', 'DESIGN-0001'], { env: f.env, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Existing design/);
    }
    assert.equal(f.read('.emeth/designs/DESIGN-0001-example/DESIGN.md'), content);
    assert.equal(fs.existsSync(path.join(f.root, '.proofline')), false);
  }
});

test('issue CLI accepts an old explicit storage path and returns the migrated record', t => {
  const f = fixture(t);
  const issue = { schema_version: 2, identity: { id: 'PL-0001', aliases: [], type: 'task', mode: 'simple', title: 'Migrated issue', risk: 'low' },
    origin: { kind: 'request', summary: 'Migration', refs: [] }, state: { status: 'open', current_summary: 'Ready', next_action: 'Continue' },
    objective: { summary: 'Preserve issue', constraints: [] }, criteria: [{ id: 'C1', text: 'Still readable', evidence_refs: [] }],
    relations: [], context: [], artifacts: [], evidence: [], events: [], created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z' };
  f.write('.proofline/issues/PL-0001.json', JSON.stringify(issue));
  const result = spawnSync(process.execPath, [path.join(repo, 'skills/issue-ledger/scripts/issue-ledger.js'), 'show', 'PL-0001',
    '--root', path.join(f.root, '.proofline/issues')], { cwd: f.root, env: f.env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Migrated issue/);
  assert.deepEqual(JSON.parse(f.read('.emeth/issues/PL-0001.json')), issue);
});
