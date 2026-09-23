'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { parseDesignMetadata, parseFrontmatter } = require('../dashboard/records/record-parser.js');
const root = path.resolve(__dirname, '..');

test('create generates valid metadata and allocates IDs from body-only input', t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'proofline-create-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const project = path.join(temporary, 'project');
  fs.mkdirSync(project);
  const body = '# 알림\n\n성공하면 ID를 반환한다.\n';
  const create = (extra = []) => {
    const result = spawnSync(process.execPath, [path.join(root, 'writers/document-writer.js'), 'create',
      '--project-root', project, '--title', '알림 설계', '--slug', 'notification', '--memory', 'off', ...extra],
    { input: body, encoding: 'utf8', windowsHide: true,
      env: { ...process.env, APPDATA: path.join(temporary, 'config'), XDG_CONFIG_HOME: path.join(temporary, 'config') } });
    return { status: result.status, value: JSON.parse(result.status === 0 ? result.stdout : result.stderr) };
  };
  for (const id of ['DESIGN-0001', 'DESIGN-0002']) {
    const result = create();
    assert.equal(result.status, 0, JSON.stringify(result.value));
    assert.equal(result.value.write.id, id);
    assert.equal(result.value.memory.status, 'disabled');
    assert.notEqual(result.value.registration.status, 'failed');
    const source = fs.readFileSync(path.join(project, result.value.write.path), 'utf8');
    const frontmatter = parseFrontmatter(source);
    assert.deepEqual(parseDesignMetadata(frontmatter.metadataText), {
      schema_version: 2, id, title: '알림 설계', kind: 'feature', status: 'draft', revision: 1,
      supersedes: [], superseded_by: null, related_issues: [],
    });
    assert.ok(source.endsWith(body));
  }
  const original = fs.readFileSync(path.join(project, '.emeth/designs/DESIGN-0001-notification/DESIGN.md'));
  assert.equal(create(['--id', 'DESIGN-0001']).value.error.code, 'document-exists');
  assert.deepEqual(fs.readFileSync(path.join(project, '.emeth/designs/DESIGN-0001-notification/DESIGN.md')), original);
  assert.equal(create(['--kind', 'unknown']).status, 1);
  assert.equal(fs.existsSync(path.join(project, '.emeth/designs/DESIGN-0003-notification')), false);
  const ready = create(['--id', 'DESIGN-0010', '--kind', 'bug', '--status', 'ready']);
  assert.equal(ready.status, 0);
  const parsed = parseFrontmatter(fs.readFileSync(path.join(project, ready.value.write.path), 'utf8'));
  assert.equal(parseDesignMetadata(parsed.metadataText).kind, 'bug');
  assert.equal(parseDesignMetadata(parsed.metadataText).status, 'ready');
  assert.equal(create().value.write.id, 'DESIGN-0011');
});

test('current design, review and execution references resolve to existing local files', () => {
  for (const name of ['development-design', 'tenet-me', 'figure-it-out', 'start-implementation', 'start-parallel-implementation']) {
    const file = path.join(root, 'skills', name, 'SKILL.md');
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\]\(([^)]+\.(?:md|js))(?:#[^)]*)?\)/g)) {
      assert.ok(fs.statSync(path.resolve(path.dirname(file), match[1])).isFile(), `${name}: ${match[1]}`);
    }
  }
});
