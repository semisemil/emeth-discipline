'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const test = require('node:test');

const pluginRoot = path.resolve(__dirname, '../plugins/emeth-discipline');
const issueCli = path.join(pluginRoot, 'skills', 'issue-ledger', 'scripts', 'issue-ledger.js');
const documentCli = path.join(pluginRoot, 'writers', 'document-writer.js');
const { getRegistryPath } = require('../plugins/emeth-discipline/dashboard/registry.js');

function makeFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-writer-'));
  const projectRoot = path.join(root, 'project');
  const issuesRoot = path.join(projectRoot, '.emeth', 'issues');
  const configRoot = path.join(root, 'config');
  fs.mkdirSync(issuesRoot, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = process.platform === 'win32'
    ? { ...process.env, APPDATA: configRoot }
    : { ...process.env, XDG_CONFIG_HOME: configRoot };
  return { root, projectRoot, issuesRoot, configRoot, env };
}

function makeIssue() {
  return {
    schema_version: 2,
    identity: {
      id: 'PL-0001', aliases: [], type: 'task', mode: 'simple', title: '등록 테스트', risk: 'low'
    },
    origin: { kind: 'request', summary: 'writer 등록 검증', refs: [] },
    state: { status: 'open', current_summary: '작성 대기', next_action: '작성한다' },
    objective: { summary: '성공한 쓰기 뒤 프로젝트 등록', constraints: [] },
    criteria: [{ id: 'C1', text: '프로젝트가 등록된다', evidence_refs: [] }],
    relations: [], context: [], artifacts: [], evidence: [], events: [],
    created_at: '2026-08-17T00:00:00.000Z',
    updated_at: '2026-08-17T00:00:00.000Z'
  };
}

function planContent(values = {}) {
  const newline = values.newline || '\n';
  return [
    '---',
    'id: PLAN-0001',
    'title: 자유 형식 Plan',
    `status: ${values.status || 'draft'}`,
    '---',
    '',
    '# 모델이 선택한 제목',
    '',
    values.body || '| 자유 | 형식 |\n| --- | --- |\n| 표 | 유지 |\n\n```mermaid\ngraph LR\n  A --> B\n```',
    '',
  ].join(newline);
}

function specContent(values = {}) {
  const metadata = {
    schema_version: 2,
    id: 'SPEC-0001',
    title: '자유 형식 Spec',
    kind: 'feature',
    status: values.status || 'draft',
    revision: values.revision || 1,
    supersedes: [],
    superseded_by: null,
    related_issues: values.relatedIssues || [],
  };
  return `---\n${JSON.stringify(metadata, null, 2)}\n---\n\n${values.body || '# 모델이 고른 구조\n\n본문을 writer가 바꾸지 않는다.'}\n`;
}

const documents = {
  plan: {
    kind: 'plan',
    relativePath: '.emeth/plan/PLAN-0001-free/PLAN.md',
    content: planContent({ newline: '\r\n' }),
  },
  spec: {
    kind: 'spec',
    relativePath: '.emeth/specs/SPEC-0001-free/SPEC.md',
    content: specContent(),
  },
};

function runIssue(args, env) {
  return spawnSync(process.execPath, [issueCli, ...args], { encoding: 'utf8', env });
}

function runDocument(fixture, document, options = {}) {
  const args = [
    documentCli,
    'write',
    '--kind', document.kind,
    '--project-root', options.projectRoot ?? fixture.projectRoot,
    '--relative-path', document.relativePath,
  ];
  if (options.changeKind) {
    args.push('--change-kind', options.changeKind);
  }
  return spawnSync(process.execPath, args, {
    encoding: 'utf8',
    env: fixture.env,
    cwd: options.cwd,
    input: options.content === undefined ? document.content : options.content,
  });
}

function documentPath(fixture, document) {
  return path.join(fixture.projectRoot, ...document.relativePath.split('/'));
}

function registry(fixture) {
  return JSON.parse(fs.readFileSync(getRegistryPath({ env: fixture.env }), 'utf8'));
}

