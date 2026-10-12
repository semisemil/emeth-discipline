'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CONFIG = '.emeth/documents.json';
const OWNER = '.emeth-project.json';
const DESIGN_PREFIX = '.emeth/designs/';
function fail(code, message) { throw Object.assign(new Error(message), { code }); }
function identity(value) { const resolved = path.resolve(value); return process.platform === 'win32' ? resolved.toLowerCase() : resolved; }
function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}
function readJson(file) {
  try {
    if (fs.lstatSync(file).isSymbolicLink()) fail('document-root-link', `Document configuration must be a regular file: ${file}`);
    if (fs.statSync(file).size > 16384) fail('document-roots-invalid', `Document configuration is too large: ${file}`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) fail('document-roots-invalid', `Invalid JSON: ${file}`);
    throw error;
  }
}
function rootPath(project, value) {
  if (typeof value !== 'string' || !value.trim() || /[\x00-\x1f]/.test(value)) fail('document-root-invalid', 'Supply a nonempty document directory path.');
  const target = path.resolve(project, value);
  let current = path.parse(target).root;
  for (const segment of path.relative(current, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) fail('document-root-link', `Document root contains a symbolic link or junction: ${current}`);
      if (!stat.isDirectory()) fail('document-root-invalid', `Document root is not a directory: ${current}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}
function configuration(project) {
  const emeth = path.join(project, '.emeth');
  if (fs.existsSync(emeth) && fs.lstatSync(emeth).isSymbolicLink()) fail('document-root-link', 'Project configuration contains a symbolic link or junction.');
  const file = path.join(project, CONFIG);
  const value = readJson(file);
  if (value === null && !fs.existsSync(file)) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema_version !== 1 || Object.keys(value).some(key => !['schema_version', 'root', 'architecture', 'designs'].includes(key))
      || !['root', 'architecture', 'designs'].some(key => Object.hasOwn(value, key))) fail('document-roots-invalid', 'Invalid .emeth/documents.json.');
  for (const key of ['root', 'architecture', 'designs']) if (Object.hasOwn(value, key)) rootPath(project, value[key]);
  return value;
}
function configuredRoot(project, kind) {
  const config = configuration(project);
  if (!config) return null;
  if (Object.hasOwn(config, kind)) return rootPath(project, config[kind]);
  return Object.hasOwn(config, 'root') ? rootPath(project, path.join(config.root, kind)) : null;
}
function checkOwner(project, directory) {
  const file = path.join(directory, OWNER);
  const owner = readJson(file);
  if (fs.existsSync(file) && (!owner || owner.schema_version !== 1 || typeof owner.project_root !== 'string'
      || identity(owner.project_root) !== identity(project))) {
    fail('document-project-mismatch', `Document directory belongs to another code project: ${directory}`);
  }
}
function prepareRoot(project, directory) {
  rootPath(project, directory);
  checkOwner(project, directory);
  fs.mkdirSync(directory, { recursive: true });
  rootPath(project, directory);
  if (!inside(project, directory)) {
    const file = path.join(directory, OWNER);
    try { fs.writeFileSync(file, JSON.stringify({ schema_version: 1, project_root: path.resolve(project) }, null, 2) + '\n', { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; checkOwner(project, directory); }
  }
  return directory;
}
function designStorage(project) {
  const selected = configuredRoot(project, 'designs');
  if (!selected) return { root: project, directory: path.join(project, '.emeth', 'designs'), configured: false };
  checkOwner(project, selected);
  return { root: selected, directory: selected, configured: true };
}
function designTarget(project, relativePath) {
  if (!relativePath.startsWith(DESIGN_PREFIX)) fail('document-path-invalid', 'Supply a Design document reference.');
  const storage = designStorage(project);
  const target = path.resolve(storage.directory, relativePath.slice(DESIGN_PREFIX.length));
  if (!inside(storage.directory, target)) fail('document-path-outside-project', 'Design path escapes its document root.');
  return target;
}
function designReference(project, file) {
  return DESIGN_PREFIX + path.relative(designStorage(project).directory, file).split(path.sep).join('/');
}
function architectureSetting(project) {
  const configured = configuredRoot(project, 'architecture');
  if (configured) return configured.split(path.sep).join('/');
  const binding = readJson(path.join(project, '.emeth', 'architecture.json'));
  return binding?.root || null;
}
module.exports = { CONFIG, OWNER, DESIGN_PREFIX, inside, rootPath, configuration, configuredRoot, checkOwner,
  prepareRoot, designStorage, designTarget, designReference, architectureSetting };
