'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { prepareLaunch, parseArgs } = require('../skills/start-implementation/scripts/prepare-launch.js');
const { fixture, git, MAIN_SETTINGS } = require('./helpers/implementation-fixture.js');

function options(f, extra = {}) {
  return { cwd: f.cwd, spec: 'SPEC-0001', projectRoot: f.cwd, projectId: 'saved-project',
    model: MAIN_SETTINGS.model, reasoning: MAIN_SETTINGS.reasoning, ...extra };
}

test('launch CLI yields an internal implementation guide and Spec ID and explicit local project settings without writes', t => {
  const f = fixture(t, { beforeLaunch: ({ write }) => write('uncommitted.txt', 'keep me') });
  // The Spec itself need not be committed for a local implementation session.
  f.write(f.spec, f.read(f.spec) + '\nCurrent uncommitted contract clarification.\n');
  const before = git(f.cwd, 'status', '--porcelain=v1');
  const spec = f.read(f.spec);
  const index = fs.readFileSync(path.join(f.cwd, '.git', 'index'));
  const script = path.resolve(__dirname, '../skills/start-implementation/scripts/prepare-launch.js');
  const result = spawnSync(process.execPath, [script, '--cwd', f.cwd, '--spec', 'SPEC-0001',
    '--project-root', f.cwd, '--project-id', 'saved-project', '--model', 'gpt-6-astra', '--reasoning', 'medium'],
  { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    prompt: `Read ${JSON.stringify(path.resolve(__dirname, '../skills/start-implementation/implement.md'))} and follow it to implement SPEC-0001 in this session.`, model: 'gpt-6-astra', thinking: 'medium',
    target: { type: 'project', projectId: 'saved-project', environment: { type: 'local' } },
  });
  assert.equal(git(f.cwd, 'status', '--porcelain=v1'), before);
  assert.equal(f.read(f.spec), spec);
  assert.deepEqual(fs.readFileSync(path.join(f.cwd, '.git', 'index')), index);
});

test('the request builder preserves each selected model and effort without a model fallback', t => {
  const f = fixture(t);
  for (const [model, levels] of [
    ['gpt-5.6-luna', ['high', 'xhigh']], ['gpt-5.6-sol', ['medium', 'high']],
    ['gpt-6-astra', ['low', 'medium', 'high']],
  ]) for (const reasoning of levels) {
    const result = prepareLaunch(options(f, { model, reasoning }));
    assert.equal(result.model, model);
    assert.equal(result.thinking, reasoning);
    assert.equal(result.prompt, `Read ${JSON.stringify(path.resolve(__dirname, '../skills/start-implementation/implement.md'))} and follow it to implement SPEC-0001 in this session.`);
  }
  // Availability and authorization belong to the runtime, not a baked-in model catalog.
  assert.equal(prepareLaunch(options(f, { model: 'user-selected-model' })).model, 'user-selected-model');
  assert.throws(() => prepareLaunch(options(f, { model: '' })), /Supply/);
  assert.throws(() => prepareLaunch(options(f, { reasoning: '' })), /Supply/);
});

test('missing, ambiguous, non-ready, mismatched Specs and a different project produce no request', t => {
  const f = fixture(t);
  assert.throws(() => prepareLaunch(options(f, { spec: 'SPEC-9999' })), /not found/);
  assert.throws(() => prepareLaunch(options(f, { spec: 'SPEC-0001\nextra' })), /Spec ID/);
  assert.throws(() => prepareLaunch(options(f, { projectRoot: path.dirname(f.cwd) })), /must match/);
  const original = f.read(f.spec);
  for (const state of ['draft', 'blocked', 'completed', 'cancelled', 'superseded']) {
    f.write(f.spec, original.replace('"status": "ready"', `"status": "${state}"`));
    assert.throws(() => prepareLaunch(options(f)), /must be ready/);
  }
  f.write(f.spec, original.replace('"id": "SPEC-0001"', '"id": "SPEC-0002"'));
  assert.throws(() => prepareLaunch(options(f)), /does not match/);
  f.write(f.spec, original);
  f.write('.emeth/specs/SPEC-0001-duplicate/SPEC.md', original);
  assert.throws(() => prepareLaunch(options(f)), /Ambiguous/);
  assert.throws(() => parseArgs(['--cwd', f.cwd, '--cwd', f.cwd]), /once/);
  assert.throws(() => parseArgs(['--unsupported', 'value']), /supported/);
  assert.equal(git(f.cwd, 'rev-parse', 'HEAD'), f.initialHead);
});