test('Design writer resolves a relative project root from the CLI working directory', (t) => {
  const fixture = makeFixture(t);
  const document = {
    kind: 'design',
    relativePath: '.emeth/designs/DESIGN-0001-free/DESIGN.md',
    content: specContent().replace('SPEC-0001', 'DESIGN-0001'),
  };
  const result = runDocument(fixture, document, { projectRoot: 'project', cwd: fixture.root });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).write.status, 'created');
  assert.deepEqual(fs.readFileSync(documentPath(fixture, document)), Buffer.from(document.content));
  assert.equal(registry(fixture).projects[0].root, fs.realpathSync(fixture.projectRoot));
});

test('document writer rejects empty and nonexistent project roots without writing or registering', (t) => {
  const fixture = makeFixture(t);
  for (const projectRoot of ['', 'missing-project']) {
    const result = runDocument(fixture, documents.plan, { projectRoot, cwd: fixture.root });
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).error.code, 'project-root-invalid');
  }
  assert.equal(fs.existsSync(documentPath(fixture, documents.plan)), false);
  assert.equal(fs.existsSync(path.join(fixture.root, 'missing-project')), false);
  assert.equal(fs.existsSync(getRegistryPath({ env: fixture.env })), false);
});

test('Issue create registers only after the file write succeeds', (t) => {
  const fixture = makeFixture(t);
  const input = path.join(fixture.root, 'issue.json');
  fs.writeFileSync(input, JSON.stringify(makeIssue()), 'utf8');
  const result = runIssue(['create', '--input', input, '--root', fixture.issuesRoot], fixture.env);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(fixture.issuesRoot, 'PL-0001.json')), true);
  assert.match(result.stderr, /registration: .*"status":"registered"/);
  assert.equal(registry(fixture).projects[0].root, fs.realpathSync(fixture.projectRoot));
});
test('Issue create from a template assigns IDs and timestamps and starts a missing default store', (t) => {
  const fixture = makeFixture(t);
  fs.rmSync(fixture.issuesRoot, { recursive: true });
  fs.mkdirSync(path.join(fixture.projectRoot, '.emeth', 'designs'));
  const template = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'skills/issue-ledger/assets/templates/issue-objective.json'), 'utf8'));
  const filled = JSON.parse(JSON.stringify(template).replace(/REPLACE: [^"]*/g, '템플릿 값'));
  const input = path.join(fixture.root, 'issue.json');
  fs.writeFileSync(input, JSON.stringify(filled), 'utf8');
  const run = () => spawnSync(process.execPath, [issueCli, 'create', '--input', input], { cwd: fixture.projectRoot, encoding: 'utf8', env: fixture.env });

  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.ok(first.stdout.trim().endsWith('PL-0001.json'));
  const created = JSON.parse(fs.readFileSync(path.join(fixture.issuesRoot, 'PL-0001.json'), 'utf8'));
  assert.equal(created.identity.id, 'PL-0001');
  assert.ok(!Number.isNaN(Date.parse(created.created_at)));
  assert.equal(created.updated_at, created.created_at);
  assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.emeth', 'STATE.md')), true);
  assert.equal(run().stdout.trim().endsWith('PL-0002.json'), true);
});

function templateInput(fixture, name = 'issue.json') {
  const template = fs.readFileSync(path.join(pluginRoot, 'skills/issue-ledger/assets/templates/issue-objective.json'), 'utf8');
  const input = path.join(fixture.root, name);
  fs.writeFileSync(input, template.replace(/REPLACE: [^"]*/g, '템플릿 값'), 'utf8');
  return input;
}

test('a template Issue gets an ID above IDs stored in differently named Issue files', (t) => {
  const fixture = makeFixture(t);
  fs.writeFileSync(path.join(fixture.issuesRoot, 'existing-task.json'), `${JSON.stringify(makeIssue(), null, 2)}\n`, 'utf8');
  const result = runIssue(['create', '--input', templateInput(fixture), '--root', fixture.issuesRoot], fixture.env);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.trim().endsWith('PL-0002.json'));
});

test('concurrent template creates each publish a distinct complete Issue', async (t) => {
  const fixture = makeFixture(t);
  const input = templateInput(fixture);
  const count = 12;
  const runs = await Promise.all(Array.from({ length: count }, () => new Promise((resolve) => {
    const child = spawn(process.execPath, [issueCli, 'create', '--input', input, '--root', fixture.issuesRoot],
      { env: fixture.env, windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stderr }));
  })));
  assert.deepEqual(runs.filter((run) => run.status !== 0), []);
  const files = fs.readdirSync(fixture.issuesRoot).filter((name) => name.endsWith('.json')).sort();
  assert.deepEqual(files, Array.from({ length: count }, (_, index) => `PL-${String(index + 1).padStart(4, '0')}.json`));
  for (const name of files) assert.equal(JSON.parse(fs.readFileSync(path.join(fixture.issuesRoot, name), 'utf8')).identity.id, name.slice(0, -5));
});

test('a create lock left by an exited process does not block Issue creation', (t) => {
  const exitedPid = JSON.stringify({ pid: spawnSync(process.execPath, ['-e', '']).pid });
  for (const leaveLock of [
    (lock) => { fs.mkdirSync(lock); fs.writeFileSync(path.join(lock, 'owner.json'), exitedPid, 'utf8'); },
    (lock) => fs.writeFileSync(lock, exitedPid, 'utf8') // earlier lock format
  ]) {
    const fixture = makeFixture(t);
    const lock = path.join(fixture.issuesRoot, '.create.lock');
    leaveLock(lock);
    const result = runIssue(['create', '--input', templateInput(fixture), '--root', fixture.issuesRoot], fixture.env);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(fs.readdirSync(fixture.issuesRoot).filter((name) => name.startsWith('.')), []);
  }
});

test('Design lock recovery preserves a live successor and the saved document', async (t) => {
  const fixture = makeFixture(t);
  const relativePath = '.emeth/designs/DESIGN-0001-free/DESIGN.md';
  const file = path.join(fixture.projectRoot, relativePath);
  const source = specContent().replace('SPEC-0001', 'DESIGN-0001');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
  const lock = path.join(fixture.projectRoot, '.emeth', '.design-write.lock');
  fs.writeFileSync(lock, '2147483647');
  const options = { project_root: fixture.projectRoot, kind: 'design', relative_path: relativePath, memory: 'off' };
  // Two acquisition windows allow process coordination around the shared lock's five-second wait.
  const timeout = 2 * 5000;
  const waitFor = (...names) => {
    const deadline = Date.now() + timeout;
    while (!names.some(name => fs.existsSync(path.join(fixture.root, name)))) {
      assert.ok(Date.now() < deadline, 'Design lock coordination timed out');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  };
  const workerSource = `
    const fs = require('node:fs'), path = require('node:path');
    const [writer, root, lock, options, source, timeout] = process.argv.slice(1);
    const write = fs.writeFileSync;
    function waitFor(name) {
      const deadline = Date.now() + Number(timeout);
      while (!fs.existsSync(path.join(root, name))) {
        if (Date.now() >= deadline) throw Error('Design worker coordination timed out');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
      }
    }
    fs.writeFileSync = (file, ...args) => {
      const result = write(file, ...args);
      if (file === lock) { write(path.join(root, 'entered'), 'entered'); waitFor('release'); }
      return result;
    };
    write(path.join(root, 'ready'), 'ready'); waitFor('start');
    let result;
    try { result = { status: require(writer).writeDocument(JSON.parse(options), Buffer.from(source)).write.status }; }
    catch (error) { result = { error: error.code }; }
    write(path.join(root, 'result.json'), JSON.stringify(result));
  `;
  const worker = spawn(process.execPath, ['-e', workerSource, documentCli, fixture.root, lock,
    JSON.stringify(options), source, String(timeout)], { env: fixture.env, windowsHide: true, stdio: 'ignore' });
  const completed = new Promise((resolve, reject) => { worker.once('exit', resolve); worker.once('error', reject); });
  const read = fs.readFileSync;
  let interleaved = false;
  try {
    waitFor('ready');
    fs.readFileSync = (file, ...args) => {
      const result = read(file, ...args);
      if (!interleaved && file === lock) {
        interleaved = true;
        fs.writeFileSync(path.join(fixture.root, 'start'), 'start');
        waitFor('entered', 'result.json');
      }
      return result;
    };
    const result = require(documentCli).writeDocument(options, Buffer.from(source));
    fs.readFileSync = read;
    const overlap = fs.existsSync(path.join(fixture.root, 'entered')) && !fs.existsSync(path.join(fixture.root, 'result.json'));
    fs.writeFileSync(path.join(fixture.root, 'release'), 'release');
    assert.equal(await completed, 0);
    const successor = JSON.parse(fs.readFileSync(path.join(fixture.root, 'result.json'), 'utf8'));
    assert.equal(interleaved, true);
    assert.equal(overlap, false, 'A live successor still owns the Design lock');
    assert.ok(successor.status === 'no-op' || successor.error === 'document-locked', JSON.stringify(successor));
    assert.equal(result.write.status, 'no-op');
    assert.equal(fs.readFileSync(file, 'utf8'), source);
  } finally {
    fs.readFileSync = read;
    if (worker.exitCode === null) worker.kill();
    await completed;
  }
});

test('Issue write failure does not register the project', (t) => {
  const fixture = makeFixture(t);
  const input = path.join(fixture.root, 'issue.json');
  const issue = makeIssue();
  issue.identity.id = `PL-${'1'.repeat(300)}`;
  fs.writeFileSync(input, JSON.stringify(issue), 'utf8');
  const result = runIssue(['create', '--input', input, '--root', fixture.issuesRoot], fixture.env);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /ENOENT|ENAMETOOLONG|name too long|filename or extension is too long/i);
  assert.equal(fs.existsSync(getRegistryPath({ env: fixture.env })), false);
});

test('registration failure stays separate from a successful Issue write', (t) => {
  const fixture = makeFixture(t);
  const input = path.join(fixture.root, 'issue.json');
  const registryPath = getRegistryPath({ env: fixture.env });
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, '{bad json', 'utf8');
  fs.writeFileSync(input, JSON.stringify(makeIssue()), 'utf8');

  const result = runIssue(['create', '--input', input, '--root', fixture.issuesRoot], fixture.env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(fixture.issuesRoot, 'PL-0001.json')), true);
  assert.match(result.stderr, /registration-failed: .*"code":"registry-invalid"/);
  assert.equal(fs.readFileSync(registryPath, 'utf8'), '{bad json');
});

