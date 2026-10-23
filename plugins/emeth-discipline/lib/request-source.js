'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const host = require('./host');
const { findDocumentSkill } = require('./document-number');
const { logDiagnostic } = require('./rules-state');

function capture(directory, input) {
  for (const field of ['session_id', 'turn_id']) {
    if (typeof input[field] !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(input[field])) throw new Error('Invalid request source identity');
  }
  if (typeof input.prompt !== 'string' || typeof input.cwd !== 'string' || !path.isAbsolute(input.cwd)) throw new Error('Request text and absolute working directory are required');
  const folder = path.join(path.resolve(directory), input.session_id, input.turn_id);
  const bytes = Buffer.from(input.prompt, 'utf8');
  const receipt = { source: 'UserPromptSubmit', session_id: input.session_id, turn_id: input.turn_id, cwd: input.cwd, path: path.join(folder, 'input.md'), sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
  const metadata = path.join(folder, 'source.json');
  const serialized = JSON.stringify(receipt);
  if (fs.existsSync(metadata) && JSON.stringify(JSON.parse(fs.readFileSync(metadata, 'utf8'))) !== serialized) throw new Error('Request source identity already belongs to different input');
  fs.mkdirSync(folder, { recursive: true });
  try { fs.writeFileSync(receipt.path, bytes, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!fs.readFileSync(receipt.path).equals(bytes)) throw new Error('Request source identity already belongs to different content');
  }
  try { fs.writeFileSync(metadata, serialized, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (JSON.stringify(JSON.parse(fs.readFileSync(metadata, 'utf8'))) !== serialized) throw new Error('Request source receipt changed');
  }
  return receipt;
}

function notice(input) {
  if (input.hook_event_name !== 'UserPromptSubmit' || host.name() !== 'codex' || typeof input.prompt !== 'string') return '';
  const skill = findDocumentSkill(input.prompt);
  const isDesign = (skill?.documents || [skill]).some(candidate => candidate?.prefix === 'DESIGN');
  const invocation = input.prompt.trimStart().split(/\s/, 1)[0].replace(/^\$/, '/');
  if (!isDesign && invocation !== '/emeth-discipline:start-implementation') return '';
  const data = host.dataDir();
  if (!data || !input.session_id || !input.turn_id) return '';
  try {
    const source = capture(path.join(data, 'request-sources'), input);
    return `Current request source: ${source.path}`;
  } catch (error) {
    logDiagnostic({ hook: 'request-source', event: input.hook_event_name, error });
    return '';
  }
}

module.exports = { capture, notice };
