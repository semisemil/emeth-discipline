'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { loadRecords, search, read, parseArgs } = require('../plugins/emeth-discipline/skills/architecture-memory/scripts/memory.js');
const cli = path.resolve(__dirname, '../plugins/emeth-discipline/skills/architecture-memory/scripts/memory.js');

function record(id, text, metadata = {}, status = 'confirmed/current') {
  return `## ${id}\n<!-- am: ${JSON.stringify({ id, ...metadata })} -->\n\n**${status}**\n\n${text}\n`;
}

function fixture(t, contents = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-memory-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const architecture = path.join(root, 'docs', 'architecture');
  const manifestPath = path.join(architecture, '.architecture-memory', 'manifest.json');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const documents = Object.keys(contents).map((name, index) => ({
    id: `doc-${index}`, kind: name.startsWith('decisions/') ? 'decision' : 'context', path: name,
    order: index, verified_at: null, source_revision: null,
  }));
  const manifest = { schema_version: 2, managed: true, language: 'ko',
    git_checkpoint: { revision: null, branch_at_check: null, checked_at: null }, documents };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  for (const [name, text] of Object.entries(contents)) {
    fs.mkdirSync(path.dirname(path.join(architecture, name)), { recursive: true });
    fs.writeFileSync(path.join(architecture, name), text);
  }
  return { root, architecture, manifestPath, manifest, load: () => loadRecords(root) };
}

test('Korean aliases and repository paths find operating facts without returning document bodies', (t) => {
  const f = fixture(t, {
    'context.md': '# 현장\n공장 접수 단말에만 적용한다.\n\n'
      + record('AM-terminal', '망 점검 중에도 접수는 계속한다.\n근거: 사용자, 현장 설명.', { paths: ['src/terminal'], terms: ['키오스크', 'offline'] }),
    'other.md': record('AM-office', '사무실 보고서.', { paths: ['src/office'] }),
  });
  const corpus = f.load();
  const found = search(corpus, { query: '키오스크' });
  assert.deepEqual(found.matches.map((item) => item.id), ['AM-terminal']);
  assert.ok(!JSON.stringify(found).includes('망 점검 중에도'));
  assert.equal(search(corpus, { paths: ['src\\terminal\\main.js'] }).matches[0].id, 'AM-terminal');
  assert.equal(search(corpus, { paths: ['src/terminals'] }).total, 0);
  assert.equal(search(corpus, { paths: ['src'] }).total, 2);
  assert.equal(search(corpus, { query: '없는주제' }).total, 0);
  assert.throws(() => search(corpus, { paths: ['../outside'] }), { code: 'memory-query-path-invalid' });
});

test('selected sections retain preamble, nested conditions, globals and cyclic prerequisite closure', (t) => {
  const f = fixture(t, {
    'context.md': '# 단말\n공장 단말에만 적용한다.\n\n'
      + record('AM-offline', '접수 계속.\n### 예외\n안전 인터록 시에는 중단한다.', { links: ['AM-power'] })
      + record('AM-unrelated', '다른 소유자 정보.'),
    'power.md': record('AM-power', '재부팅은 현장 관리자만 수행한다.', { links: ['AM-offline'] }),
    'global.md': record('AM-global', '고객별 데이터 분리.', { always: true }),
  });
  const result = read(f.load(), { ids: ['AM-offline'] });
  assert.equal(result.complete, true);
  const ids = result.documents.flatMap((item) => item.sections.map((section) => section.id));
  assert.deepEqual(new Set(ids), new Set(['AM-offline', 'AM-power', 'AM-global']));
  assert.ok(result.documents.some((item) => item.intro.includes('공장 단말에만')));
  assert.match(JSON.stringify(result), /안전 인터록/);
  assert.doesNotMatch(JSON.stringify(result), /다른 소유자 정보/);
  assert.equal(read(f.load(), { ids: ['@global'] }).documents.length, 1);
});