test('Issue link-work no-op does not register or rewrite', (t) => {
  const fixture = makeFixture(t);
  const issue = makeIssue();
  issue.state.current_summary = 'Spec 연결됨';
  issue.state.next_action = '구현한다';
  issue.context = [{ kind: 'Spec', location: '.emeth/specs/SPEC-0001-example/SPEC.md' }];
  const issuePath = path.join(fixture.issuesRoot, 'PL-0001.json');
  const specPath = path.join(fixture.projectRoot, '.emeth', 'specs', 'SPEC-0001-example', 'SPEC.md');
  fs.mkdirSync(path.dirname(specPath), { recursive: true });
  fs.writeFileSync(issuePath, `${JSON.stringify(issue, null, 2)}\n`, 'utf8');
  fs.writeFileSync(specPath, specContent({ relatedIssues: ['PL-0001'] }), 'utf8');
  const before = fs.readFileSync(issuePath, 'utf8');

  const result = runIssue([
    'link-work', 'PL-0001', '--kind', 'spec', '--work-id', 'SPEC-0001',
    '--path', '.emeth/specs/SPEC-0001-example/SPEC.md',
    '--current-summary', 'Spec 연결됨', '--next-action', '구현한다',
    '--updated-at', '2026-08-17T01:00:00.000Z', '--root', fixture.issuesRoot,
    '--project-root', fixture.projectRoot
  ], fixture.env);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^no-op:/);
  assert.equal(fs.readFileSync(issuePath, 'utf8'), before);
  assert.equal(fs.existsSync(getRegistryPath({ env: fixture.env })), false);
});

