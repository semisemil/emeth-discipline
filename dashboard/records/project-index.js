'use strict';

const fs = require('node:fs');
const { migrateProject } = require('../../lib/storage-migration');
const path = require('node:path');

const issueModel = require('../../skills/issue-ledger/lib/issue-model.js');

const {
  forgetProject,
  readRegistry,
  rootKey,
} = require('../registry.js');
const {
  ISSUE_ID,
  DESIGN_ID,
  PLAN_ID,
  RecordError,
  SPEC_ID,
  isInside,
  parseCurrentRecord,
} = require('./record-parser.js');
const { supersessionMap } = require('./development-contracts.js');

const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_ISSUE_STATUSES = new Set(['open', 'doing']);
const BLOCKED_ISSUE_STATUSES = new Set(['blocked']);
const TERMINAL_ISSUE_STATUSES = new Set(['resolved', 'cancelled', 'superseded']);
const SIGNAL_ORDER = [
  'work-definition-only',
  'plan-draft',
  'spec-needed',
  'implementation-not-ready',
  'implementation-ready',
  'state-mismatch',
  'link-mismatch',
];
const RECORD_DIRECTORY_DEFINITIONS = Object.freeze([
  { directoryName: 'issues', fileName: null, idPattern: null },
  { directoryName: 'plan', fileName: 'PLAN.md', idPattern: PLAN_ID },
  { directoryName: 'specs', fileName: 'SPEC.md', idPattern: SPEC_ID },
  { directoryName: 'designs', fileName: 'DESIGN.md', idPattern: DESIGN_ID },
]);
const ARCHITECTURE_MEMORY_DIRECTORY = '.architecture-memory';
const ARCHITECTURE_MANIFEST = 'manifest.json';
const ARCHITECTURE_DISCOVERY_DEPTH = 8;
const ARCHITECTURE_DISCOVERY_DIRECTORIES = 1024;

const SIGNAL_TEXT = {
  'work-definition-only': {
    observed: '활성 이슈에 연결된 설계 문서가 없습니다.',
    nextAction: 'Design 연결 필요성을 검토합니다.',
  },
  'plan-draft': {
    observed: '연결된 Plan에 남은 설계 결정이 있습니다.',
    nextAction: 'Plan의 미결정을 해소합니다.',
  },
  'spec-needed': {
    observed: '연결된 Plan은 ready지만 Spec이 없습니다.',
    nextAction: 'Design 승계 필요성을 결정합니다.',
  },
  'implementation-not-ready': {
    observed: '연결된 구현 계약이 draft 또는 blocked입니다.',
    nextAction: '계약의 구현 준비 조건을 충족합니다.',
  },
  'implementation-ready': {
    observed: '연결된 구현 계약이 ready입니다.',
    nextAction: '사용자가 승인한 구현 작업 여부를 확인합니다.',
  },
  'state-mismatch': {
    observed: 'Issue와 구현 계약의 완료 상태가 일치하지 않을 수 있습니다.',
    nextAction: '원본 상태를 확인합니다.',
  },
  'link-mismatch': {
    observed: 'Issue와 문서의 양방향 연결이 일치하지 않습니다.',
    nextAction: '양쪽 원본 링크를 확인합니다.',
  },
};

class ProjectApiError extends Error {
  constructor(code, message, status = 400, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ProjectApiError';
    this.code = code;
    this.status = status;
  }
}

function realpath(filePath) {
  const resolve = fs.realpathSync.native || fs.realpathSync;
  return path.normalize(resolve(filePath));
}

function toRelative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function hasArchitectureManifest(rootReal) {
  let docsReal;
  try {
    docsReal = realpath(path.join(rootReal, 'docs'));
    if (!fs.statSync(docsReal).isDirectory() || !isInside(rootReal, docsReal)) return false;
  } catch {
    return false;
  }

  const queue = [{ directory: docsReal, depth: 0 }];
  let visited = 0;
  while (queue.length > 0 && visited < ARCHITECTURE_DISCOVERY_DIRECTORIES) {
    const current = queue.shift();
    visited += 1;
    let entries;
    try {
      entries = fs.readdirSync(current.directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name === ARCHITECTURE_MEMORY_DIRECTORY && entry.isDirectory()) {
        try {
          const manifestReal = realpath(path.join(current.directory, entry.name, ARCHITECTURE_MANIFEST));
          if (isInside(rootReal, manifestReal) && fs.statSync(manifestReal).isFile()) return true;
        } catch {
          // An unreadable marker does not make the project available.
        }
        continue;
      }
      if (!entry.isDirectory() || current.depth >= ARCHITECTURE_DISCOVERY_DEPTH) continue;
      try {
        const childReal = realpath(path.join(current.directory, entry.name));
        if (isInside(docsReal, childReal)) {
          queue.push({ directory: childReal, depth: current.depth + 1 });
        }
      } catch {
        // Ignore inaccessible subtrees while looking for an owned marker.
      }
    }
  }
  return false;
}

