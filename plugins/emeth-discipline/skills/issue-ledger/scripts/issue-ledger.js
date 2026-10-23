#!/usr/bin/env node

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { withFileLock } = require('../../../lib/file-lock');
const { migrateProject, rewritePaths } = require('../../../lib/storage-migration');
const path = require('node:path');
const model = require('../lib/issue-model.js');
const { registerProject } = require('../../../dashboard/registry.js');
const {
  parseFrontmatter,
  parsePlanMetadata,
  parseSpecMetadata,
  parseDesignMetadata,
} = require('../../../dashboard/records/record-parser.js');

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { _: [] };

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith('--')) {
      options._.push(value);
      continue;
    }

    const key = value.slice(2).replace(/-/g, '_');
    const next = rest[index + 1];
    if (next === undefined || next.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = next;
      index += 1;
    }
  }

  return { command, options };
}

function resolveIssuesRoot(value) {
  const root = path.resolve(value || path.join(process.cwd(), '.emeth', 'issues'));
  const store = path.dirname(root);
  if (path.basename(root) === 'issues' && ['.proofline', '.emeth'].includes(path.basename(store))) {
    return path.join(migrateProject(path.dirname(store)), 'issues');
  }
  return root;
}

function assertIssuesRoot(root) {
  if (!fs.existsSync(root)) {
    fail(`이슈 디렉터리가 없습니다: ${root}`);
  }
  if (!fs.statSync(root).isDirectory()) {
    fail(`이슈 경로가 디렉터리가 아닙니다: ${root}`);
  }
}