test('read receipts reuse exact evidence but changed preambles and newly required links return', (t) => {
  const f = fixture(t, {
    'context.md': '# Shared scope\nFactory only.\n\n' + record('AM-main', 'Continue registration.', { links: ['AM-power'] }),
    'power.md': record('AM-power', 'Only supervisors may restart.'),
    'global.md': record('AM-global', 'Separate tenant data.', { always: true }),
  });
  const first = read(f.load(), { ids: ['AM-main'] });
  const seen = first.documents.flatMap((doc) => doc.sections.map((section) => section.receipt));
  const again = read(f.load(), { ids: ['AM-main'], seen });
  assert.equal(again.complete, true); assert.equal(again.reused, 3); assert.equal(again.documents.length, 0);
  fs.writeFileSync(path.join(f.architecture, 'context.md'), '# Shared scope\nFactory and warehouse.\n\n'
    + record('AM-main', 'Continue registration.', { links: ['AM-power', 'AM-new'] }) + record('AM-new', 'Stop during safety interlocks.'));
  const changed = read(f.load(), { ids: ['AM-main'], seen });
  assert.equal(changed.complete, true); assert.equal(changed.reused, 2);
  assert.deepEqual(changed.documents[0].sections.map((section) => section.id), ['AM-main', 'AM-new']);
  assert.match(changed.documents[0].intro, /warehouse/);
  assert.match(JSON.stringify(changed), /safety interlocks/);
});

test('a compact cursor covers dependencies exactly once and rejects a changed corpus or selection', (t) => {
  const dependencies = Array.from({ length: 15 }, (_, index) => 'AM-required-' + index);
  const f = fixture(t, { 'graph.md': record('AM-root', 'Root.', { links: dependencies })
    + dependencies.map((id) => record(id, 'Condition and exception. '.repeat(40))).join('\n') });
  let cursor; let firstCursor; let complete = false; const delivered = new Set();
  while (!complete) {
    const result = read(f.load(), { ids: ['AM-root'], maxChars: 6000, cursor });
    assert.ok(JSON.stringify(result).length <= 6000);
    const sections = result.documents.flatMap((doc) => doc.sections);
    assert.ok(sections.length);
    for (const section of sections) { assert.equal(delivered.has(section.id), false); delivered.add(section.id); }
    cursor = result.next_cursor; firstCursor ||= cursor;
    complete = result.complete;
  }
  assert.equal(delivered.size, 16);
  assert.throws(() => read(f.load(), { ids: ['AM-required-0'], cursor: firstCursor }), { code: 'memory-cursor-stale' });
  fs.appendFileSync(path.join(f.architecture, 'graph.md'), '\nAn additional constraint.\n');
  assert.throws(() => read(f.load(), { ids: ['AM-root'], cursor: firstCursor }), { code: 'memory-cursor-stale' });
});

test('legacy evidence is unclassified and fenced examples cannot manufacture routing or state', (t) => {
  const f = fixture(t, { 'legacy.md': '# Architecture\nShared scope.\n\n## Offline\nObserved local storage.\n\n```markdown\n## Fake\n<!-- am: {"id":"AM-fake"} -->\n**confirmed/current**\n```\n\n### Details\nKeep exceptions.\n\n## Other\nNot selected.\n' });
  const corpus = f.load();
  assert.equal(corpus.records.length, 2);
  const found = search(corpus, { query: 'Offline' });
  assert.equal(found.matches[0].confidence, 'unclassified');
  assert.equal(found.matches[0].stable, false);
  assert.equal(corpus.byId.has('AM-fake'), false);
  assert.equal(read(corpus, { ids: [found.matches[0].id] }).documents[0].sections.length, 1);
});

test('an individual nested claim cannot classify an entire mixed section', (t) => {
  const f = fixture(t, { 'mixed.md': '## Boundaries\nSeveral claims with separate evidence.\n\n### Earlier plan\n**confirmed/historical**\nRetired constraint.\n' });
  const found = search(f.load(), { query: 'Boundaries' });
  assert.equal(found.total, 1);
  assert.equal(found.matches[0].confidence, 'unclassified');
  assert.equal(found.matches[0].lifecycle, 'unclassified');
});

test('current proposals and accepted plans stay distinct; historical ADRs require history search', (t) => {
  const f = fixture(t, {
    'context.md': record('AM-now', 'queue local') + record('AM-plan', 'queue server', {}, 'confirmed/planned')
      + record('AM-proposal', 'queue cloud', {}, 'proposed/planned') + record('AM-old', 'queue obsolete', {}, 'confirmed/historical'),
    'decisions/ADR-1.md': '# Old queue choice\n\n## Decision\nqueue remote.\n',
  });
  const current = search(f.load(), { query: 'queue', limit: 50 });
  assert.equal(current.total, 3);
  assert.deepEqual(new Set(current.matches.map((item) => `${item.confidence}/${item.lifecycle}`)), new Set(['confirmed/current', 'confirmed/planned', 'proposed/planned']));
  assert.equal(search(f.load(), { query: 'queue', history: true, limit: 50 }).total, 5);
});

