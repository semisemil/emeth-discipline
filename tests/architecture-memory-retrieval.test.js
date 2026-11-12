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

test('decision pointers derive lifecycle metadata without inferring legacy status or hiding missing successors', t => {
  const f = fixture(t, {
    'context.md': '# 저장 조건\n\n- Status: accepted\n\n' + record('AM-context', '저장 조건.'),
    'decisions/korean.md': '# 저장 결정\r\n\r\n- 상태: superseded\r\n- 후속 결정: ADR-9999\r\n\r\n'
      + record('AM-korean', '로컬 저장.'),
    'decisions/legacy.md': '# 저장 결정\n\n```text\n- Status: accepted\n```\n\n'
      + record('AM-legacy', '로컬 저장.'),
    'decisions/proposal.md': '# 저장 결정\n\n- Status: proposed\n- Superseded by: none\n\n'
      + record('AM-proposal', '원격 저장.', {}, 'proposed/planned'),
    'decisions/deprecated.md': '# 저장 결정\n\n- 상태: deprecated\n- 대체한 결정: none\n\n'
      + record('AM-deprecated', '이전 저장.'),
  });
  const corpus = f.load();
  const hits = search(corpus, { query: '저장', history: true, limit: 50 }).matches;
  assert.equal(hits.find(hit => hit.id === 'AM-context').decision, undefined);
  const korean = hits.find(hit => hit.id === 'AM-korean');
  assert.equal(korean.kind, 'decision');
  assert.deepEqual(korean.decision, { status: 'superseded', superseded_by: { document: 'ADR-9999', ids: [] } });
  assert.deepEqual(hits.find(hit => hit.id === 'AM-legacy').decision, { status: 'unknown', superseded_by: null });
  assert.deepEqual(hits.find(hit => hit.id === 'AM-proposal').decision, { status: 'proposed', superseded_by: null });
  assert.deepEqual(hits.find(hit => hit.id === 'AM-deprecated').decision, { status: 'deprecated', superseded_by: null });
  const readDecision = read(corpus, { ids: [korean.id] }).documents[0];
  assert.equal(readDecision.id, korean.document);
  assert.deepEqual(readDecision.decision, korean.decision);

  f.manifest.documents.push({ id: 'ADR-9999', kind: 'decision', path: 'decisions/successor.md',
    order: 5, verified_at: null, source_revision: null });
  fs.writeFileSync(f.manifestPath, JSON.stringify(f.manifest));
  fs.writeFileSync(path.join(f.architecture, 'decisions/successor.md'),
    '# 새 저장 결정\n\n- Status: accepted\n- Superseded by: none\n\n' + record('AM-successor', '새 저장 조건.'));
  const updated = read(f.load(), { ids: [korean.id], seen: readDecision.sections.map(section => section.receipt) });
  assert.equal(updated.reused, 0);
  assert.deepEqual(updated.documents[0].decision.superseded_by, { document: 'ADR-9999', ids: ['AM-successor'] });
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
