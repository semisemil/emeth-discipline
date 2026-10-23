'use strict';

const fs = require('node:fs');
const { migrateProject } = require('./storage-migration');
const path = require('node:path');
const { logDiagnostic } = require('./rules-state');
const host = require('./host');
const { designStorage } = require('./document-roots');
const issueModel = require('../skills/issue-ledger/lib/issue-model');

const ISSUE_DOCUMENT = Object.freeze({
  directory: ['.emeth', 'issues'],
  prefix: 'PL',
  label: 'issue',
});
const DESIGN_DOCUMENT = Object.freeze({ directory: ['.emeth', 'designs'], prefix: 'DESIGN', label: 'design' });

const DOCUMENT_SKILLS = Object.freeze({
  '/emeth-discipline:issue-ledger': ISSUE_DOCUMENT,
  '/emeth-discipline:development-design': DESIGN_DOCUMENT,
  '/emeth-discipline:figure-it-out': DESIGN_DOCUMENT,
});

function findDocumentSkill(prompt) {
  if (typeof prompt !== 'string') {
    return null;
  }
  const firstLine = prompt.split(/\r?\n/).find((line) => line.trim().length > 0);
  if (!firstLine) {
    return null;
  }
  let invocation = firstLine.trim().split(/[ \t]+/, 1)[0];
  if (host.name() === 'mixdog') {
    const name = invocation.replace(/^[$/]/, '').replace(/^emeth-discipline:/, '');
    invocation = `/emeth-discipline:${name}`;
  }
  // Codex keeps its native `$` skill mention as an alias of the slash form.
  if (host.name() === 'codex' && invocation.startsWith('$')) {
    invocation = `/${invocation.slice(1)}`;
  }
  return DOCUMENT_SKILLS[invocation] || null;
}

function nextDocumentId(projectRoot, documentSkill) {
  migrateProject(projectRoot);
  const directory = documentSkill.prefix === 'DESIGN' ? designStorage(projectRoot).directory : path.join(projectRoot, ...documentSkill.directory);
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return `${documentSkill.prefix}-0001`;
    }
    error.filePath = directory;
    throw error;
  }

  if (documentSkill.prefix === 'PL') {
    const issues = [];
    for (const entry of entries) {
      if ((!entry.isFile() && !entry.isSymbolicLink()) || !issueModel.isIssueFileName(entry.name)) continue;
      const content = fs.readFileSync(path.join(directory, entry.name), 'utf8');
      try { issues.push(issueModel.parseIssueContent(content, entry.name)); }
      catch { /* Invalid files still reserve their filename's number. */ }
    }
    return issueModel.nextIssueId(entries.map((entry) => entry.name), issues);
  }

  const pattern = new RegExp(`^${documentSkill.prefix}-(\\d{4,})(?:$|[.-])`);
  let largest = 0n;
  for (const entry of entries) {
    const match = pattern.exec(entry.name);
    if (match) {
      const number = BigInt(match[1]);
      if (number > largest) {
        largest = number;
      }
    }
  }
  return `${documentSkill.prefix}-${String(largest + 1n).padStart(4, '0')}`;
}

function notice(input) {
  try {
    const documentSkill = findDocumentSkill(input.prompt);
    if (!documentSkill) {
      return '';
    }
    const projectRoot = typeof input.cwd === 'string' && input.cwd.length > 0
      ? path.resolve(input.cwd)
      : process.cwd();
    return `Next ${documentSkill.label} number: ${nextDocumentId(projectRoot, documentSkill)}`;
  } catch (error) {
    logDiagnostic({
      hook: 'next-document-number',
      event: 'UserPromptSubmit',
      error,
      filePath: error.filePath,
    });
    return '';
  }
}

module.exports = { DOCUMENT_SKILLS, findDocumentSkill, nextDocumentId, notice };
