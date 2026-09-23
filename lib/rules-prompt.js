const fs = require('node:fs');
const path = require('node:path');

const MODE_SLOT = '<!-- proofline-response-mode -->';
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

function composeProoflinePrompt(mode, options = {}) {
  const pluginRoot = options.pluginRoot || path.resolve(__dirname, '..');
  const skillPath = path.join(pluginRoot, 'skills', 'rules', 'SKILL.md');
  const modePath = path.join(pluginRoot, 'skills', 'rules', `${mode}.md`);
  const baseline = resolveReferences(removeFrontmatter(readFileWithRetry(skillPath)), skillPath);
  const modePrompt = readFileWithRetry(modePath).replace(/^\uFEFF/, '').trim();
  const slotCount = baseline.split(MODE_SLOT).length - 1;

  if (slotCount !== 1) {
    const error = new Error('Emeth Discipline response-mode slot must appear exactly once.');
    error.code = 'INVALID_MODE_SLOT';
    error.emethFilePath = skillPath;
    throw error;
  }

  return baseline.replace(MODE_SLOT, modePrompt).trimEnd();
}

module.exports = {
  MODE_SLOT,
  composeProoflinePrompt,
};