for (const document of Object.values(documents)) {
  test(`${document.kind} writer preserves the complete source bytes and registers after create`, (t) => {
    const fixture = makeFixture(t);
    const result = runDocument(fixture, document);

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.write.status, 'created');
    assert.equal(output.registration.status, 'registered');
    assert.deepEqual(fs.readFileSync(documentPath(fixture, document)), Buffer.from(document.content));
    assert.equal(registry(fixture).projects[0].root, fs.realpathSync(fixture.projectRoot));
  });
}

test("plan no-op neither rewrites nor registers", (t) => {
    const document = documents.plan;
    const fixture = makeFixture(t);
    const target = documentPath(fixture, document);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, document.content, 'utf8');
    const before = fs.statSync(target).mtimeMs;
    const result = runDocument(fixture, document);

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.write.status, 'no-op');
    assert.equal(output.registration, null);
    assert.equal(fs.statSync(target).mtimeMs, before);
    assert.equal(fs.existsSync(getRegistryPath({ env: fixture.env })), false);
  });

test("plan invalid envelope writes nothing and does not register", (t) => {
    const document = documents.plan;
    const fixture = makeFixture(t);
    const result = runDocument(fixture, document, { content: '# frontmatter 없음\n' });

    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).error.code, 'record-metadata-invalid');
    assert.equal(fs.existsSync(documentPath(fixture, document)), false);
    assert.equal(fs.existsSync(getRegistryPath({ env: fixture.env })), false);
  });

