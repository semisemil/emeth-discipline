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
  throw Object.assign(new Error(message), { exitCode: code });
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

function findIssue(root, id, issues = readAllIssues(root).issues) {
  const matches = issues.filter(issue => issue.id === id)
    .map(issue => ({ filePath: path.join(root, issue.fileName), issue }));

  if (matches.length === 0) {
    fail(`이슈를 찾지 못했습니다: ${id}`);
  }
  if (matches.length > 1) {
    fail(`같은 ID의 이슈 파일이 여러 개입니다: ${id}`);
  }
  return matches[0];
}

function loadJsonFile(filePath, label, data) {
  if (data !== undefined) {
    if (filePath !== undefined) fail('Choose a file/stdin input or --data');
    try { return JSON.parse(decodeURIComponent(data)); }
    catch (error) { fail(`${label} --data는 URI로 인코딩한 JSON이어야 합니다: ${error.message}`); }
  }
  if (!filePath) {
    fail(`${label} JSON 파일 경로가 필요합니다.`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath === '-' ? 0 : path.resolve(filePath), 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    fail(`${label} JSON을 읽지 못했습니다: ${error.message}`);
  }
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
  const content = fs.readFileSync(artifactPath, 'utf8').replace(/^\ufeff/, '');
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

function withIssueStoreLock(root, action) {
  assertIssuesRoot(root);
  // Share the creation lock because relation validation reads the whole store.
  const lockFile = path.join(root, '.create.lock');
  return withFileLock(lockFile, action, {
    code: 'issue-store-locked',
    message: `다른 이슈 저장이 끝나지 않았습니다: ${lockFile}`
  });
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

function registerWrittenProject(issuesRoot, explicitProjectRoot, emit = true) {
  const projectRoot = resolveProjectRoot(issuesRoot, explicitProjectRoot);
  try {
    const registration=registerProject(projectRoot);
    if (emit) console.error(`registration: ${JSON.stringify(registration)}`);
    return {status:registration.status};
  } catch (error) {
    const failure={
      error: {
        code: error.code || 'registration-failed',
        message: error.message
      }
    };
    if (emit) console.error(`registration-failed: ${JSON.stringify(failure)}`);
    return failure;
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

  if (options.details) {
    const limit = options.limit === undefined ? 10 : Number(options.limit);
    const offset = options.offset === undefined ? 0 : Number(options.offset);
    if (typeof options.limit === 'boolean' || typeof options.offset === 'boolean'
        || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) {
      fail('--details: --limit은 1~100, --offset은 0 이상의 정수여야 합니다.');
    }
    visible.slice(offset, offset + limit).forEach(issue => process.stdout.write(model.buildBrief(issue)));
    if (offset + limit < visible.length) console.log(`more: ${visible.length - offset - limit}; next: --offset ${offset + limit}`);
    return;
  }
  visible.forEach((issue) => console.log(`${issue.id}\t${issue.status}\t${issue.title}`));
}

function commandShow(options) {
  const [id] = options._;
  if (!id) {
    fail('show 명령에는 이슈 ID가 필요합니다.');
  }
  const root = resolveIssuesRoot(options.root);
  const { issue } = findIssue(root, id);

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

// Readers see the previous complete Issue or its complete replacement.
function publishIssue(filePath, issue) {
  const temporary = `${filePath}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, model.serializeIssue(issue), { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, filePath);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

// Concurrent creates allocate IDs and publish one at a time.
function createUnderLock(root, issue, generatedId, ifEmpty = false) {
  const loaded = readAllIssues(root);
  if (loaded.errors.length) return { error: loaded.errors.join('\n') };
  const existing = loaded.issues;
  if (ifEmpty && existing.length) return { error: 'issue-store-changed: Issue store is populated; refresh discovery before choosing or registering work.' };
  if (generatedId) issue.identity.id = model.nextIssueId(fs.readdirSync(root), existing);
  const validation = model.validateV2Issue(issue);
  if (!validation.valid) return { error: validation.errors.join('\n') };
  if (existing.some((item) => item.id === issue.identity.id)) {
    return { error: `이미 존재하는 이슈 ID입니다: ${issue.identity.id}` };
  }
  const candidate = model.toViewModel(issue, `${issue.identity.id}.json`, validation);
  const relationErrors = validateRelations([...existing, candidate]);
  if (relationErrors.length) return { error: relationErrors.join('\n') };
  const filePath = path.join(root, `${issue.identity.id}.json`);
  if (fs.existsSync(filePath)) return { error: `이미 존재하는 파일입니다: ${filePath}` };
  publishIssue(filePath, issue);
  return { filePath, warnings: validation.warnings, view: candidate };
}

function commandCreate(options) {
  const format = options.input_format === undefined ? 'v2' : options.input_format;
  if (!['v2', 'brief'].includes(format)) fail('--input-format은 v2 또는 brief여야 합니다.');
  if (options.if_empty !== undefined && options.if_empty !== true) fail('--if-empty는 값을 받지 않는 플래그입니다.');
  if (options.output_format !== undefined && options.output_format !== 'json') fail('--output-format accepts json only');
  const root = resolveIssuesRoot(options.root);
  ensureDefaultStore(root);
  assertIssuesRoot(root);
  const input = loadJsonFile(options.input, '이슈', options.data);
  const issue = format === 'brief' ? expandBriefIssue(input) : input;
  const generatedId = fillGeneratedFields(issue);
  const result = withIssueStoreLock(root, () => createUnderLock(root, issue, generatedId, options.if_empty === true));
  if (result.error) fail(result.error);
  const registration=registerWrittenProject(root, options.project_root,options.output_format!=='json');
  if (options.output_format === 'json') console.log(JSON.stringify({path:result.filePath,id:result.view.id,
    state:result.view.raw.state,criteria:result.view.raw.criteria,claims:result.view.raw.problem?.claims||[],registration,warnings:result.warnings}));
  else {
    result.warnings.forEach((warning) => console.error(`warning: ${warning}`));
    console.log(result.filePath);
    if (format === 'brief') process.stdout.write(model.buildBrief(result.view));
  }
}

function briefObject(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}: 객체가 필요합니다.`);
  }
  const unknown = Object.keys(value).filter(key => !fields.includes(key));
  if (unknown.length) throw new Error(`${label}: 알 수 없는 필드 ${unknown.join(', ')}`);
  return value;
}

function briefTexts(value, label) {
  if (!Array.isArray(value) || value.some(text => typeof text !== 'string' || !text.trim())) {
    throw new Error(`${label}: 비어 있지 않은 문자열 배열이 필요합니다.`);
  }
  return value;
}

function expandBriefIssue(input) {
  briefObject(input, ['type', 'title', 'risk', 'origin', 'current_summary', 'next_action', 'problem', 'objective', 'criteria', 'relations'], 'brief');
  const origin = briefObject(input.origin, ['kind', 'summary', 'refs'], 'origin');
  const usesClaims = ['bug', 'research'].includes(input.type);
  if (usesClaims && input.objective !== undefined || !usesClaims && input.problem !== undefined) {
    throw new Error('brief: type에 맞는 problem 또는 objective만 사용합니다.');
  }
  const subject = usesClaims
    ? briefObject(input.problem, ['claims', 'impact'], 'problem')
    : briefObject(input.objective, ['summary', 'constraints'], 'objective');
  const relations = input.relations === undefined ? [] : input.relations;
  if (!Array.isArray(relations)) throw new Error('relations: 배열이 필요합니다.');
  relations.forEach(relation => briefObject(relation, ['type', 'target'], 'relations'));
  return {
    schema_version: 2,
    identity: { id: 'PL-0000', aliases: [], type: input.type, mode: 'simple', title: input.title, risk: input.risk },
    origin: { ...origin, refs: origin.refs === undefined ? [] : origin.refs },
    state: { status: 'open', current_summary: input.current_summary === undefined ? origin.summary : input.current_summary, next_action: input.next_action },
    ...(usesClaims ? { problem: {
      claims: briefTexts(subject.claims, 'problem.claims').map((text, index) => ({ id: `P${index + 1}`, state: 'reported', text, evidence_refs: [] })),
      impact: subject.impact,
    } } : { objective: { summary: subject.summary, constraints: subject.constraints === undefined ? [] : subject.constraints } }),
    criteria: briefTexts(input.criteria, 'criteria').map((text, index) => ({ id: `C${index + 1}`, text, evidence_refs: [] })),
    relations,
    context: [], artifacts: [], evidence: [], events: [],
  };
}

function commandUpdate(options) {
  const [id] = options._;
  if (!id) {
    fail('update 명령에는 이슈 ID가 필요합니다.');
  }
  if (options.output_format !== undefined && options.output_format !== 'json') fail('--output-format accepts json only');
  const root = resolveIssuesRoot(options.root);
  const format = options.input_format === undefined ? 'v2' : options.input_format;
  if (!['v2', 'brief'].includes(format)) fail('--input-format은 v2 또는 brief여야 합니다.');
  const input = loadJsonFile(options.operation, 'operation', options.data);
  const { filePath, result, candidate } = withIssueStoreLock(root, () => updateUnderLock(root, id, options, format, input));
  const registration=registerWrittenProject(root, options.project_root,options.output_format!=='json');
  if (options.output_format === 'json') console.log(JSON.stringify({path:filePath,brief:model.buildBrief(candidate),registration,warnings:result.validation.warnings}));
  else {
    result.validation.warnings.forEach((warning) => console.error(`warning: ${warning}`));
    console.log(filePath);
  }
}

function updateUnderLock(root, id, options, format, input) {
  const loaded = readAllIssues(root);
  if (loaded.errors.length) fail(loaded.errors.join('\n'));
  const { filePath, issue } = findIssue(root, id, loaded.issues);
  if (path.extname(filePath) !== '.json') {
    fail('레거시 Markdown은 먼저 검토 기반 마이그레이션이 필요합니다.');
  }
  const raw = issue.raw;
  const operation = format === 'brief' ? expandBriefUpdate(input, raw) : input;
  const result = model.applyOperation(raw, operation);
  for (const item of operation.type === 'batch' ? operation.operations : [operation]) {
    if (item.type === 'link_work') validateWorkBacklink(id, item.work, path.resolve(options.project_root || process.cwd()));
  }
  const candidate = model.toViewModel(result.issue, path.basename(filePath), result.validation);
  const issues = loaded.issues.map((issue) => issue.id === id ? candidate : issue);
  const relationErrors = validateRelations(issues);
  if (relationErrors.length) {
    fail(relationErrors.join('\n'));
  }
  publishIssue(filePath, result.issue);
  return { filePath, result, candidate };
}

function expandBriefUpdate(input, issue) {
  briefObject(input, ['current_summary', 'work', 'evidence', 'status', 'next_action'], 'brief update');
  const list = (value, label) => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error(`${label}: 배열이 필요합니다.`);
    return value;
  };
  const work = list(input.work, 'work');
  const evidence = list(input.evidence, 'evidence');
  work.forEach(item => briefObject(item, ['kind', 'id', 'location'], 'work'));
  evidence.forEach(item => briefObject(item, ['id', 'kind', 'location', 'observation', 'observed_at', 'targets', 'claims'], 'evidence'));
  const used = new Set([...issue.evidence.map(item => item.id), ...evidence.map(item => item.id)]);
  let next = 1;
  const operations = work.map(item => ({ type: 'link_work', work: item }));
  const now = new Date().toISOString();
  for (const item of evidence) {
    const claims = list(item.claims, 'evidence.claims');
    claims.forEach(claim => briefObject(claim, ['id', 'state'], 'evidence.claims'));
    let id = item.id;
    if (id === undefined) {
      while (used.has(`E${next}`)) next++;
      id = `E${next++}`;
      used.add(id);
    }
    const targets = briefTexts(item.targets === undefined ? [] : item.targets, 'evidence.targets');
    operations.push({ type: 'add_evidence', evidence: {
      id, kind: item.kind, location: item.location, observation: item.observation,
      observed_at: item.observed_at === undefined ? now : item.observed_at,
    }, targets: [...new Set([...targets, ...claims.map(claim => claim.id)])] });
    for (const claim of claims) operations.push({ type: 'set_claim_state', claim_id: claim.id, state: claim.state, evidence_refs: [id] });
  }
  const status = input.status === undefined ? issue.state.status : input.status;
  if (!['open', 'doing', 'resolved'].includes(status)) throw new Error('brief update: status는 open, doing 또는 resolved여야 합니다.');
  if (status === 'resolved' && Object.hasOwn(input, 'next_action')) throw new Error('brief update: resolved에는 next_action을 전달하지 않습니다.');
  operations.push({ type: 'set_state', status,
    ...(input.next_action !== undefined ? { next_action: input.next_action }
      : status === 'resolved' ? {} : { next_action: issue.state.next_action }),
  });
  return { type: 'batch', current_summary: input.current_summary, operations };
}

function commandLinkWork(options) {
  const [id] = options._;
  if (!id) {
    fail('link-work 명령에는 이슈 ID가 필요합니다.');
  }
  const root = resolveIssuesRoot(options.root);
  const { filePath, result, unchanged } = withIssueStoreLock(root, () => linkWorkUnderLock(root, id, options));
  if (unchanged) {
    console.log(`no-op: ${filePath}`);
    return;
  }
  registerWrittenProject(root, options.project_root);
  result.validation.warnings.forEach((warning) => console.error(`warning: ${warning}`));
  console.log(filePath);
}

function linkWorkUnderLock(root, id, options) {
  const { filePath, issue } = findIssue(root, id);
  if (path.extname(filePath) !== '.json') {
    fail('레거시 Markdown은 먼저 검토 기반 마이그레이션이 필요합니다.');
  }
  const raw = issue.raw;
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

  const result = model.applyOperation(raw, operation);
  validateWorkBacklink(id, operation.work, path.resolve(options.project_root || process.cwd()));
  const comparable = { ...result.issue, updated_at: raw.updated_at };
  if (model.serializeIssue(comparable) === model.serializeIssue(raw)) {
    return { filePath, unchanged: true };
  }
  publishIssue(filePath, result.issue);
  return { filePath, result };
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
  issue-ledger.js list [--root DIR] [--all] [--search TEXT] [--details [--limit N] [--offset N]]
  issue-ledger.js show ID [--root DIR] [--evidence E1,E2] [--events]
  issue-ledger.js validate [FILE] [--root DIR]
  issue-ledger.js create --input ISSUE.json|- [--input-format v2|brief] [--output-format json] [--if-empty] [--root DIR]
  issue-ledger.js update ID --operation OPERATION.json|- [--input-format v2|brief] [--output-format json] [--project-root DIR] [--root DIR]
  issue-ledger.js link-work ID --help

Update operation types:
  batch, set_state, set_claim_state, link_work, add_evidence, link_evidence, add_event, set_milestone, add_relation

Brief create: type, title, risk, origin {kind, summary, refs?}, next_action,
  criteria (strings), problem {claims (strings), impact} for bug/research,
  or objective {summary, constraints?} otherwise; current_summary and relations optional.
  Stores a validated simple/open v2 issue with generated IDs and timestamps.
  Claims start reported. Unknown fields are rejected. Default input format remains v2.
  Create/update also accept --data URI_ENCODED_JSON instead of --input/--operation.
  Create --output-format json returns path, id, state, criteria and claims for sequential work.
  --if-empty rechecks the store inside the create lock and refuses a populated store.
Brief update: current_summary, work? [{kind,id,location}], evidence? [{id?,kind,
  location,observation,observed_at?,targets?,claims?:[{id,state}]}], status?, next_action?.
  Supplies unused evidence IDs/timestamps; claim changes are explicit, not inferred.
  Links, proof and open/doing/resolved state validate together before one save.
  --output-format json returns the saved path and validated current brief; default output remains the path.`);
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
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.exitCode || 1;
  }
}

module.exports = {
  listIssueFiles,
  readIssue,
  readAllIssues,
  validateRelations,
  main,
};
