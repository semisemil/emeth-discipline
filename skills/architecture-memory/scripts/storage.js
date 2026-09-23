'use strict';

const fs = require('node:fs');
const { migrateProject } = require('../../../lib/storage-migration');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');

const BINDING = '.emeth/architecture.json';
const WORK = '.architecture-memory/work';
function fail(code, message) { throw Object.assign(new Error(message), { code }); }
function relative(value) {
  if (typeof value !== 'string' || !value || /[\\\x00-\x1f:*?]/.test(value) || path.isAbsolute(value)
      || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail('memory-path-invalid', `Expected normalized relative path: ${value}`);
  }
  return value;
}
function safePath(root, name) {
  relative(name);
  let target = fs.realpathSync(root);
  for (const part of name.split('/')) {
    target = path.join(target, part);
    try { if (fs.lstatSync(target).isSymbolicLink()) fail('memory-symlink', `Symbolic link is outside the write contract: ${name}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}
function textFile(file, maxBytes = 2 * 1024 * 1024) {
  if (!fs.existsSync(file)) return null;
  if (!fs.statSync(file).isFile() || fs.statSync(file).size > maxBytes) fail('memory-file-invalid', `Invalid or oversized file: ${file}`);
  return new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(file));
}
function jsonFile(file, maxBytes) {
  const source = textFile(file, maxBytes);
  if (source === null) return null;
  try { return JSON.parse(source); } catch { fail('memory-json-invalid', `Invalid JSON: ${file}`); }
}
function atomicWrite(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, text, { flag: 'wx' }); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function hash(value) { return value === null ? null : crypto.createHash('sha256').update(value).digest('hex'); }
function saveJson(file, value) { atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`); }
function binding(project) {
  migrateProject(project);
  const value = jsonFile(safePath(project, BINDING), 4096);
  if (value === null) return null;
  if (value.schema_version !== 1 || Object.keys(value).some(key => !['root', 'schema_version', 'enabled'].includes(key))
      || (value.enabled !== undefined && typeof value.enabled !== 'boolean')
      || !relative(value.root).startsWith('docs/')) fail('memory-binding-invalid', 'Invalid project memory binding.');
  safePath(project, value.root);
  return value;
}
function exclusive(root, action) {
  const file = safePath(root, `${WORK}/lock`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const ignored = safePath(root, `${WORK}/.gitignore`);
  if (!fs.existsSync(ignored)) fs.writeFileSync(ignored, '*\n');
  if (fs.existsSync(file)) {
    const lock = jsonFile(file, 1024);
    if (!Number.isInteger(lock?.pid) || lock.pid <= 0) fail('memory-locked', 'Invalid work lock; inspect its owner before removing it.');
    try { process.kill(lock.pid, 0); fail('memory-locked', 'Another memory operation is active.'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    fs.unlinkSync(file);
  }
  fs.writeFileSync(file, JSON.stringify({ pid: process.pid }), { flag: 'wx' });
  try { return action(); } finally { fs.unlinkSync(file); }
}
module.exports = { BINDING, WORK, fail, relative, safePath, textFile, jsonFile, atomicWrite, hash, saveJson, binding, exclusive };
