'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const test = require('node:test');
const { migrateProject } = require('../plugins/emeth-discipline/lib/storage-migration');
const repo = path.resolve(__dirname, '../plugins/emeth-discipline');

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
    PLUGIN_DATA: path.join(root, 'plugin'), HOME: root, USERPROFILE: root };
  return { root, write, read, env };
}

test('first startup migrates project records, links and binary attachments', t => {
  const f = fixture(t);
  f.write('.proofline/issues/PL-0042.json', JSON.stringify({ location: '.proofline/designs/DESIGN-0001-example/DESIGN.md' }));
  f.write('.proofline/designs/DESIGN-0001-example/DESIGN.md', '# Existing design\n[issue](../../issues/PL-0042.json)');
  f.write('.proofline/STATE.md', '[Design](.proofline/designs/DESIGN-0001-example/DESIGN.md)');
  f.write('.proofline/attachment.bin', Buffer.from([0, 255, 128, 1]));
  const result = spawnSync(process.execPath, [path.join(repo, 'hooks/run.js')], { cwd: f.root, env: f.env, encoding: 'utf8',
    input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: f.root, session_id: 'session' }) });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(f.root, '.proofline')), false);
  assert.equal(JSON.parse(f.read('.emeth/issues/PL-0042.json')).location, '.emeth/designs/DESIGN-0001-example/DESIGN.md');
  assert.match(f.read('.emeth/STATE.md'), /\(.emeth\/designs\//);
  assert.deepEqual(fs.readFileSync(path.join(f.root, '.emeth/attachment.bin')), Buffer.from([0, 255, 128, 1]));
  const prompt = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  assert.equal(prompt, require('../plugins/emeth-discipline/lib/rules-prompt').composeEmethPrompt());
  const before = fs.statSync(path.join(f.root, '.emeth/STATE.md')).mtimeMs;
  migrateProject(f.root);
  assert.equal(fs.statSync(path.join(f.root, '.emeth/STATE.md')).mtimeMs, before);
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
  for (let i = 0; i < 2; i++) f.write(`.proofline/issues/${i}.json`, '{"path":".proofline/designs/example"}');
  const runs = Array.from({ length: 2 }, () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(repo, 'lib/storage-migration.js'), f.root], { windowsHide: true });
    let error = ''; child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('exit', code => resolve({ code, error }));
  }));
  for (const result of await Promise.all(runs)) assert.equal(result.code, 0, result.error);
  assert.equal(fs.readdirSync(path.join(f.root, '.emeth/issues')).length, 2);
  for (let i = 0; i < 2; i++) assert.equal(JSON.parse(f.read(`.emeth/issues/${i}.json`)).path, '.emeth/designs/example');
});

test('dashboard and document CLI first access migrate legacy projects without a startup hook', t => {
  for (const surface of ['dashboard', 'writer']) {
    const f = fixture(t);
    const metadata = { schema_version: 2, id: 'DESIGN-0001', title: 'Existing design', kind: 'feature', status: 'draft',
      revision: 1, supersedes: [], superseded_by: null, related_issues: [] };
    const content = `---\n${JSON.stringify(metadata, null, 2)}\n---\n\n# Existing design\n`;
    f.write('.proofline/designs/DESIGN-0001-example/DESIGN.md', content);
    if (surface === 'dashboard') {
      const { buildProjectIndex } = require('../plugins/emeth-discipline/dashboard/records/project-index');
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