function listIssueFiles(root) {
  assertIssuesRoot(root);
  return fs.readdirSync(root)
    .filter(model.isIssueFileName)
    .map((fileName) => path.join(root, fileName))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function readIssue(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return model.parseIssueContent(content, path.basename(filePath));
}

function readAllIssues(root) {
  const issues = [];
  const errors = [];

  for (const filePath of listIssueFiles(root)) {
    try {
      issues.push(readIssue(filePath));
    } catch (error) {
      errors.push(`${path.basename(filePath)}: ${error.message}`);
    }
  }

  return { issues, errors };
}

function findIssue(root, id) {
  const matches = listIssueFiles(root).filter((filePath) => {
    try {
      return readIssue(filePath).id === id;
    } catch {
      return false;
    }
  });

  if (matches.length === 0) {
    fail(`이슈를 찾지 못했습니다: ${id}`);
  }
  if (matches.length > 1) {
    fail(`같은 ID의 이슈 파일이 여러 개입니다: ${id}`);
  }
  return matches[0];
}

function loadJsonFile(filePath, label) {
  if (!filePath) {
    fail(`${label} JSON 파일 경로가 필요합니다.`);
  }
  try {
    return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  } catch (error) {
    fail(`${label} JSON을 읽지 못했습니다: ${error.message}`);
  }
}

function containsLinkWork(operation) {
  return operation?.type === 'link_work'
    || (operation?.type === 'batch'
      && Array.isArray(operation.operations)
      && operation.operations.some((item) => item?.type === 'link_work'));
}

function requireOption(options, key, label) {
  const value = options[key];
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label} 값이 필요합니다.`);
  }
  return value;
}

function validateWorkBacklink(issueId, work, projectRoot) {
  const artifactPath = work.kind === 'design'
    ? require('../../../lib/document-roots.js').designTarget(projectRoot, work.location.replace(/\\/g, '/'))
    : path.resolve(projectRoot, work.location.replace(/\\/g, '/'));
  const label = ({ design: 'Design', plan: 'Plan', spec: 'Spec' })[work.kind];
  if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) {
    fail(`연결할 ${label} 문서가 없습니다: ${artifactPath}`);
  }
  const content = fs.readFileSync(artifactPath, 'utf8');
  let metadata;
  try {
    const { metadataText } = parseFrontmatter(content);
    metadata = work.kind === 'plan'
      ? parsePlanMetadata(metadataText)
      : work.kind === 'design' ? parseDesignMetadata(metadataText) : parseSpecMetadata(metadataText);
  } catch (error) {
    fail(error.message);
  }
  if (metadata.id !== work.id) {
    fail(`${label} 문서 ID가 일치하지 않습니다: ${metadata.id || '(없음)'}`);
  }
  if (!metadata.related_issues.includes(issueId)) {
    fail(`${work.id} related_issues에서 ${issueId}을 찾지 못했습니다.`);
  }
}

function writeV2Issue(filePath, issue) {
  const resolved = path.resolve(filePath);
  if (path.extname(resolved) !== '.json') {
    fail('v2 구조화 갱신은 .json 파일에서만 허용됩니다.');
  }
  fs.writeFileSync(resolved, model.serializeIssue(issue), 'utf8');
}

function resolveProjectRoot(issuesRoot, explicitProjectRoot) {
  if (typeof explicitProjectRoot === 'string' && explicitProjectRoot.trim() !== '') {
    return path.resolve(explicitProjectRoot);
  }
  const emethRoot = path.dirname(issuesRoot);
  if (path.basename(issuesRoot) === 'issues' && path.basename(emethRoot) === '.emeth') {
    return path.dirname(emethRoot);
  }
  return process.cwd();
}

function registerWrittenProject(issuesRoot, explicitProjectRoot) {
  const projectRoot = resolveProjectRoot(issuesRoot, explicitProjectRoot);
  try {
    console.error(`registration: ${JSON.stringify(registerProject(projectRoot))}`);
  } catch (error) {
    console.error(`registration-failed: ${JSON.stringify({
      error: {
        code: error.code || 'registration-failed',
        message: error.message
      }
    })}`);
  }
}

function commandList(options) {
  const root = resolveIssuesRoot(options.root);
  const { issues, errors } = readAllIssues(root);
  if (errors.length) {
    errors.forEach((error) => console.error(`warning: ${error}`));
  }

  const query = String(options.search || '').toLowerCase();
  const visible = issues
    .filter((issue) => options.all || model.activeStatuses.has(issue.status))
    .filter((issue) => !query || issue.searchText.includes(query))
    .sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }));

  visible.forEach((issue) => console.log(`${issue.id}\t${issue.status}\t${issue.title}`));
}

function commandShow(options) {
  const [id] = options._;
  if (!id) {
    fail('show 명령에는 이슈 ID가 필요합니다.');
  }
  const root = resolveIssuesRoot(options.root);
  const issue = readIssue(findIssue(root, id));

  if (options.evidence) {
    const ids = String(options.evidence).split(',').map((value) => value.trim()).filter(Boolean);
    const selected = issue.evidence.filter((item) => ids.includes(item.id));
    if (selected.length !== ids.length) {
      const found = new Set(selected.map((item) => item.id));
      fail(`evidence를 찾지 못했습니다: ${ids.filter((idValue) => !found.has(idValue)).join(', ')}`);
    }
    selected.forEach((item) => {
      console.log(`[${issue.id}#${item.id}] ${item.kind} | ${item.location}`);
      console.log(`observation: ${item.observation}`);
      if (item.observedAt) {
        console.log(`observed_at: ${item.observedAt}`);
      }
    });
    return;
  }

  if (options.events) {
    issue.events.forEach((event) => console.log(`${event.id}\t${event.kind}\t${event.at}\t${event.summary}`));
    return;
  }

  process.stdout.write(model.buildBrief(issue));
}

function validateRelations(issues) {
  const errors = [];
  const ids = new Set(issues.map((issue) => issue.id));
  const parentEdges = new Map();

  for (const issue of issues) {
    if (issue.schemaVersion !== 2) {
      continue;
    }
    for (const relation of issue.relations) {
      if (!ids.has(relation.target)) {
        errors.push(`${issue.id}: 존재하지 않는 관계 대상 ${relation.target}`);
      }
      if (relation.type === 'child_of') {
        parentEdges.set(issue.id, relation.target);
      }
    }
    for (const milestone of issue.milestones) {
      for (const target of milestone.issueRefs) {
        if (!ids.has(target)) {
          errors.push(`${issue.id}#${milestone.id}: 존재하지 않는 마일스톤 이슈 ${target}`);
        }
      }
    }
  }

  for (const start of parentEdges.keys()) {
    const visited = new Set([start]);
    let current = start;
    while (parentEdges.has(current)) {
      current = parentEdges.get(current);
      if (visited.has(current)) {
        errors.push(`${start}: child_of 관계에 순환이 있습니다.`);
        break;
      }
      visited.add(current);
    }
  }

  return errors;
}

