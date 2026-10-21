'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { parseCurrentRecord } = require('../plugins/emeth-discipline/dashboard/records/record-parser.js');

function makeRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-record-parser-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

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
