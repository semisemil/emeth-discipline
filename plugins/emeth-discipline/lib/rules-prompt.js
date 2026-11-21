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

// Reference paths share one absolute root, so the prompt defines it once after the title.
function resolveReferences(content, skillPath) {
  let referenced = false;
  const resolved = content.replace(/`references\/([^`]+)`/g, (_match, reference) => {
    referenced = true;
    return `\`<rules-refs>/${reference}\``;
  });
  if (!referenced) return resolved;
  const root = path.join(path.dirname(skillPath), 'references');
  return resolved.replace(/^# [^\r\n]*\r?\n/, title => `${title}\n\`<rules-refs>\` = \`${root}\`.\n`);
}

function invalidPrompt(message, code, filePath) {
  const error = new Error(message);
  error.code = code;
  error.emethFilePath = filePath;
  return error;
}

// Direct readers follow this line's links; the hook inlines the running host's rules in its place.
const HOST_RULES = /^Apply the rules for the host running this conversation: [^\r\n]*/m;
// Subagents report to their caller, so user-facing presentation rules stay in the main conversation.
const AUDIENCE_BLOCK = /<!-- (main|subagent)-only -->\r?\n([\s\S]*?)<!-- \/\1-only -->\r?\n?/g;
// Record rules have nothing to exclude or authorize in projects without record roots or automatic records.
const RECORDS_BLOCK = /<!-- records-only -->\r?\n([\s\S]*?)<!-- \/records-only -->\r?\n?/g;
const HOST_FILES = Object.freeze({ codex: 'codex.md', claude: 'claude-code.md' });
// GPT-6.2 follows OpenAI's 6.2 prompt guidance; earlier and unknown Codex models keep codex.md.
const GPT_6_2 = /^gpt-6\.2(?:-|$)/;

function rulesFile(host, model) {
  if (host === 'codex' && GPT_6_2.test(typeof model === 'string' ? model.trim() : '')) return 'codex-gpt-6.2.md';
  return HOST_FILES[host];
}

function composeEmethPrompt(options = {}) {
  const pluginRoot = options.pluginRoot || path.resolve(__dirname, '..');
  const host = options.host || 'codex';
  const skillPath = path.join(pluginRoot, 'skills', 'rules', 'SKILL.md');
  const hostPath = path.join(pluginRoot, 'skills', 'rules', rulesFile(host, options.model));
  const shared = removeFrontmatter(readFileWithRetry(skillPath)).replace(
    /<!-- claude-only -->\r?\n([\s\S]*?)<!-- \/claude-only -->\r?\n?/g,
    (_match, content) => host === 'claude' ? content : '',
  ).replace(/<!-- direct-readers -->\r?\n[\s\S]*?<!-- \/direct-readers -->\r?\n?/g, '')
    .replace(RECORDS_BLOCK, (_match, content) => options.records === false ? '' : content);
  if (shared.split(new RegExp(HOST_RULES.source, 'gm')).length !== 2) {
    throw invalidPrompt('Emeth Discipline host-rules line must appear exactly once.', 'INVALID_HOST_SLOT', skillPath);
  }
  const hostRules = readFileWithRetry(hostPath).replace(/^\uFEFF/, '').trim();
  const hostShared = host === 'codex' ? shared.replaceAll('`skills/rules/references/', '`references/') : shared;
  const audience = options.audience === 'subagent' ? 'subagent' : 'main';
  const baseline = resolveReferences(hostShared.replace(HOST_RULES, () => hostRules), skillPath)
    .replace(AUDIENCE_BLOCK, (_match, reader, content) => reader === audience ? content : '');
  const prompt = baseline.replaceAll('node "{{plugin-root}}/', 'node "<plugin-root>/')
    .replaceAll('{{plugin-root}}', pluginRoot).trimEnd();
  if (!options.language) return prompt;
  // The language setting adds writing rules for that language after the shared rules.
  const languagePath = path.join(pluginRoot, 'skills', 'rules', 'references', `language-${options.language}.md`);
  return `${prompt}\n\n${removeFrontmatter(readFileWithRetry(languagePath)).trim()}`;
}

module.exports = { composeEmethPrompt, rulesFile };
