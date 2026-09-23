'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const hooksPath = path.join(repoRoot, 'hooks', 'hooks.json');
const starter = path.join(repoRoot, 'skills', 'issue-ledger', 'assets', 'state-starter');

test('SessionStart uses the global server hook and has no project dashboard refresh hook', () => {
  const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8')).hooks.SessionStart;
  const commands = hooks.flatMap((entry) => entry.hooks.flatMap((hook) => [
    hook.command,
    hook.commandWindows,
  ]));
  assert.equal(commands.length, 2);
  assert.ok(commands.every((command) => command.includes('run.js')));
  assert.equal(hooks[0].matcher, 'startup|resume|clear|compact');
  assert.equal(fs.existsSync(path.join(repoRoot, 'hooks', 'refresh-dashboard.js')), false);
});
test('new state starter creates no static dashboard and documents the global entry point', (t) => {
  assert.equal(fs.existsSync(path.join(starter, 'dashboard')), false);
  const state = fs.readFileSync(path.join(starter, 'STATE.md'), 'utf8');
  assert.match(state, /127\.0\.0\.1/);
  assert.match(state, /dashboard-server open/);
  assert.match(state, /`status`/);
  assert.match(state, /`stop`/);

  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'proofline-state-starter-'));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  fs.cpSync(starter, path.join(project, '.emeth'), { recursive: true });
  assert.equal(fs.existsSync(path.join(project, '.emeth', 'dashboard')), false);
});

test('transition sources never target an existing project dashboard', (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'proofline-existing-dashboard-'));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const dashboard = path.join(project, '.emeth', 'dashboard');
  fs.mkdirSync(dashboard, { recursive: true });
  const marker = path.join(dashboard, 'user-dashboard.txt');
  fs.writeFileSync(marker, 'preserve user dashboard', 'utf8');

  const transitionSources = [
    fs.readFileSync(hooksPath, 'utf8'),
    fs.readFileSync(path.join(starter, 'STATE.md'), 'utf8'),
  ].join('\n');
  assert.doesNotMatch(transitionSources, /copyFileSync|cpSync|refresh-dashboard\.js/);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'preserve user dashboard');
});