function projectAvailability(project) {
  try {
    const rootReal = realpath(project.root);
    if (rootKey(rootReal) !== rootKey(path.normalize(path.resolve(project.root)))) {
      return { availability: 'unavailable' };
    }
    migrateProject(rootReal);
    const rootStat = fs.statSync(rootReal);
    const emethPath = path.join(rootReal, '.emeth');
    fs.accessSync(rootReal, fs.constants.R_OK);
    if (!rootStat.isDirectory()) {
      return { availability: 'unavailable' };
    }
    try {
      const emethReal = realpath(emethPath);
      const emethStat = fs.statSync(emethReal);
      fs.accessSync(emethReal, fs.constants.R_OK);
      if (emethStat.isDirectory() && isInside(rootReal, emethReal)) {
        return { availability: 'available', rootReal, emethReal, emethExists: true };
      }
    } catch {
      // Architecture-only projects do not require a .emeth directory.
    }
    if (hasArchitectureManifest(rootReal)) {
      return {
        availability: 'available',
        rootReal,
        emethReal: emethPath,
        emethExists: false,
      };
    }
    return { availability: 'unavailable' };
  } catch {
    return { availability: 'unavailable' };
  }
}

function diagnostic(code, relativePath, message, details = {}) {
  return {
    code,
    relative_path: relativePath,
    message,
    ...details,
  };
}

function recordDiagnostic(error, relativePath) {
  const safeMessages = {
    'record-invalid-utf8': '기록이 올바른 UTF-8이 아닙니다.',
    'project-root-replaced': '등록된 프로젝트 루트가 다른 위치를 가리킵니다.',
    'record-metadata-invalid': '기록 metadata가 올바르지 않습니다.',
    'record-id-mismatch': '폴더 또는 파일 ID와 본문 ID가 일치하지 않습니다.',
    'record-path-outside-project': '기록 경로가 등록 프로젝트 밖으로 나갑니다.',
    'record-not-file': '기록 후보가 파일이 아닙니다.',
    'record-too-large': '기록이 2 MiB 한도를 초과합니다.',
    'record-unavailable': '기록을 읽을 수 없습니다.',
  };
  return diagnostic(
    error instanceof RecordError ? error.code : 'record-read-failed',
    relativePath,
    safeMessages[error.code] || '기록을 읽지 못했습니다.',
  );
}

function directoryEntries(directory, rootReal, relativePath, diagnostics) {
  try {
    const directoryReal = realpath(directory);
    if (!isInside(rootReal, directoryReal)) {
      diagnostics.push(diagnostic(
        'record-path-outside-project',
        relativePath,
        '기록 디렉터리가 등록 프로젝트 밖으로 나갑니다.',
      ));
      return [];
    }
    return fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      diagnostics.push(diagnostic('record-directory-unavailable', relativePath, '기록 디렉터리를 읽을 수 없습니다.'));
    }
    return [];
  }
}

function collectCandidates(projectState, diagnostics) {
  const { rootReal } = projectState;
  const candidates = [];
  const issuesDirectory = path.join(rootReal, '.emeth', 'issues');
  for (const entry of directoryEntries(issuesDirectory, rootReal, '.emeth/issues', diagnostics)) {
    if ((!entry.isFile() && !entry.isSymbolicLink())
        || !issueModel.isIssueFileName(entry.name)) {
      continue;
    }
    const expectedId = entry.name.match(/^(PL-\d{4,})(?=[-.])/)?.[1];
    const filePath = path.join(issuesDirectory, entry.name);
    candidates.push({
      kind: 'issue',
      filePath,
      directory: issuesDirectory,
      expectedId,
      relativePath: toRelative(rootReal, filePath),
    });
  }

  for (const definition of [
    { kind: 'plan', directoryName: 'plan', fileName: 'PLAN.md', idPattern: PLAN_ID },
    { kind: 'spec', directoryName: 'specs', fileName: 'SPEC.md', idPattern: SPEC_ID },
    { kind: 'design', directoryName: 'designs', fileName: 'DESIGN.md', idPattern: DESIGN_ID },
  ]) {
    const recordsDirectory = path.join(rootReal, '.emeth', definition.directoryName);
    for (const entry of directoryEntries(
      recordsDirectory,
      rootReal,
      `.emeth/${definition.directoryName}`,
      diagnostics,
    )) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        continue;
      }
      const id = entry.name.match(/^([A-Z]+-\d{4,})-[^/\\]+$/)?.[1];
      if (!id || !definition.idPattern.test(id)) {
        continue;
      }
      const directory = path.join(recordsDirectory, entry.name);
      const filePath = path.join(directory, definition.fileName);
      if (!fs.existsSync(filePath)) {
        continue;
      }
      candidates.push({
        kind: definition.kind,
        filePath,
        directory: recordsDirectory,
        expectedId: id,
        relativePath: toRelative(rootReal, filePath),
      });
    }
  }
  return candidates;
}