test("spec registration failure preserves the successful document write", (t) => {
    const document = documents.spec;
    const fixture = makeFixture(t);
    const registryPath = getRegistryPath({ env: fixture.env });
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, '{bad json', 'utf8');
    const result = runDocument(fixture, document);

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.write.status, 'created');
    assert.equal(output.registration.status, 'failed');
    assert.equal(output.registration.error.code, 'registry-invalid');
    assert.deepEqual(fs.readFileSync(documentPath(fixture, document)), Buffer.from(document.content));
    assert.equal(fs.readFileSync(registryPath, 'utf8'), '{bad json');
  });

test('Plan update preserves free-form body and registers without revision machinery', (t) => {
  const fixture = makeFixture(t);
  const document = documents.plan;
  const target = documentPath(fixture, document);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, document.content, 'utf8');
  const next = planContent({ status: 'ready', body: '## 완전히 다른 자유 구조\n\n문장 그대로.' });

  const result = runDocument(fixture, document, { content: next });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).write.status, 'updated');
  assert.equal(fs.readFileSync(target, 'utf8'), next);
  assert.equal(fs.existsSync(path.join(path.dirname(target), 'revisions')), false);
});

test('Spec major update snapshots exact previous bytes and increments once', (t) => {
  const fixture = makeFixture(t);
  const document = documents.spec;
  const target = documentPath(fixture, document);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, document.content, 'utf8');
  const next = specContent({ revision: 2, body: '## 새 계약\n\n자유로운 본문.' });

  const result = runDocument(fixture, document, { content: next, changeKind: 'major' });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.write.status, 'updated');
  assert.deepEqual(output.write.snapshot, {
    status: 'created',
    path: '.emeth/specs/SPEC-0001-free/revisions/REV-1.md',
  });
  assert.equal(fs.readFileSync(target, 'utf8'), next);
  assert.equal(
    fs.readFileSync(path.join(path.dirname(target), 'revisions', 'REV-1.md'), 'utf8'),
    document.content
  );
});

test('Spec operational update keeps revision and creates no snapshot', (t) => {
  const fixture = makeFixture(t);
  const document = documents.spec;
  const target = documentPath(fixture, document);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, document.content, 'utf8');
  const next = specContent({ revision: 1, status: 'ready', body: '# 같은 계약\n\n상태만 변경.' });

  const result = runDocument(fixture, document, { content: next, changeKind: 'operational' });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.write.revision, 1);
  assert.equal(output.write.snapshot, null);
  assert.equal(fs.existsSync(path.join(path.dirname(target), 'revisions')), false);
});

