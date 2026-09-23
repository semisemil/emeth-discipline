'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const { execFileSync } = require('node:child_process');

const MARKER = '.emeth-migration.json';
const sleepState = new Int32Array(new SharedArrayBuffer(4));
function fail(code, message) { throw Object.assign(new Error(message), { code }); }
function stat(file) {
  try { return fs.lstatSync(file); } catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) return null; throw error; }
}
function directory(file) {
  const value = stat(file);
  if (!value || !value.isDirectory() || value.isSymbolicLink()) {
    fail('migration-path-invalid', `Migration requires an ordinary directory: ${file}`);
  }
}
function lock(file, action) {
  const deadline = Date.now() + 5000;
  let descriptor;
  while (descriptor === undefined) {
    try { descriptor = fs.openSync(file, 'wx'); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const before = stat(file);
      if (!before) continue;
      if (before.isSymbolicLink()) fail('migration-locked', `Migration lock unavailable: ${file}`);
      let pid;
      try { pid = JSON.parse(fs.readFileSync(file, 'utf8')).pid; } catch { /* A live owner may still be writing. */ }
      if (Number.isInteger(pid) && pid > 0) {
        try { process.kill(pid, 0); }
        catch (failure) {
          if (failure.code === 'ESRCH') {
            const now = stat(file);
            if (now && now.ino === before.ino && now.dev === before.dev) fs.unlinkSync(file);
            continue;
          }
        }
      }
      if (Date.now() >= deadline) fail('migration-locked', `Storage migration is already running: ${file}`);
      Atomics.wait(sleepState, 0, 0, 20);
    }
  }
  try {
    fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid }));
    return action();
  } finally {
    fs.closeSync(descriptor);
    fs.unlinkSync(file);
  }
}
function rewritePaths(text) {
  return text.replace(/(^|[^A-Za-z0-9_.-])\.proofline(?=[/\\])/g, '$1.emeth');
}
function changesIn(root) {
  const changes = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) fail('migration-path-invalid', `Migration cannot follow a symbolic link: ${file}`);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && /\.(json|md)$/i.test(entry.name) && entry.name !== MARKER) {
        const bytes = fs.readFileSync(file);
        let text;
        try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
        catch { continue; } // Preserve non-text attachments byte for byte.
        const next = rewritePaths(text);
        if (next !== text) changes.push({ relative: path.relative(root, file), text: next, mode: fs.statSync(file).mode });
      }
    }
  }
  visit(root);
  return changes;
}
function migrateIgnoreRules(root) {
  const files = [path.join(root, '.gitignore')];
  try {
    const exclude = execFileSync('git', ['-C', root, 'rev-parse', '--git-path', 'info/exclude'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
    files.push(path.resolve(root, exclude));
  } catch { /* A project need not be a Git repository. */ }
  for (const file of files) {
    const info = stat(file);
    if (!info) continue;
    if (!info.isFile() || info.isSymbolicLink()) fail('migration-path-invalid', `Invalid Git ignore file: ${file}`);
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    const additions = lines.filter(line => !line.startsWith('#') && /(^|[/!])\.proofline(?=\/|$)/.test(line))
      .map(line => line.replace(/(^|[/!])\.proofline(?=\/|$)/g, '$1.emeth')).filter(line => !lines.includes(line));
    if (additions.length) {
      const newline = text.includes('\r\n') ? '\r\n' : '\n';
      fs.appendFileSync(file, `${text.endsWith('\n') || !text ? '' : newline}${additions.join(newline)}${newline}`);
    }
  }
}
function migrateDirectory(base, legacyName, currentName, options = {}) {
  const root = path.resolve(base);
  if ([legacyName, currentName].some(name => !name || path.basename(name) !== name || name === '.' || name === '..')) {
    fail('migration-path-invalid', 'Migration names must be immediate child directories.');
  }
  const legacy = path.join(root, legacyName);
  const current = path.join(root, currentName);
  const pending = path.join(current, MARKER);
  if (!stat(legacy) && !stat(pending)) return current;
  directory(root);
  return lock(path.join(root, `.${currentName.replace(/^\./, '')}.migration-lock`), () => {
    const old = stat(legacy);
    if (old && stat(current)) fail('migration-conflict', `Both storage directories exist; neither was overwritten: ${legacy}, ${current}`);
    if (!old && !stat(pending)) return current;
    const source = old ? legacy : current;
    directory(source);
    const marker = path.join(source, MARKER);
    const markerStat = stat(marker);
    if (markerStat) {
      if (markerStat.isSymbolicLink() || !markerStat.isFile()) fail('migration-path-invalid', `Invalid migration marker: ${marker}`);
      const value = JSON.parse(fs.readFileSync(marker, 'utf8'));
      if (value.version !== 1 || value.from !== legacyName || value.to !== currentName) fail('migration-conflict', `Unexpected migration marker: ${marker}`);
    }
    const changes = options.rewriteProjectPaths ? changesIn(source) : [];
    if (!markerStat) fs.writeFileSync(marker, JSON.stringify({ version: 1, from: legacyName, to: currentName }), { flag: 'wx' });
    if (old) fs.renameSync(legacy, current);
    for (const change of changes) {
      const file = path.join(current, change.relative);
      const temporary = `${file}.${crypto.randomUUID()}.migration-tmp`;
      try {
        fs.writeFileSync(temporary, change.text, { flag: 'wx', mode: change.mode });
        fs.renameSync(temporary, file);
      } finally { if (stat(temporary)) fs.unlinkSync(temporary); }
    }
    if (options.rewriteProjectPaths) migrateIgnoreRules(root);
    fs.unlinkSync(pending);
    return current;
  });
}
function migrateProject(root) {
  return migrateDirectory(root, '.proofline', '.emeth', { rewriteProjectPaths: true });
}
function migrateWorkingProject(cwd) {
  let root = path.resolve(cwd);
  while (true) {
    if (stat(path.join(root, '.proofline')) || stat(path.join(root, '.emeth'))) return migrateProject(root);
    const parent = path.dirname(root);
    if (parent === root || stat(path.join(root, '.git'))) return path.join(path.resolve(cwd), '.emeth');
    root = parent;
  }
}
module.exports = { migrateDirectory, migrateProject, migrateWorkingProject, rewritePaths };

if (require.main === module) {
  try {
    if (process.argv.length !== 3) fail('migration-argument-invalid', 'Usage: storage-migration.js PROJECT_ROOT');
    process.stdout.write(`${migrateProject(process.argv[2])}\n`);
  } catch (error) {
    process.stderr.write(`${error.code || 'migration-failed'}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