function parseCandidates(projectState, diagnostics, options = {}) {
  const parsed = [];
  for (const candidate of collectCandidates(projectState, diagnostics)) {
    try {
      parsed.push(parseCurrentRecord({
        ...candidate,
        root: projectState.rootReal,
        includeBody: false,
        readMode: options.readMode || 'index',
      }));
    } catch (error) {
      diagnostics.push(recordDiagnostic(error, candidate.relativePath));
    }
  }

  const grouped = new Map();
  for (const record of parsed) {
    const key = `${record.kind}:${record.id}`;
    const group = grouped.get(key) || [];
    group.push(record);
    grouped.set(key, group);
  }

  const records = [];
  for (const group of grouped.values()) {
    if (group.length === 1) {
      records.push(group[0]);
      continue;
    }
    for (const record of group) {
      diagnostics.push(diagnostic(
        'record-duplicate-id',
        record.relativePath,
        `같은 종류에 중복 ID가 있습니다: ${record.id}`,
        { record_id: record.id, record_kind: record.kind },
      ));
    }
  }
  try {
    const next = supersessionMap(records);
    for (const record of records) if (next.has(record.id)) {
      record.originalStatus = record.status;
      record.status = 'superseded';
      record.supersededBy = next.get(record.id);
    }
  } catch (error) {
    diagnostics.push(diagnostic(error.code, '.emeth/designs', error.message));
    for (const record of records) if (record.kind !== 'issue') { record.status = 'blocked'; record.contractError = error.code; }
  }
  return records;
}

function canonicalDocumentPath(kind, location) {
  if (typeof location !== 'string' || location.includes('\\')) {
    return null;
  }
  const pattern = kind === 'plan'
    ? /^\.emeth\/plan\/(PLAN-\d{4,})-[^/]+\/PLAN\.md$/
    : kind === 'design' ? /^\.emeth\/designs\/(DESIGN-\d{4,})-[^/]+\/DESIGN\.md$/
      : /^\.emeth\/specs\/(SPEC-\d{4,})-[^/]+\/SPEC\.md$/;
  const match = location.match(pattern);
  return match ? { id: match[1], path: location } : null;
}

