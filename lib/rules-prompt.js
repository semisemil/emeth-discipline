const fs = require('node:fs');
const path = require('node:path');

const RETRYABLE_CODES = new Set(['EACCES', 'EBUSY', 'ENOENT', 'EPERM']);
const RETRY_DELAYS_MS = [50, 150];

function readFileWithRetry(filePath, optional = false) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      if (optional && error.code === 'ENOENT') return '';
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
const HOST_FILES = Object.freeze({ codex: 'codex.md', claude: 'claude-code.md' });

function composeBaseline(pluginRoot, host) {
  const skillPath = path.join(pluginRoot, 'skills', 'rules', 'SKILL.md');
  const hostPath = path.join(pluginRoot, 'skills', 'rules', HOST_FILES[host]);
  const shared = removeFrontmatter(readFileWithRetry(skillPath));
  if (shared.split(new RegExp(HOST_RULES.source, 'gm')).length !== 2) {
    throw invalidPrompt('Emeth Discipline host-rules line must appear exactly once.', 'INVALID_HOST_SLOT', skillPath);
  }
  const hostRules = readFileWithRetry(hostPath).replace(/^\uFEFF/, '').trim();
  return { baseline: resolveReferences(shared.replace(HOST_RULES, () => hostRules), skillPath), hostPath };
}

function composeEmethPrompt(options = {}) {
  const pluginRoot = options.pluginRoot || path.resolve(__dirname, '..');
  const { baseline } = composeBaseline(pluginRoot, 'codex');
  const common = baseline.trimEnd();
  const model = typeof options.model === 'string' ? options.model.trim() : '';
  // Exact model IDs only; never interpret a model name as a path.
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(model)) return common;
  const modelPath = path.join(pluginRoot, 'skills', 'rules', 'models', `${model}.md`);
  const modelPrompt = resolveReferences(removeFrontmatter(readFileWithRetry(modelPath, true)),
    path.join(pluginRoot, 'skills', 'rules', 'SKILL.md')).trim();
  if (!modelPrompt) return common;
  return `${common}\n\n## Model rules: ${model}\n\nApply these additional rules only while the active model is \`${model}\`.\n\n${modelPrompt}`;
}

// Claude Code has no response modes; the rules skill itself stays hidden there.
function composeClaudePrompt(options = {}) {
  const pluginRoot = options.pluginRoot || path.resolve(__dirname, '..');
  return composeBaseline(pluginRoot, 'claude').baseline.replaceAll('{{plugin-root}}', pluginRoot).trimEnd();
}

module.exports = {
  composeEmethPrompt,
  composeClaudePrompt,
};
