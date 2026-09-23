'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnGit } = require('./git-policy.js');

const MAIN_SETTINGS = Object.freeze({ model: 'gpt-6-astra', reasoning: 'low' });
const SPEC = '.emeth/specs/SPEC-0001/SPEC.md';

function git(cwd, ...args) {
  const result = spawnGit(cwd, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout;
}

function removeFixture(directory) {
  const root = fs.realpathSync(os.tmpdir());
  const resolved = path.resolve(directory);
  const relative = path.relative(root, resolved);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'cleanup stays within the temporary directory');
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 30 });
}

function fixture(t, options = {}) {
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'proofline-implementation-test-')));
  t.after(() => removeFixture(cwd));
  const write = (name, content) => {
    const target = path.join(cwd, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  git(cwd, 'init');
  git(cwd, 'config', 'user.name', 'Emeth Discipline Test');
  git(cwd, 'config', 'user.email', 'proofline@example.invalid');
  git(cwd, 'config', 'core.autocrlf', 'false');
  const metadata = { schema_version: 2, id: 'SPEC-0001', title: 'Independent implementation fixture',
    kind: 'feature', status: 'ready', revision: 1, supersedes: [], superseded_by: null, related_issues: [] };
  write(SPEC, `---\n${JSON.stringify(metadata, null, 2)}\n---\n\nChange src/value.js to export 2. Preserve src/other.js and existing user edits. Completion: importing src/value.js returns 2; verify this with Node.\n`);
  write('src/value.js', 'module.exports = 1;\n');
  write('src/other.js', 'module.exports = "unchanged";\n');
  write('notes.txt', 'original notes\n');
  write('authority.txt', 'The requested value is 2.\n');
  write('.gitignore', 'ignored/\n');
  git(cwd, 'add', '--all');
  git(cwd, 'commit', '-m', 'fixture base');
  options.beforeLaunch?.({ cwd, write });
  const initialIndex = fs.readFileSync(path.join(cwd, '.git', 'index'));
  const initialHead = git(cwd, 'rev-parse', 'HEAD');
  return { cwd, write, spec: SPEC, initialIndex, initialHead,
    read: name => fs.readFileSync(path.join(cwd, name), 'utf8') };
}

module.exports = { fixture, git, MAIN_SETTINGS, SPEC };
