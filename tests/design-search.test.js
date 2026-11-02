'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const writer = path.resolve(__dirname, '../plugins/emeth-discipline/writers/document-writer.js');

function fixture(t) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-design-search-'));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const env = { ...process.env, APPDATA: path.join(project, '.config'), XDG_CONFIG_HOME: path.join(project, '.config') };
  const file = relative => path.join(project, ...relative.split('/'));
  function invoke(command, args = []) {
    return spawnSync(process.execPath, [writer, command, '--project-root', project, ...args],
      { encoding: 'utf8', env, windowsHide: true });
  }
  function run(command, args = []) {
    const result = invoke(command, args);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }
  function design(number, { title = `Design ${number}`, body = '# Overview\n', status = 'ready', documents = {}, ...extra } = {}) {
    const id = `DESIGN-${String(number).padStart(4, '0')}`;
    const directory = `.emeth/designs/${id}-example`;
    const relative = `${directory}/DESIGN.md`;
    const metadata = { schema_version: 2, id, title, kind: 'feature', status, revision: 1,
      supersedes: [], superseded_by: null, related_issues: [], documents: Object.keys(documents), ...extra };
    fs.mkdirSync(file(directory), { recursive: true });
    fs.writeFileSync(file(relative), `---\n${JSON.stringify(metadata, null, 2)}\n---\n\n${body}`);
    for (const [name, text] of Object.entries(documents)) {
      fs.mkdirSync(path.dirname(file(`${directory}/${name}`)), { recursive: true });
      fs.writeFileSync(file(`${directory}/${name}`), text);
    }
    return { id, directory, relative, metadata };
  }
  return { project, file, invoke, run, design, search: args => run('search', args) };
}

test('paged discovery reaches every related Design beyond the first page, including terminal statuses', t => {
  const f = fixture(t);
  const statuses = ['draft', 'ready', 'blocked', 'completed', 'cancelled', 'superseded'];
  const expected = [];
  for (let number = 125; number >= 1; number -= 1) {
    const documents = number === 125 ? Object.fromEntries(Array.from({ length: 16 }, (_, index) => [
      `details/contract-${String(index + 1).padStart(2, '0')}.md`,
      index === 15 ? '# Last contract\n\nRecallToken is required here.\n' : '# Other contract\n',
    ])) : {};
    const record = f.design(number, { title: `Related service ${number}`,
      body: number === 125 ? '# Service\n\nSee detail contracts.\n' : '# Service\n\nRecallToken is required.\n',
      status: statuses[(number - 1) % statuses.length], documents });
    expected.unshift(record.id);
  }
  f.design(126, { title: 'Unrelated', body: '# Unrelated\n' });
  const first = f.search(['--query', 'RECALLTOKEN', '--limit', '50', '--include-source', 'documents']);
  assert.deepEqual({ total: first.total, offset: first.offset, limit: first.limit, has_more: first.has_more, complete: first.complete },
    { total: 125, offset: 0, limit: 50, has_more: true, complete: true });
  assert.match(first.source_revision, /^[a-f0-9]{64}$/i);
  assert.deepEqual(first.matches.map(match => match.id), expected.slice(0, 50));
  const seen = [...first.matches];
  for (let offset = 50; offset < 125; offset += 50) {
    const page = f.search(['--query', 'recalltoken', '--limit', '50', '--include-source', 'documents', '--offset', String(offset), '--expected-revision', first.source_revision]);
    assert.equal(page.total, 125);
    assert.equal(page.offset, offset);
    assert.equal(page.complete, true);
    assert.equal(page.source_revision, first.source_revision);
    assert.equal(page.has_more, offset + page.matches.length < 125);
    assert.deepEqual(page.matches.map(match => match.id), expected.slice(offset, offset + 50));
    seen.push(...page.matches);
  }
  assert.deepEqual(seen.map(match => match.id), expected);
  assert.deepEqual([...new Set(seen.map(match => match.status))].sort(), [...statuses].sort());
  for (const match of seen) {
    assert.equal(match.revision, 1);
    assert.equal(match.superseded_by, null);
    assert.equal(match.path, `.emeth/designs/${match.id}-example/DESIGN.md`);
    assert.equal(match.source.text, fs.readFileSync(f.file(match.path),'utf8'));
  }
  assert.equal(seen.at(-1).source.documents.length,16);
  assert.equal(seen.at(-1).source.documents.at(-1).body,'# Last contract\n\nRecallToken is required here.\n');
  const plain = f.search(['--query','RecallToken','--limit','1']);
  assert.equal(Object.hasOwn(plain.matches[0],'source'),false);
  const overview = f.search(['--query','RecallToken','--limit','1','--include-source','overview']);
  assert.equal(Object.hasOwn(overview.matches[0].source,'documents'),false);
  assert.equal(overview.matches[0].source.text,seen[0].source.text);
  const maximum = f.search(['--query', 'recalltoken', '--limit', '100']);
  assert.equal(maximum.limit, 100);
  assert.equal(maximum.matches.length, 100);
  assert.equal(maximum.has_more, true);
});

