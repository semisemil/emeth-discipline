'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  MAX_RECORD_BYTES,
  parseCurrentRecord,
  parsePlanMetadata,
  parseSpecMetadata,
} = require('../dashboard/records/record-parser.js');

function makeRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-record-parser-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('Plan and Spec parsers accept only their current metadata contracts', () => {
  assert.deepEqual(parsePlanMetadata([
    'id: PLAN-0001',
    'title: "안전한: 계획"',
    'status: ready',
    'related_issues:',
    '  - PL-0001',
  ].join('\n')), {
    id: 'PLAN-0001',
    title: '안전한: 계획',
    status: 'ready',
    related_issues: ['PL-0001'],
  });
  assert.deepEqual(parsePlanMetadata([
    'id: PLAN-0002',
    'title: 독립 계획',
    'status: draft',
  ].join('\n')).related_issues, []);
  assert.equal(parsePlanMetadata([
    'id: PLAN-0003',
    "title: 'Safe ''quoted'' plan'",
    'status: ready',
  ].join('\n')).title, "Safe 'quoted' plan");
  assert.equal(parsePlanMetadata([
    'id: PLAN-0004',
    'title: -safe plain plan',
    'status: ready',
  ].join('\n')).title, '-safe plain plan');

  const spec = parseSpecMetadata(JSON.stringify({
    schema_version: 2,
    id: 'SPEC-0001',
    title: 'API',
    kind: 'feature',
    status: 'ready',
    revision: 2,
    supersedes: [],
    superseded_by: null,
    related_issues: ['PL-0001'],
  }));
  assert.equal(spec.revision, 2);

  assert.throws(
    () => parsePlanMetadata('id: PLAN-0001\ntitle: Bad\nstatus: ready\nextra: value'),
    (error) => error.code === 'record-metadata-invalid',
  );
  for (const title of [
    'null', 'A: B', "'bad'quote'", '- bad', '|', '&anchor', '*anchor', '[bad]',
  ]) {
    assert.throws(
      () => parsePlanMetadata(`id: PLAN-0001\ntitle: ${title}\nstatus: ready`),
      (error) => error.code === 'record-metadata-invalid',
    );
  }
  assert.throws(
    () => parseSpecMetadata(JSON.stringify({ ...spec, schema_version: 1 })),
    (error) => error.code === 'record-metadata-invalid',
  );
});

test('record reads enforce folder identity, strict UTF-8, body separation, and 2 MiB', (t) => {
  const root = makeRoot(t);
  const planDirectory = path.join(root, '.emeth', 'plan');
  const recordDirectory = path.join(planDirectory, 'PLAN-0001-example');
  const filePath = path.join(recordDirectory, 'PLAN.md');
  fs.mkdirSync(recordDirectory, { recursive: true });
  fs.writeFileSync(filePath, [
    '---',
    'id: PLAN-0001',
    'title: Example',
    'status: ready',
    '---',
    '# Body',
    '<script>alert(1)</script>',
  ].join('\n'), 'utf8');

  const indexed = parseCurrentRecord({
    kind: 'plan', root, directory: planDirectory, filePath,
    expectedId: 'PLAN-0001', relativePath: '.emeth/plan/PLAN-0001-example/PLAN.md',
    includeBody: false,
  });
  assert.equal(indexed.body, undefined);

  const detailed = parseCurrentRecord({
    kind: 'plan', root, directory: planDirectory, filePath,
    expectedId: 'PLAN-0001', relativePath: '.emeth/plan/PLAN-0001-example/PLAN.md',
    includeBody: true,
  });
  assert.equal(detailed.body, '# Body\n<script>alert(1)</script>');

  assert.throws(
    () => parseCurrentRecord({
      kind: 'plan', root, directory: planDirectory, filePath,
      expectedId: 'PLAN-9999', relativePath: 'bad', includeBody: false,
    }),
    (error) => error.code === 'record-id-mismatch',
  );

  fs.writeFileSync(filePath, Buffer.concat([
    Buffer.from('---\nid: PLAN-0001\ntitle: Example\nstatus: ready\n---\n', 'utf8'),
    Buffer.alloc(70 * 1024, 0x61),
    Buffer.from([0xc3, 0x28]),
  ]));
  assert.throws(
    () => parseCurrentRecord({
      kind: 'plan', root, directory: planDirectory, filePath,
      expectedId: 'PLAN-0001', relativePath: 'bad', includeBody: false, readMode: 'summary',
    }),
    (error) => error.code === 'record-invalid-utf8',
  );

  fs.writeFileSync(filePath, Buffer.alloc(MAX_RECORD_BYTES + 1, 0x20));
  assert.throws(
    () => parseCurrentRecord({
      kind: 'plan', root, directory: planDirectory, filePath,
      expectedId: 'PLAN-0001', relativePath: 'bad', includeBody: false,
    }),
    (error) => error.code === 'record-too-large',
  );
});

test('record parser rejects a canonical project root replaced by a symlink or junction', (t) => {
  const base = makeRoot(t);
  const projectRoot = path.join(base, 'project');
  const movedRoot = path.join(base, 'moved-project');
  const externalRoot = path.join(base, 'external');
  const externalDirectory = path.join(externalRoot, '.emeth', 'plan', 'PLAN-0009-external');
  const externalFile = path.join(externalDirectory, 'PLAN.md');
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(externalDirectory, { recursive: true });
  fs.writeFileSync(externalFile, '---\nid: PLAN-0009\ntitle: Secret\nstatus: ready\n---\nexternal secret', 'utf8');

  fs.renameSync(projectRoot, movedRoot);
  fs.symlinkSync(externalRoot, projectRoot, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(
    () => parseCurrentRecord({
      kind: 'plan',
      root: projectRoot,
      directory: path.join(projectRoot, '.emeth', 'plan'),
      filePath: path.join(projectRoot, '.emeth', 'plan', 'PLAN-0009-external', 'PLAN.md'),
      expectedId: 'PLAN-0009',
      relativePath: '.emeth/plan/PLAN-0009-external/PLAN.md',
      includeBody: true,
    }),
    (error) => error.code === 'project-root-replaced',
  );
});