function linkRecords(records, diagnostics) {
  const issues = records.filter((record) => record.kind === 'issue');
  const documents = records.filter((record) => record.kind !== 'issue');
  const issueById = new Map(issues.map((issue) => [issue.id, issue]));
  const documentByPath = new Map(documents.map((document) => [document.relativePath, document]));
  const links = new Map(issues.map((issue) => [issue.id, { plan: new Set(), spec: new Set(), design: new Set() }]));
  const linkedIssues = new Map(documents.map((document) => [`${document.kind}:${document.id}`, new Set()]));
  const mismatchedIssues = new Set();
  const mismatchedDocuments = new Set();
  const mismatchKeys = new Set();

  const addMismatch = (relativePath, issue, document, message) => {
    const key = `${relativePath}\0${issue?.id || ''}\0${document?.kind || ''}\0${document?.id || ''}\0${message}`;
    if (mismatchKeys.has(key)) {
      return;
    }
    mismatchKeys.add(key);
    diagnostics.push(diagnostic('link-mismatch', relativePath, message, {
      ...(issue ? { issue_id: issue.id } : {}),
      ...(document ? { document_kind: document.kind, document_id: document.id } : {}),
    }));
    if (issue) {
      mismatchedIssues.add(issue.id);
    }
    if (document) {
      mismatchedDocuments.add(`${document.kind}:${document.id}`);
    }
  };

  for (const issue of issues) {
    for (const context of issue.context) {
      const kind = String(context?.kind || '').toLowerCase();
      if (!['plan', 'spec', 'design'].includes(kind)) {
        continue;
      }
      const canonical = canonicalDocumentPath(kind, context.location);
      const document = canonical ? documentByPath.get(canonical.path) : null;
      if (!canonical || !document || document.kind !== kind || document.id !== canonical.id) {
        addMismatch(issue.relativePath, issue, document, 'Issue의 문서 경로가 유효한 현재 기록을 가리키지 않습니다.');
        continue;
      }
      if (!document.relatedIssues.includes(issue.id)) {
        addMismatch(document.relativePath, issue, document, '문서 related_issues에 Issue의 역방향 링크가 없습니다.');
        continue;
      }
      links.get(issue.id)[kind].add(document.id);
      linkedIssues.get(`${document.kind}:${document.id}`).add(issue.id);
    }
  }

  for (const document of documents) {
    for (const issueId of document.relatedIssues) {
      const issue = issueById.get(issueId);
      if (!issue) {
        addMismatch(document.relativePath, null, document, `related_issues의 Issue를 찾을 수 없습니다: ${issueId}`);
        continue;
      }
      const hasBackLink = issue.context.some((context) => {
        const kind = String(context?.kind || '').toLowerCase();
        const canonical = canonicalDocumentPath(document.kind, context?.location);
        return kind === document.kind && canonical?.path === document.relativePath;
      });
      if (!hasBackLink) {
        addMismatch(document.relativePath, issue, document, '문서가 가리키는 Issue에 정방향 문서 링크가 없습니다.');
      }
    }
  }

  return { issues, documents, links, linkedIssues, mismatchedIssues, mismatchedDocuments };
}

function makeSignal(targetKind, targetId, signal) {
  const text = SIGNAL_TEXT[signal];
  return {
    id: `${targetKind}:${targetId}:${signal}`,
    signal,
    target: { kind: targetKind, id: targetId },
    observed: text.observed,
    next_action: text.nextAction,
  };
}

function calculateFlow(linkState) {
  const signals = [];
  const signalIdsByIssue = new Map(linkState.issues.map((issue) => [issue.id, []]));
  const documentsByKey = new Map(linkState.documents.map((document) => [`${document.kind}:${document.id}`, document]));

  const addIssueSignal = (issue, signal) => {
    const id = `issue:${issue.id}:${signal}`;
    if (signalIdsByIssue.get(issue.id).includes(id)) {
      return;
    }
    signals.push(makeSignal('issue', issue.id, signal));
    signalIdsByIssue.get(issue.id).push(id);
  };

  for (const issue of linkState.issues) {
    const issueLinks = linkState.links.get(issue.id);
    const plans = [...issueLinks.plan].map((id) => documentsByKey.get(`plan:${id}`)).filter(record => record.status !== 'superseded');
    const specs = [
      ...[...issueLinks.spec].map(id => documentsByKey.get(`spec:${id}`)),
      ...[...issueLinks.design].map(id => documentsByKey.get(`design:${id}`)),
    ].filter(record => record.status !== 'superseded');

    if (ACTIVE_ISSUE_STATUSES.has(issue.status) && plans.length === 0 && specs.length === 0) {
      addIssueSignal(issue, 'work-definition-only');
    }
    if (plans.some((plan) => plan.status === 'draft')) {
      addIssueSignal(issue, 'plan-draft');
    }
    if (plans.some((plan) => plan.status === 'ready') && specs.length === 0) {
      addIssueSignal(issue, 'spec-needed');
    }
    if (specs.some((spec) => spec.status === 'draft' || spec.status === 'blocked')) {
      addIssueSignal(issue, 'implementation-not-ready');
    }
    if (specs.some((spec) => spec.status === 'ready')) {
      addIssueSignal(issue, 'implementation-ready');
    }
    if ((ACTIVE_ISSUE_STATUSES.has(issue.status) && specs.some((spec) => spec.status === 'completed'))
        || (TERMINAL_ISSUE_STATUSES.has(issue.status) && specs.some((spec) => spec.status !== 'completed'))) {
      addIssueSignal(issue, 'state-mismatch');
    }
    if (linkState.mismatchedIssues.has(issue.id)) {
      addIssueSignal(issue, 'link-mismatch');
    }
  }

  for (const key of linkState.mismatchedDocuments) {
    const document = documentsByKey.get(key);
    if (document && !document.relatedIssues.some((id) => linkState.mismatchedIssues.has(id))) {
      signals.push(makeSignal(document.kind, document.id, 'link-mismatch'));
    }
  }

  signals.sort((left, right) => {
    const signalOrder = SIGNAL_ORDER.indexOf(left.signal) - SIGNAL_ORDER.indexOf(right.signal);
    return signalOrder || left.id.localeCompare(right.id);
  });
  return { signals, signalIdsByIssue };
}

