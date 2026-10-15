'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { migrateProject } = require('./storage-migration');
const host = require('./host');
const path = require('node:path');
const S = require('../skills/architecture-memory/scripts/storage.js');

function projectFor(cwd) {
  let directory = path.resolve(cwd);
  for (let depth = 0; depth < 12; depth += 1) {
    if (fs.existsSync(path.join(directory, '.proofline', 'architecture.json'))) migrateProject(directory);
    if (fs.existsSync(path.join(directory, S.BINDING))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory || fs.existsSync(path.join(directory, '.git'))) return null;
    directory = parent;
  }
  return null;
}
function connectionStatus(project) {
  try {
    const linked = S.binding(project);
    if (!linked) return { status: 'not-connected' };
    if (linked.enabled === false) return { status: 'disabled', root: linked.root };
    const root = S.rootPath(project, linked.root);
    const manifest = fs.existsSync(root) ? S.jsonFile(S.safePath(root, '.architecture-memory/manifest.json'), 256 * 1024) : null;
    const state = fs.existsSync(root) ? S.jsonFile(S.safePath(root, `${S.WORK}/state.json`), 128 * 1024 * 1024) : null;
    const active = manifest?.schema_version === 2 && manifest.managed === true
      && (!state || state.schema_version === 1 && ['draft', 'applied'].includes(state.phase));
    return { status: active ? 'connected' : manifest?.managed === false ? 'disabled' : 'unavailable', root: linked.root };
  } catch (error) {
    return { status: 'failed', error: { code: error.code || 'memory-status-failed', message: error.message } };
  }
}
function notice(input, options = {}) {
  const pluginRoot = options.pluginRoot || path.resolve(__dirname, '..');
  const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
  const project = projectFor(cwd);
  // Uninitialized projects do not load skills, scan docs, or create notice state.
  if (!project) return '';
  const linked = connectionStatus(project);
  if (linked.status === 'failed') throw Object.assign(new Error(linked.error.message), { code: linked.error.code });
  const active = linked.status === 'connected';
  const skill = path.join(pluginRoot, 'skills', 'architecture-memory', 'SKILL.md');
  const fingerprint = active && fs.existsSync(skill) ? S.hash(`${project}\0${linked.root}\0${skill}`) : 'inactive';
  const identity = input.agent_id || input.session_id || input.thread_id;
  if (!identity) return ''; // Without identity, per-turn repetition cannot be bounded reliably.
  const data = options.dataRoot || host.dataDir({ temporaryFallback: true });
  const cache = path.join(data, 'architecture-notices', `${S.hash(`${identity}\0${project}`)}.json`);
  const previous = S.jsonFile(cache, 4096);
  const reset = input.hook_event_name === 'SessionStart' && ['startup', 'clear', 'compact'].includes(input.source);
  if (!reset && previous?.fingerprint === fingerprint) return '';
  if (fingerprint === 'inactive' && !previous) return '';
  S.saveJson(cache, { fingerprint });
  if (fingerprint === 'inactive') return 'Project architecture memory connection is unavailable or disabled.';
  const connected = `Project architecture memory is connected at ${JSON.stringify(linked.root)} via .emeth/architecture.json. Skill: ${JSON.stringify(skill)}.`;
  const behind = commitsBehind(project, linked.root);
  return behind ? `${connected} Its Git checkpoint is ${behind} ${behind === 1 ? 'commit' : 'commits'} behind HEAD; suggest architecture-memory-update when this affects the task.` : connected;
}
// Only a recorded checkpoint is measured; a minimal Memory has none until its first update.
function commitsBehind(project, root) {
  try {
    const manifest = S.jsonFile(S.safePath(S.rootPath(project, root), '.architecture-memory/manifest.json'), 256 * 1024);
    const revision = manifest?.git_checkpoint?.revision;
    if (typeof revision !== 'string' || !/^[0-9a-f]{7,64}$/i.test(revision)) return 0;
    const result = spawnSync('git', ['-C', project, 'rev-list', '--count', `${revision}..HEAD`],
      { encoding: 'utf8', timeout: 3000, windowsHide: true });
    return result.status === 0 ? Number(result.stdout.trim()) || 0 : 0;
  } catch {
    return 0;
  }
}
module.exports = { notice, projectFor, connectionStatus };