function commandValidate(options) {
  if (options._[0]) {
    const filePath = path.resolve(options._[0]);
    const issue = readIssue(filePath);
    if (issue.schemaVersion === 1) {
      console.log(`${issue.id}: legacy Markdown (읽기 호환)`);
      return;
    }
    issue.validation.warnings.forEach((warning) => console.error(`warning: ${warning}`));
    console.log(`${issue.id}: valid v2`);
    return;
  }

  const root = resolveIssuesRoot(options.root);
  const { issues, errors } = readAllIssues(root);
  const relationErrors = validateRelations(issues);
  if (errors.length || relationErrors.length) {
    [...errors, ...relationErrors].forEach((error) => console.error(error));
    process.exit(1);
  }
  issues.flatMap((issue) => issue.validation.warnings.map((warning) => `${issue.id}: ${warning}`))
    .forEach((warning) => console.error(`warning: ${warning}`));
  console.log(`${issues.length}개 이슈가 유효합니다.`);
}

// The first Issue in a project's default store starts it from the bundled starter.
function ensureDefaultStore(root) {
  const store = path.dirname(root);
  if (fs.existsSync(root) || path.basename(root) !== 'issues' || path.basename(store) !== '.emeth') return;
  fs.cpSync(path.resolve(__dirname, '../assets/state-starter'), store, { recursive: true, force: false });
}

// Template placeholders leave the ID and timestamps to the CLI.
function fillGeneratedFields(issue) {
  const now = new Date().toISOString();
  for (const field of ['created_at', 'updated_at']) {
    if (issue && (issue[field] === undefined || String(issue[field]).startsWith('REPLACE:'))) issue[field] = now;
  }
  return Boolean(issue?.identity && (issue.identity.id === undefined || issue.identity.id === 'PL-0000'));
}

// Issue files may have any name, so both file names and stored IDs count.
function nextIssueId(root, issues) {
  let largest = 0;
  for (const value of [...fs.readdirSync(root), ...issues.map((item) => item.id)]) {
    const match = /^PL-(\d{4,})(?:$|[.-])/.exec(value || '');
    if (match) largest = Math.max(largest, Number(match[1]));
  }
  return `PL-${String(largest + 1).padStart(4, '0')}`;
}