function projectName(root) {
  return path.basename(root) || root;
}

function canonicalProjectRootIdentity(project) {
  return rootKey(path.normalize(path.resolve(project.root)));
}

function appendPathSignature(parts, filePath, label) {
  try {
    const status = fs.lstatSync(filePath, { bigint: true });
    parts.push([
      label,
      status.mode,
      status.size,
      status.mtimeNs,
      status.ctimeNs,
      status.ino,
    ].join(':'));
    return status;
  } catch (error) {
    parts.push(`${label}:error:${error.code || 'unknown'}`);
    return null;
  }
}

function sortedDirectoryEntries(directory, parts, label) {
  try {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    parts.push(`${label}:entries:${entries.map((entry) => entry.name).join(',')}`);
    return entries;
  } catch (error) {
    parts.push(`${label}:entries-error:${error.code || 'unknown'}`);
    return [];
  }
}

function projectSourceSignature(project) {
  const state = projectAvailability(project);
  if (state.availability === 'unavailable') {
    return `${canonicalProjectRootIdentity(project)}\0unavailable`;
  }
  const parts = [canonicalProjectRootIdentity(project), 'available'];
  appendPathSignature(parts, state.emethReal, '.emeth');
  for (const definition of RECORD_DIRECTORY_DEFINITIONS) {
    const directory = path.join(state.emethReal, definition.directoryName);
    appendPathSignature(parts, directory, definition.directoryName);
    const entries = sortedDirectoryEntries(directory, parts, definition.directoryName);
    if (definition.directoryName === 'issues') {
      for (const entry of entries) {
        if (issueModel.isIssueFileName(entry.name)) {
          appendPathSignature(parts, path.join(directory, entry.name), `${definition.directoryName}/${entry.name}`);
        }
      }
      continue;
    }
    for (const entry of entries) {
      const id = entry.name.match(/^([A-Z]+-\d{4,})-[^/\\]+$/)?.[1];
      if (!id || !definition.idPattern.test(id)) {
        continue;
      }
      const recordDirectory = path.join(directory, entry.name);
      appendPathSignature(parts, recordDirectory, `${definition.directoryName}/${entry.name}`);
      appendPathSignature(
        parts,
        path.join(recordDirectory, definition.fileName),
        `${definition.directoryName}/${entry.name}/${definition.fileName}`,
      );
    }
  }
  return parts.join('\0');
}

function projectWatcherPaths(project) {
  const state = projectAvailability(project);
  if (state.availability === 'unavailable') {
    return [];
  }
  const watchedPaths = new Set(state.emethExists ? [state.emethReal] : []);
  for (const definition of RECORD_DIRECTORY_DEFINITIONS) {
    const directory = path.join(state.emethReal, definition.directoryName);
    let directoryReal;
    try {
      directoryReal = realpath(directory);
      if (!fs.statSync(directoryReal).isDirectory() || !isInside(state.rootReal, directoryReal)) {
        continue;
      }
      watchedPaths.add(directoryReal);
    } catch {
      continue;
    }
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    if (definition.directoryName === 'issues') {
      for (const entry of entries) {
        if (!issueModel.isIssueFileName(entry.name)) {
          continue;
        }
        try {
          const candidateReal = realpath(path.join(directory, entry.name));
          if (isInside(state.rootReal, candidateReal) && fs.statSync(candidateReal).isFile()) {
            watchedPaths.add(candidateReal);
          }
        } catch {
          // Invalid or unavailable records remain parser diagnostics, not watcher failures.
        }
      }
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      try {
        const childReal = realpath(path.join(directory, entry.name));
        if (fs.statSync(childReal).isDirectory() && isInside(state.rootReal, childReal)) {
          watchedPaths.add(childReal);
          try {
            const recordReal = realpath(path.join(childReal, definition.fileName));
            if (isInside(state.rootReal, recordReal) && fs.statSync(recordReal).isFile()) {
              watchedPaths.add(recordReal);
            }
          } catch {
            // Missing or invalid current documents remain independently readable diagnostics.
          }
        }
      } catch {
        // One unavailable document directory must not disable the others.
      }
    }
  }
  return [...watchedPaths];
}