test('deleting a prior-page source invalidates continuation so a fresh search cannot silently skip a Design', t => {
  const f = fixture(t);
  const records = Array.from({ length: 5 }, (_, index) => f.design(index + 1, { body: '# Contract\n\nPagingToken applies.\n' }));
  const first = f.search(['--query', 'PagingToken', '--limit', '2']);
  assert.match(first.source_revision, /^[a-f0-9]{64}$/i);
  assert.deepEqual(first.matches.map(match => match.id), ['DESIGN-0001', 'DESIGN-0002']);
  const unchanged = f.search(['--query', 'PagingToken', '--limit', '2', '--offset', '2', '--expected-revision', first.source_revision]);
  assert.deepEqual(unchanged.matches.map(match => match.id), ['DESIGN-0003', 'DESIGN-0004']);
  assert.equal(unchanged.source_revision, first.source_revision);
  fs.rmSync(f.file(records[0].directory), { recursive: true });
  const rejected = f.invoke('search', ['--query', 'PagingToken', '--limit', '2', '--offset', '2', '--expected-revision', first.source_revision]);
  assert.equal(rejected.status, 1);
  assert.equal(JSON.parse(rejected.stderr).error.code, 'design-search-changed');
  const restarted = f.search(['--query', 'PagingToken', '--limit', '2']);
  assert.equal(restarted.total, 4);
  assert.equal(restarted.complete, true);
  assert.notEqual(restarted.source_revision, first.source_revision);
  assert.deepEqual(restarted.matches.map(match => match.id), ['DESIGN-0002', 'DESIGN-0003']);
});

test('literal queries and normalized paths find renamed titles, details and IDs as one union', t => {
  const f = fixture(t);
  f.design(1, { title: 'Current queue service', body: '# Overview\n\nOld name retained in src/api/dispatch.js.\n',
    documents: { 'contracts/legacy-router.md': '# Dispatch\n\nLegacyRouter v1.2 remains supported.\n' } });
  f.design(2, { title: 'Another service', body: '# Overview\n\nFreshToken applies here.\n',
    documents: { 'src/api/dispatch.js.md': '# Dispatch contract\n' } });
  f.design(3, { body: '# Overview\n\nVersion v1x2 and src/api/dispatchXjs are unrelated.\n' });
  for (const query of ['legacyrouter', 'legacy-router.md', 'DESIGN-0001']) {
    assert.deepEqual(f.search(['--query', query]).matches.map(match => match.id), ['DESIGN-0001']);
  }
  assert.deepEqual(f.search(['--query', 'LEGACYROUTER freshTOKEN']).matches.map(match => match.id), ['DESIGN-0001', 'DESIGN-0002']);
  assert.deepEqual(f.search(['--query', 'v1.2']).matches.map(match => match.id), ['DESIGN-0001']);
  assert.deepEqual(f.search(['--query', 'Current']).matches.map(match => match.id), ['DESIGN-0001']);
  assert.deepEqual(f.search(['--path', 'src\\api\\dispatch.js']).matches.map(match => match.id), ['DESIGN-0001', 'DESIGN-0002']);
  assert.deepEqual(f.search(['--path', 'src\\api\\dispatch.js', '--query', 'v1x2']).matches.map(match => match.id), ['DESIGN-0001', 'DESIGN-0002', 'DESIGN-0003']);
});