test('Spec invalid revision and snapshot conflict preserve the current document', (t) => {
  const fixture = makeFixture(t);
  const document = documents.spec;
  const target = documentPath(fixture, document);
  const revisions = path.join(path.dirname(target), 'revisions');
  fs.mkdirSync(revisions, { recursive: true });
  fs.writeFileSync(target, document.content, 'utf8');

  const invalidRevision = runDocument(fixture, document, {
    content: specContent({ revision: 3 }), changeKind: 'major'
  });
  assert.equal(invalidRevision.status, 1);
  assert.equal(JSON.parse(invalidRevision.stderr).error.code, 'spec-revision-invalid');
  assert.equal(fs.readFileSync(target, 'utf8'), document.content);

  fs.writeFileSync(path.join(revisions, 'REV-1.md'), '다른 snapshot', 'utf8');
  const conflict = runDocument(fixture, document, {
    content: specContent({ revision: 2 }), changeKind: 'major'
  });
  assert.equal(conflict.status, 1);
  assert.equal(JSON.parse(conflict.stderr).error.code, 'snapshot-conflict');
  assert.equal(fs.readFileSync(target, 'utf8'), document.content);
  assert.equal(fs.existsSync(getRegistryPath({ env: fixture.env })), false);
});

test('document writer rejects paths outside the canonical Plan and Spec locations', (t) => {
  const fixture = makeFixture(t);
  const result = runDocument(fixture, {
    ...documents.plan,
    relativePath: '.emeth/plan/../outside/PLAN.md',
  });

  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).error.code, 'document-path-invalid');
  assert.equal(fs.existsSync(getRegistryPath({ env: fixture.env })), false);
});

test('document writer does not register after a filesystem write failure', (t) => {
  const fixture = makeFixture(t);
  const result = runDocument(fixture, {
    ...documents.plan,
    relativePath: `.emeth/plan/PLAN-0001-${'x'.repeat(300)}/PLAN.md`,
  });

  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).error.code, 'document-write-failed');
  assert.equal(fs.existsSync(getRegistryPath({ env: fixture.env })), false);
});

test('document writer rejects a linked .emeth directory without writing outside the project', (t) => {
  const fixture = makeFixture(t);
  const emeth = path.join(fixture.projectRoot, '.emeth');
  const external = path.join(fixture.root, 'external');
  fs.rmSync(emeth, { recursive: true, force: true });
  fs.mkdirSync(external);
  try {
    fs.symlinkSync(external, emeth, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      t.skip(`링크 생성 권한 없음: ${error.code}`);
      return;
    }
    throw error;
  }

  const result = runDocument(fixture, documents.plan);

  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).error.code, 'document-path-link');
  assert.equal(fs.readdirSync(external).length, 0);
  assert.equal(fs.existsSync(getRegistryPath({ env: fixture.env })), false);
});

test('a failed document replacement preserves the original bytes and does not register the project', (t) => {
  const fixture = makeFixture(t);
  const target = documentPath(fixture, documents.plan);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, documents.plan.content);
  const source = `
    const fs = require('node:fs');
    const rename = fs.renameSync;
    fs.renameSync = (from, to) => {
      if (to === process.argv[2]) throw Object.assign(new Error('disk failure'), { code: 'EIO' });
      return rename(from, to);
    };
    require(process.argv[1]).main(process.argv.slice(3));
  `;
  const result = spawnSync(process.execPath, ['-e', source, documentCli, target,
    'write', '--kind', 'plan', '--project-root', fixture.projectRoot,
    '--relative-path', documents.plan.relativePath], {
    env: fixture.env, encoding: 'utf8', input: planContent({ body: 'Replacement body' }),
  });
  assert.equal(result.status, 1, result.stdout);
  assert.equal(JSON.parse(result.stderr).error.code, 'document-write-failed');
  assert.deepEqual(fs.readFileSync(target), Buffer.from(documents.plan.content));
  assert.equal(fs.existsSync(getRegistryPath({ env: fixture.env })), false);
});