function unavailableSummary(project) {
  return {
    id: project.id,
    name: projectName(project.root),
    root: project.root,
    availability: 'unavailable',
    counts: { active: null, blocked: null },
    diagnostic_count: 0,
    last_modified: null,
    latest_issue: null,
  };
}

function unavailableIndex(project, readAt) {
  const summary = unavailableSummary(project);
  return {
    publicIndex: {
      project: summary,
      issues: [],
      plans: [],
      specs: [],
      designs: [],
      flow_signals: [],
      diagnostics: [],
      read_at: readAt,
    },
    recordMap: new Map(),
  };
}

function scanProject(project, options = {}) {
  const readAt = (options.now || (() => new Date().toISOString()))();
  const state = projectAvailability(project);
  if (state.availability === 'unavailable') {
    return {
      availability: 'unavailable',
      diagnostics: [],
      linkState: null,
      readAt,
      records: [],
      summary: unavailableSummary(project),
    };
  }

  const diagnostics = [];
  const records = parseCandidates(state, diagnostics, { readMode: options.readMode });
  const linkState = linkRecords(records, diagnostics);
  const latestModified = records
    .map((record) => record.fileModifiedAt)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  const latestIssue = [...linkState.issues]
    .filter((issue) => Number.isFinite(Date.parse(issue.metadata?.created_at)))
    .sort((left, right) => Date.parse(right.metadata.created_at) - Date.parse(left.metadata.created_at)
      || right.id.localeCompare(left.id, 'en', { numeric: true }))[0];
  const summary = {
    id: project.id,
    name: projectName(project.root),
    root: project.root,
    availability: 'available',
    counts: {
      active: linkState.issues.filter((issue) => ACTIVE_ISSUE_STATUSES.has(issue.status)).length,
      blocked: linkState.issues.filter((issue) => BLOCKED_ISSUE_STATUSES.has(issue.status)).length,
    },
    diagnostic_count: diagnostics.length,
    last_modified: latestModified,
    latest_issue: latestIssue ? {
      id: latestIssue.id,
      title: latestIssue.title,
      created_at: latestIssue.metadata.created_at,
    } : null,
  };
  return {
    availability: 'available',
    diagnostics,
    linkState,
    readAt,
    records,
    summary,
  };
}

function buildProjectSummary(project, options = {}) {
  return scanProject(project, { ...options, readMode: 'summary' }).summary;
}

function buildProjectIndex(project, options = {}) {
  const scan = scanProject(project, { ...options, readMode: 'index' });
  if (scan.availability === 'unavailable') {
    return unavailableIndex(project, scan.readAt);
  }

  const {
    diagnostics,
    linkState,
    readAt,
    records,
    summary,
  } = scan;
  const flow = calculateFlow(linkState);
  const recordMap = new Map(records.map((record) => [`${record.kind}:${record.id}`, record]));

  const issues = linkState.issues.map((issue) => {
    const issueLinks = linkState.links.get(issue.id);
    return {
      id: issue.id,
      title: issue.title,
      type: issue.type,
      status: issue.status,
      risk: issue.risk,
      current_summary: issue.currentSummary,
      next_action: issue.nextAction,
      updated_at: issue.updatedAt,
      plan_ids: [...issueLinks.plan].sort(),
      spec_ids: [...issueLinks.spec].sort(),
      design_ids: [...issueLinks.design].sort(),
      flow_signal_ids: flow.signalIdsByIssue.get(issue.id),
    };
  }).sort((left, right) => left.id.localeCompare(right.id));

  const plans = linkState.documents.filter((record) => record.kind === 'plan').map((record) => ({
    id: record.id,
    title: record.title,
    status: record.status,
    superseded_by: record.supersededBy || null,
    related_issues: record.relatedIssues,
    linked_issue_ids: [...linkState.linkedIssues.get(`plan:${record.id}`)].sort(),
    relative_path: record.relativePath,
    updated_at: record.updatedAt,
  })).sort((left, right) => left.id.localeCompare(right.id));

  const specs = linkState.documents.filter((record) => record.kind === 'spec').map((record) => ({
    id: record.id,
    title: record.title,
    status: record.status,
    superseded_by: record.supersededBy || record.metadata.superseded_by,
    related_issues: record.relatedIssues,
    linked_issue_ids: [...linkState.linkedIssues.get(`spec:${record.id}`)].sort(),
    relative_path: record.relativePath,
    updated_at: record.updatedAt,
    kind: record.specKind,
    revision: record.revision,
  })).sort((left, right) => left.id.localeCompare(right.id));

  const designs = linkState.documents.filter(record => record.kind === 'design').map(record => ({
    id: record.id, title: record.title, status: record.status, related_issues: record.relatedIssues,
    linked_issue_ids: [...linkState.linkedIssues.get(`design:${record.id}`)].sort(),
    relative_path: record.relativePath, updated_at: record.updatedAt, kind: record.specKind,
    revision: record.revision, supersedes: record.metadata.supersedes,
    superseded_by: record.supersededBy || record.metadata.superseded_by,
  })).sort((a, b) => a.id.localeCompare(b.id));

  diagnostics.sort((left, right) => left.relative_path.localeCompare(right.relative_path)
    || left.code.localeCompare(right.code));

  return {
    publicIndex: {
      project: summary,
      issues,
      plans,
      specs,
      designs,
      flow_signals: flow.signals,
      diagnostics,
      read_at: readAt,
    },
    recordMap,
  };
}