test('search reads fresh external edits and reports invalid members and metadata as incomplete', t => {
  const f = fixture(t);
  const record = f.design(1, { documents: { 'detail.md': '# Detail\n\nBeforeToken.\n' } });
  const before = f.search(['--query', 'AfterToken']);
  assert.equal(before.total, 0);
  fs.writeFileSync(f.file(`${record.directory}/detail.md`), '# Detail\n\nAfterToken added outside the writer.\n');
  const edited = f.search(['--query', 'AfterToken']);
  assert.deepEqual(edited.matches.map(match => match.id), [record.id]);
  assert.notEqual(edited.source_revision, before.source_revision);
  assert.equal(f.search(['--query', 'BeforeToken']).total, 0);
  const missing = f.design(2, { documents: { 'missing.md': '# AfterToken\n' } });
  fs.unlinkSync(f.file(`${missing.directory}/missing.md`));
  const invalid = f.design(3);
  fs.writeFileSync(f.file(invalid.relative), '---\n{"id":"DESIGN-0003"}\n---\nAfterToken\n');
  const missingOverview = f.design(4, { documents: { 'contract.md': '# AfterToken\n' } });
  fs.unlinkSync(f.file(missingOverview.relative));
  const result = f.search(['--query', 'AfterToken']);
  assert.equal(result.complete, false);
  assert.ok(result.diagnostics.length >= 3);
  const diagnostics = JSON.stringify(result.diagnostics);
  assert.match(diagnostics, /DESIGN-0002/);
  assert.match(diagnostics, /missing\.md/);
  assert.match(diagnostics, /DESIGN-0003/);
  assert.match(diagnostics, /DESIGN-0004/);
  assert.match(diagnostics, /DESIGN\.md/);
  assert.ok(result.matches.some(match => match.id === record.id));
});

test('replacement discovery derives the successor and reports a broken chain as incomplete', t => {
  const f = fixture(t);
  const previous = f.design(1, { status: 'superseded', body: '# Previous contract\n\nReplacementToken applied here.\n' });
  const successor = f.design(2, { supersedes: [previous.id], body: '# Current contract\n\nReplacementToken applies here.\n' });
  const result = f.search(['--query', 'ReplacementToken']);
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches.map(match => ({ id: match.id, superseded_by: match.superseded_by })), [
    { id: previous.id, superseded_by: successor.id },
    { id: successor.id, superseded_by: null },
  ]);
  assert.deepEqual(result.diagnostics || [], []);
  assert.deepEqual(f.run('list'), { designs: [
    { id: previous.id, title: 'Design 1', kind: 'feature', status: 'superseded', revision: 1,
      path: previous.relative, supersedes: [], superseded_by: successor.id },
    { id: successor.id, title: 'Design 2', kind: 'feature', status: 'ready', revision: 1,
      path: successor.relative, supersedes: [previous.id], superseded_by: null },
  ] });
  f.design(3, { supersedes: ['DESIGN-0099'], body: '# ReplacementToken\n' });
  const broken = f.search(['--query', 'ReplacementToken']);
  assert.equal(broken.complete, false);
  assert.match(JSON.stringify(broken.diagnostics), /DESIGN-0099/);
  assert.ok(broken.matches.some(match => match.id === successor.id));
});
