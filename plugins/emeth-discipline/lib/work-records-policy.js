'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { isIssueFileName } = require('../skills/issue-ledger/lib/issue-model');
const { getDashboardConfigDir } = require('../dashboard/registry');

function globalSettingsPath(options = {}) {
  return path.join(path.dirname(getDashboardConfigDir(options)), 'work-records.json');
}

function readSettings(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > 16384) throw new Error(`Invalid automatic work-record settings: ${file}`);
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!value || Array.isArray(value) || value.schema_version !== 1 || typeof value.enabled !== 'boolean'
        || Object.keys(value).some(key => !['schema_version', 'enabled'].includes(key))) {
      throw new Error(`Invalid automatic work-record settings: ${file}`);
    }
    return value;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

function globalSettings(action, options = {}) {
  const file = globalSettingsPath(options);
  if (action === 'status') {
    const settings = readSettings(file);
    return { ok: true, scope: 'global', path: file, configured: settings !== null, enabled: settings?.enabled ?? false };
  }
  if (!['on', 'off'].includes(action)) throw new Error('Expected work-records on, off or status');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify({ schema_version: 1, enabled: action === 'on' })}\n`, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return { ok: true, scope: 'global', path: file, configured: true, enabled: action === 'on' };
}

function policyFor(cwd) {
  const workingRoot = path.resolve(cwd || process.cwd());
  let root = workingRoot;
  let recordRoot;
  while (true) {
    const local = readSettings(path.join(root, '.emeth', 'work-records.json'));
    if (local) return { root, enabled: local.enabled };
    if (!recordRoot && (fs.existsSync(path.join(root, '.emeth')) || fs.existsSync(path.join(root, '.proofline')))) {
      recordRoot = root;
    }
    const parent = path.dirname(root);
    if (fs.existsSync(path.join(root, '.git'))) break;
    if (parent === root) { root = recordRoot || workingRoot; break; }
    root = parent;
  }
  const global = readSettings(globalSettingsPath());
  return { root, enabled: global?.enabled ?? false };
}

function notice(cwd) {
  try {
    const policy = policyFor(cwd);
    if (!policy.enabled) return '';
    if (require('./host').name() === 'codex') {
      const { commandQuoter, displayPath } = require('./host');
      const quote = commandQuoter();
      const cli = displayPath(path.resolve(__dirname, '../writers/document-writer.js'));
      return 'Project automatic work records: enabled\n'
        + 'Before edits, use this for the first source search with an identifier named in the task:\n'
        + `node ${quote(cli)} context --records both --project-root ${quote(displayPath(policy.root))} --query '<identifier>' --code-context 8 --format codex-text\n`
        + 'Read the output directly: rg, inventory, Git status and the save API. Reuse full files; read missing/truncated sources normally. Explicit scope wins. Find an identifier in code only when none is named.';
    }
    const issues = path.join(policy.root, '.emeth', 'issues');
    let state = 'unavailable';
    try {
      let legacy = false;
      try { fs.lstatSync(path.join(policy.root, '.proofline', 'issues')); legacy = true; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!legacy) {
        state = fs.readdirSync(issues).some(isIssueFileName) ? 'present' : 'empty';
      }
    } catch (error) {
      if (error.code === 'ENOENT') state = 'absent';
    }
    const cli = path.resolve(__dirname, '../writers/document-writer.js');
    return 'Project automatic work records: enabled\n'
      + `Issue store: ${state}\n`
      + `Work-record entry; before edits run: node "${cli}" context --records both --project-root "${policy.root}" --query "<identifier>"\n`
      + 'Returns policy/save API. Known identifier: group source/config, guidance and context in the first read. JSON; literal OR; --code-context 8; --file PATH; --records issues|designs.';
  } catch (error) {
    process.stderr.write(`Automatic work records disabled: ${error.message}\n`);
    return '';
  }
}

module.exports = { policyFor, notice, globalSettingsPath, globalSettings };