function publicDocument(record) {
  return {
    kind: record.kind,
    id: record.id,
    title: record.title,
    status: record.status,
    superseded_by: record.supersededBy || record.metadata.superseded_by || null,
    metadata: record.metadata,
    content_type: record.contentType,
    body: record.body,
    relative_path: record.relativePath,
    updated_at: record.updatedAt,
  };
}

class ProjectIndexService {
  constructor(options = {}) {
    this.registryOptions = options.registryOptions || {};
    this.now = options.now || (() => new Date().toISOString());
    this.watch = options.watch || ((target, listener) => {
      const changed = (current, previous) => {
        if (current.mtimeMs !== previous.mtimeMs
            || current.ctimeMs !== previous.ctimeMs
            || current.size !== previous.size
            || current.ino !== previous.ino) {
          listener('change', path.basename(target));
        }
      };
      fs.watchFile(target, { persistent: false, interval: 1000 }, changed);
      return { close: () => fs.unwatchFile(target, changed) };
    });
    this.cache = new Map();
    this.summaryCache = new Map();
    this.watchers = new Map();
  }

  readProjects() {
    try {
      const projects = readRegistry(this.registryOptions).registry.projects;
      this.syncProjects(projects);
      return projects;
    } catch (error) {
      throw new ProjectApiError(error.code || 'registry-read-failed', '프로젝트 레지스트리를 읽을 수 없습니다.', 500, error);
    }
  }

  invalidateProject(projectId) {
    this.cache.delete(projectId);
    this.summaryCache.delete(projectId);
  }

  closeProjectWatchers(projectId) {
    const state = this.watchers.get(projectId);
    if (!state) {
      return;
    }
    for (const watcher of state.handles.values()) {
      try {
        watcher.close();
      } catch {
        // Watcher shutdown is best-effort and cannot affect other projects.
      }
    }
    this.watchers.delete(projectId);
  }

  ensureProjectWatchers(project) {
    const identity = canonicalProjectRootIdentity(project);
    let state = this.watchers.get(project.id);
    if (state && state.identity !== identity) {
      this.closeProjectWatchers(project.id);
      this.invalidateProject(project.id);
      state = null;
    }
    if (!state) {
      state = { identity, handles: new Map() };
      this.watchers.set(project.id, state);
    }
    const desired = new Set(projectWatcherPaths(project));
    for (const [directory, watcher] of state.handles) {
      if (desired.has(directory)) {
        continue;
      }
      try {
        watcher.close();
      } catch {
        // A failed watcher remains isolated from reads and other watchers.
      }
      state.handles.delete(directory);
    }
    for (const directory of desired) {
      if (state.handles.has(directory)) {
        continue;
      }
      try {
        const watcher = this.watch(directory, () => this.invalidateProject(project.id));
        if (watcher && typeof watcher.close === 'function') {
          state.handles.set(directory, watcher);
        }
      } catch {
        // Polling, source signatures, and manual refresh remain available.
      }
    }
  }

  syncProjects(projects) {
    const registeredIds = new Set(projects.map((project) => project.id));
    for (const projectId of this.watchers.keys()) {
      if (!registeredIds.has(projectId)) {
        this.closeProjectWatchers(projectId);
        this.invalidateProject(projectId);
      }
    }
    for (const project of projects) {
      this.ensureProjectWatchers(project);
    }
  }