// Readers see either no file or the complete Issue.
function publishNewIssue(filePath, issue) {
  const temporary = `${filePath}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, model.serializeIssue(issue), { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, filePath);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

// Concurrent creates allocate IDs and publish one at a time.
function createUnderLock(root, issue, generatedId) {
  const loaded = readAllIssues(root);
  if (loaded.errors.length) return { error: loaded.errors.join('\n') };
  const existing = loaded.issues;
  if (generatedId) issue.identity.id = nextIssueId(root, existing);
  const validation = model.validateV2Issue(issue);
  if (!validation.valid) return { error: validation.errors.join('\n') };
  if (existing.some((item) => item.id === issue.identity.id)) {
    return { error: `이미 존재하는 이슈 ID입니다: ${issue.identity.id}` };
  }
  const candidate = model.toViewModel(issue, `${issue.identity.id}.json`);
  const relationErrors = validateRelations([...existing, candidate]);
  if (relationErrors.length) return { error: relationErrors.join('\n') };
  const filePath = path.join(root, `${issue.identity.id}.json`);
  if (fs.existsSync(filePath)) return { error: `이미 존재하는 파일입니다: ${filePath}` };
  publishNewIssue(filePath, issue);
  return { filePath, warnings: validation.warnings };
}

function commandCreate(options) {
  const root = resolveIssuesRoot(options.root);
  ensureDefaultStore(root);
  assertIssuesRoot(root);
  const issue = loadJsonFile(options.input, '이슈');
  const generatedId = fillGeneratedFields(issue);
  const lockFile = path.join(root, '.create.lock');
  let result;
  try {
    result = withFileLock(lockFile, () => createUnderLock(root, issue, generatedId),
      { code: 'issue-create-locked', message: `다른 이슈 생성이 끝나지 않았습니다: ${lockFile}` });
  } catch (error) {
    if (error.code !== 'issue-create-locked') throw error;
    fail(error.message);
  }
  if (result.error) fail(result.error);
  registerWrittenProject(root, options.project_root);
  result.warnings.forEach((warning) => console.error(`warning: ${warning}`));
  console.log(result.filePath);
}

function commandUpdate(options) {
  const [id] = options._;
  if (!id) {
    fail('update 명령에는 이슈 ID가 필요합니다.');
  }
  const root = resolveIssuesRoot(options.root);
  const filePath = findIssue(root, id);
  if (path.extname(filePath) !== '.json') {
    fail('레거시 Markdown은 먼저 검토 기반 마이그레이션이 필요합니다.');
  }
  const operation = loadJsonFile(options.operation, 'operation');
  if (containsLinkWork(operation)) {
    fail('link_work는 역링크를 검증하는 link-work 명령으로 실행해야 합니다.');
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let result;
  try {
    result = model.applyOperation(raw, operation);
  } catch (error) {
    fail(error.message);
  }
  const loaded = readAllIssues(root);
  if (loaded.errors.length) {
    fail(loaded.errors.join('\n'));
  }
  const candidate = model.toViewModel(result.issue, path.basename(filePath));
  const issues = loaded.issues.map((issue) => issue.id === id ? candidate : issue);
  const relationErrors = validateRelations(issues);
  if (relationErrors.length) {
    fail(relationErrors.join('\n'));
  }
  writeV2Issue(filePath, result.issue);
  registerWrittenProject(root, options.project_root);
  result.validation.warnings.forEach((warning) => console.error(`warning: ${warning}`));
  console.log(filePath);
}

function commandLinkWork(options) {
  const [id] = options._;
  if (!id) {
    fail('link-work 명령에는 이슈 ID가 필요합니다.');
  }
  const root = resolveIssuesRoot(options.root);
  const filePath = findIssue(root, id);
  if (path.extname(filePath) !== '.json') {
    fail('레거시 Markdown은 먼저 검토 기반 마이그레이션이 필요합니다.');
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const operation = {
    type: 'link_work',
    current_summary: requireOption(options, 'current_summary', '--current-summary'),
    next_action: requireOption(options, 'next_action', '--next-action'),
    work: {
      kind: requireOption(options, 'kind', '--kind'),
      id: requireOption(options, 'work_id', '--work-id'),
      location: rewritePaths(requireOption(options, 'path', '--path'))
    }
  };
  for (const field of ['status', 'blocker', 'unblock_condition', 'transition_summary', 'updated_at']) {
    if (options[field] !== undefined) {
      operation[field] = options[field];
    }
  }

  let result;
  try {
    result = model.applyOperation(raw, operation);
  } catch (error) {
    fail(error.message);
  }
  validateWorkBacklink(id, operation.work, path.resolve(options.project_root || process.cwd()));
  const comparable = { ...result.issue, updated_at: raw.updated_at };
  if (model.serializeIssue(comparable) === model.serializeIssue(raw)) {
    console.log(`no-op: ${filePath}`);
    return;
  }
  writeV2Issue(filePath, result.issue);
  registerWrittenProject(root, options.project_root);
  result.validation.warnings.forEach((warning) => console.error(`warning: ${warning}`));
  console.log(filePath);
}

function printLinkWorkHelp() {
  console.log(`Usage:
  issue-ledger.js link-work ID --kind design|plan|spec --work-id ID --path PATH \\
    --current-summary TEXT --next-action TEXT [--status open|doing|blocked] \\
    [--blocker TEXT --unblock-condition TEXT] [--updated-at ISO] \\
    [--project-root DIR] [--root DIR]`);
}

function printHelp() {
  console.log(`Emeth Discipline Issue Ledger v2

Usage:
  issue-ledger.js list [--root DIR] [--all] [--search TEXT]
  issue-ledger.js show ID [--root DIR] [--evidence E1,E2] [--events]
  issue-ledger.js validate [FILE] [--root DIR]
  issue-ledger.js create --input ISSUE.json [--root DIR]
  issue-ledger.js update ID --operation OPERATION.json [--root DIR]
  issue-ledger.js link-work ID --help

Update operation types:
  batch, set_state, add_evidence, link_evidence, add_event, set_milestone, add_relation`);
}

function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);

  if (command === 'link-work' && options.help) {
    printLinkWorkHelp();
  } else if (!command || command === 'help' || options.help) {
    printHelp();
  } else if (command === 'list') {
    commandList(options);
  } else if (command === 'show') {
    commandShow(options);
  } else if (command === 'validate') {
    commandValidate(options);
  } else if (command === 'create') {
    commandCreate(options);
  } else if (command === 'update') {
    commandUpdate(options);
  } else if (command === 'link-work') {
    commandLinkWork(options);
  } else {
    fail(`알 수 없는 명령입니다: ${command}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  listIssueFiles,
  readIssue,
  readAllIssues,
  validateRelations,
  main,
};