test('read budgets omit whole sections and expose incomplete prerequisites', (t) => {
  const huge = 'A condition with its exception. '.repeat(100);
  const f = fixture(t, { 'context.md': record('AM-small', 'Use only with constraint.', { links: ['AM-huge'] }) + record('AM-huge', huge) });
  const partial = read(f.load(), { ids: ['AM-small'], maxChars: 2000 });
  assert.equal(partial.complete, false);
  assert.equal(partial.omitted_count, 1);
  assert.equal(partial.omitted[0].id, 'AM-huge');
  assert.ok(JSON.stringify(partial).length <= 2000);
  assert.ok(!JSON.stringify(partial).includes('A condition'));
  const complete = read(f.load(), { ids: ['AM-small'], maxChars: 6000 });
  assert.equal(complete.complete, true);
  assert.ok(complete.documents.flatMap((item) => item.sections).some((section) => section.text.endsWith(huge.trimEnd())));
});

test('search pagination exposes all candidates and a path match outranks repeated query terms', (t) => {
  const contents = {};
  for (let i = 0; i < 12; i++) contents[`${i}.md`] = record(`AM-${i}`, 'queue', { paths: [`src/${i}`] });
  contents['noisy.md'] = record('AM-noisy', 'queue', { terms: Array.from({ length: 30 }, (_, i) => `word${i}`) });
  const f = fixture(t, contents);
  const corpus = f.load();
  const page = search(corpus, { query: 'queue' });
  assert.equal(page.matches.length, 5);
  assert.equal(page.total, 13);
  assert.equal(page.next_offset, 5);
  const second = search(corpus, { query: 'queue', offset: page.next_offset });
  assert.ok(second.matches.every((item) => !page.matches.some((first) => first.id === item.id)));
  const ranked = search(corpus, { paths: ['src/3/file.js'], query: Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ') });
  assert.equal(ranked.matches[0].id, 'AM-3');
});

test('file changes are immediately visible and stale search revisions cannot select shifted legacy IDs', (t) => {
  const f = fixture(t, { 'context.md': record('AM-one', 'old queue') });
  const old = f.load();
  fs.writeFileSync(path.join(f.architecture, 'context.md'), record('AM-one', 'new terminal'));
  const current = f.load();
  assert.equal(search(current, { query: 'queue' }).total, 0);
  assert.equal(search(current, { query: 'terminal' }).total, 1);
  assert.throws(() => read(current, { ids: ['AM-one'], revision: old.revision }), { code: 'memory-changed' });
  fs.unlinkSync(path.join(f.architecture, 'context.md'));
  assert.throws(f.load, { code: 'architecture-unavailable' });
});

test('CLI searches and checks without modifying project files; malformed arguments fail as JSON', (t) => {
  const f = fixture(t, { 'context.md': record('AM-one', 'terminal') });
  const before = fs.readFileSync(f.manifestPath);
  const fileBefore = fs.statSync(path.join(f.architecture, 'context.md')).mtimeMs;
  for (const args of [['search', '--query', 'terminal'], ['read', '--id', 'AM-one'], ['check']]) {
    const result = spawnSync(process.execPath, [cli, ...args, '--project-root', f.root], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(JSON.parse(result.stdout));
  }
  assert.deepEqual(fs.readFileSync(f.manifestPath), before);
  assert.equal(fs.statSync(path.join(f.architecture, 'context.md')).mtimeMs, fileBefore);
  assert.deepEqual(fs.readdirSync(path.dirname(f.manifestPath)), ['manifest.json']);
  for (const args of [['search', '--max-chars', '-1'], ['search', '--limit', '1x'], ['read', '--query', 'x'], ['check', '--unknown', 'x']]) {
    const result = spawnSync(process.execPath, [cli, ...args, '--project-root', f.root], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 1);
    assert.ok(JSON.parse(result.stderr).error.code);
  }
  assert.throws(() => parseArgs(['search', '--project-root', f.root, '--query', 'x', '--query', 'y']), { code: 'memory-argument-invalid' });
});

test('missing and ambiguous registration fail before retrieval', (t) => {
  const f = fixture(t, { 'context.md': record('AM-one', 'terminal') });
  const duplicate = path.join(f.root, 'docs', 'other', '.architecture-memory');
  fs.mkdirSync(duplicate, { recursive: true });
  fs.writeFileSync(path.join(duplicate, 'manifest.json'), JSON.stringify(f.manifest));
  assert.throws(f.load, (error) => /ambiguous/.test(error.code));
  fs.unlinkSync(path.join(duplicate, 'manifest.json'));
  fs.unlinkSync(f.manifestPath);
  assert.throws(f.load, { code: 'architecture-not-found' });
});