  findProject(projectId) {
    if (!PROJECT_ID.test(projectId || '')) {
      throw new ProjectApiError('project-id-invalid', '프로젝트 ID가 올바르지 않습니다.', 400);
    }
    const project = this.readProjects().find((item) => item.id.toLowerCase() === projectId.toLowerCase());
    if (!project) {
      throw new ProjectApiError('project-not-found', '프로젝트를 찾을 수 없습니다.', 404);
    }
    return project;
  }

  loadIndex(project, refresh = false) {
    this.ensureProjectWatchers(project);
    const sourceSignature = projectSourceSignature(project);
    if (!refresh && this.cache.has(project.id)) {
      const cached = this.cache.get(project.id);
      if (cached.canonicalRootIdentity === canonicalProjectRootIdentity(project)
          && cached.sourceSignature === sourceSignature) {
        return cached.index;
      }
      this.invalidateProject(project.id);
    }
    const result = buildProjectIndex(project, { now: this.now });
    this.cache.set(project.id, {
      canonicalRootIdentity: canonicalProjectRootIdentity(project),
      index: result,
      sourceSignature,
    });
    return result;
  }

  loadSummary(project) {
    this.ensureProjectWatchers(project);
    const sourceSignature = projectSourceSignature(project);
    const cached = this.summaryCache.get(project.id);
    if (cached
        && cached.canonicalRootIdentity === canonicalProjectRootIdentity(project)
        && cached.sourceSignature === sourceSignature) {
      return cached.summary;
    }
    const summary = buildProjectSummary(project, { now: this.now });
    this.summaryCache.set(project.id, {
      canonicalRootIdentity: canonicalProjectRootIdentity(project),
      sourceSignature,
      summary,
    });
    return summary;
  }

  listProjects() {
    return this.readProjects()
      .map((project) => this.loadSummary(project))
      .sort((left, right) => left.name.localeCompare(right.name) || left.root.localeCompare(right.root));
  }

  getIndex(projectId, options = {}) {
    const project = this.findProject(projectId);
    return this.loadIndex(project, options.refresh === true).publicIndex;
  }

  getDocument(projectId, kind, recordId) {
    const patterns = { issue: ISSUE_ID, plan: PLAN_ID, spec: SPEC_ID, design: DESIGN_ID };
    if (!patterns[kind] || !patterns[kind].test(recordId || '')) {
      throw new ProjectApiError('record-id-invalid', '기록 종류 또는 ID가 올바르지 않습니다.', 400);
    }
    const project = this.findProject(projectId);
    const state = this.loadIndex(project);
    if (state.publicIndex.project.availability !== 'available') {
      throw new ProjectApiError('project-unavailable', '프로젝트를 읽을 수 없습니다.', 409);
    }
    const indexed = state.recordMap.get(`${kind}:${recordId}`);
    if (!indexed) {
      throw new ProjectApiError('record-not-found', '기록을 찾을 수 없습니다.', 404);
    }
    try {
      const current = parseCurrentRecord({
        kind,
        filePath: indexed.source.filePath,
        directory: indexed.source.directory,
        expectedId: indexed.source.expectedId,
        relativePath: indexed.relativePath,
        root: project.root,
        includeBody: true,
        readMode: 'document',
      });
      if (indexed.supersededBy) { current.status = 'superseded'; current.supersededBy = indexed.supersededBy; }
      if (indexed.contractError) current.status = 'blocked';
      return publicDocument(current);
    } catch (error) {
      this.invalidateProject(project.id);
      throw new ProjectApiError('record-unavailable', '기록을 읽을 수 없습니다.', 409, error);
    }
  }

  forgetUnavailableProject(projectId) {
    const project = this.findProject(projectId);
    if (projectAvailability(project).availability === 'available') {
      throw new ProjectApiError('project-available', '사용 가능한 프로젝트는 목록에서 지울 수 없습니다.', 409);
    }
    try {
      forgetProject(project.id, this.registryOptions);
      this.closeProjectWatchers(project.id);
      this.invalidateProject(project.id);
    } catch (error) {
      throw new ProjectApiError(error.code || 'registry-write-failed', '프로젝트 레지스트리를 변경할 수 없습니다.', 500, error);
    }
  }

  close() {
    for (const projectId of [...this.watchers.keys()]) {
      this.closeProjectWatchers(projectId);
    }
  }
}

module.exports = {
  PROJECT_ID,
  ProjectApiError,
  ProjectIndexService,
  buildProjectIndex,
  buildProjectSummary,
  calculateFlow,
  canonicalProjectRootIdentity,
  canonicalDocumentPath,
  projectSourceSignature,
  projectAvailability,
};
