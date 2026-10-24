const fs = require('node:fs');
const path = require('node:path');

const RETRYABLE_CODES = new Set(['EACCES', 'EBUSY', 'ENOENT', 'EPERM']);
const RETRY_DELAYS_MS = [50, 150];

function readFileWithRetry(filePath) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      if (!RETRYABLE_CODES.has(error.code) || attempt >= RETRY_DELAYS_MS.length) {
        error.emethFilePath = filePath;
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_DELAYS_MS[attempt]);
    }
  }
}

function removeFrontmatter(content) {
  return content
    .replace(/^\uFEFF/, '')
    .replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '')
    .replace(/^\r?\n/, '');
}

function resolveReferences(content, skillPath) {
  return content.replace(/`references\/([^`]+)`/g, (_match, reference) => (
    `\`${path.join(path.dirname(skillPath), 'references', reference)}\``
  ));
}

function invalidPrompt(message, code, filePath) {
  const error = new Error(message);
  error.code = code;
  error.emethFilePath = filePath;
  return error;
}

// Direct readers follow this line's links; the hook inlines the running host's rules in its place.
const HOST_RULES = /^Apply the rules for the host running this conversation: [^\r\n]*/m;
const HOST_FILES = Object.freeze({ codex: 'codex.md', claude: 'claude-code.md', mixdog: 'mixdog.md' });

function composeBaseline(pluginRoot, host) {
  const skillPath = path.join(pluginRoot, 'skills', 'rules', 'SKILL.md');
  const hostPath = path.join(pluginRoot, 'skills', 'rules', HOST_FILES[host]);
  const shared = removeFrontmatter(readFileWithRetry(skillPath)).replace(
    /<!-- claude-only -->\r?\n([\s\S]*?)<!-- \/claude-only -->\r?\n?/g,
    (_match, content) => host === 'claude' ? content : '',
  ).replace(/<!-- direct-readers -->\r?\n[\s\S]*?<!-- \/direct-readers -->\r?\n?/g, '');
  if (shared.split(new RegExp(HOST_RULES.source, 'gm')).length !== 2) {
    throw invalidPrompt('Emeth Discipline host-rules line must appear exactly once.', 'INVALID_HOST_SLOT', skillPath);
  }
  const hostRules = readFileWithRetry(hostPath).replace(/^\uFEFF/, '').trim();
  const baseline = resolveReferences(shared.replace(HOST_RULES, () => hostRules), skillPath);
  return baseline.replaceAll('{{plugin-root}}', pluginRoot);
}

function composeEmethPrompt(options = {}) {
  const pluginRoot = options.pluginRoot || path.resolve(__dirname, '..');
  return composeBaseline(pluginRoot, 'codex').trimEnd();
}

// The rules skill stays hidden in Claude Code; only this hook output delivers it there.
function composeClaudePrompt(options = {}) {
  const pluginRoot = options.pluginRoot || path.resolve(__dirname, '..');
  return composeBaseline(pluginRoot, 'claude').trimEnd();
}

function composeMixdogPrompt(options = {}) {
  const pluginRoot = options.pluginRoot || path.resolve(__dirname, '..');
  return composeBaseline(pluginRoot, 'mixdog').trimEnd();
}

module.exports = {
  composeEmethPrompt,
  composeClaudePrompt,
  composeMixdogPrompt,
};
