const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const hookPath = path.join(repoRoot, 'hooks', 'run.js');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proofline-number-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function touch(root, relativePath) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, '', 'utf8');
}

function runHook(root, prompt) {
  return spawnSync(process.execPath, [hookPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: root,
      USERPROFILE: root,
    },
    input: JSON.stringify({
      hook_event_name: 'UserPromptSubmit',
      cwd: root,
      prompt,
    }),
  });
}

function context(result) {
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.systemMessage, undefined);
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  return parsed.hookSpecificOutput.additionalContext;
}

test('unrelated prompts and non-invocation mentions emit zero stdout bytes', (t) => {
  const root = fixture(t);
  for (const prompt of [
    'Register an issue.',
    'Please use $emeth-discipline:issue-ledger for this.',
    'Compare $emeth-discipline:development-plan and another skill.',
  ]) {
    const result = runHook(root, prompt);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(Buffer.byteLength(result.stdout), 0);
  }
});

test('issue-ledger receives the next issue number from issue filenames', (t) => {
  const root = fixture(t);
  touch(root, '.emeth/issues/PL-0002.json');
  touch(root, '.emeth/issues/PL-0012-old.md');
  touch(root, '.emeth/issues/not-an-issue.json');

  assert.equal(
    context(runHook(root, '$emeth-discipline:issue-ledger\nRegister this work.')),
    'Next issue number: PL-0013',
  );
});

test('development-design receives the next number from Design directories', (t) => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, '.emeth/designs/DESIGN-0004-response-modes'), { recursive: true });
  fs.mkdirSync(path.join(root, '.emeth/designs/DESIGN-0020-another'), { recursive: true });

  assert.equal(
    context(runHook(root, '  $emeth-discipline:development-design   \nDevelop a design.')),
    'Next design number: DESIGN-0021',
  );
});

test('Design numbering grows beyond four digits and starts at one for a new project', (t) => {
  const populated = fixture(t);
  fs.mkdirSync(path.join(populated, '.emeth/designs/DESIGN-9999-roadmap'), { recursive: true });
  assert.equal(
    context(runHook(populated, '$emeth-discipline:development-design\nDevelop a design.')),
    'Next design number: DESIGN-10000',
  );

  const empty = fixture(t);
  assert.equal(
    context(runHook(empty, '$emeth-discipline:development-design')),
    'Next design number: DESIGN-0001',
  );
});

test('figure-it-out receives only a Design number independent of legacy document numbering', (t) => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, '.emeth/plan/PLAN-0003-roadmap'), { recursive: true });
  fs.mkdirSync(path.join(root, '.emeth/specs/SPEC-0011-settings'), { recursive: true });

  assert.equal(
    context(runHook(root, '$emeth-discipline:figure-it-out\nTake this change through implementation.')),
    'Next design number: DESIGN-0001',
  );
});

test('a numbering read failure is logged and leaves the skill able to fall back', (t) => {
  const root = fixture(t);
  touch(root, '.emeth/issues');
  const result = runHook(root, '$emeth-discipline:issue-ledger');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(Buffer.byteLength(result.stdout), 0);

  const logPath = path.join(root, '.codex', 'log', 'proofline-hook.log');
  const entry = JSON.parse(fs.readFileSync(logPath, 'utf8').trim());
  assert.equal(entry.hook, 'next-document-number');
  assert.equal(entry.event, 'UserPromptSubmit');
  assert.match(entry.filePath, /\.emeth[\\/]issues$/);
});
