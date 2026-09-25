'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { migrateProject } = require('../lib/storage-migration');
const os = require('node:os');
const path = require('node:path');

const SCHEMA_VERSION = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_LOCK_TIMEOUT_MS = 5000;
const DEFAULT_LOCK_RETRY_MS = 10;
const DEFAULT_MALFORMED_LOCK_STALE_MS = 30000;
const LOCK_SLEEP_STATE = new Int32Array(new SharedArrayBuffer(4));

class RegistryError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'RegistryError';
    this.code = code;
  }
}

function emptyRegistry() {
  return { schema_version: SCHEMA_VERSION, projects: [] };
}

function getDashboardConfigDir(options = {}) {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const home = options.homedir || os.homedir();

  if (platform === 'win32') {
    if (typeof env.APPDATA !== 'string' || env.APPDATA.trim() === '') {
      throw new RegistryError('config-unavailable', 'APPDATA가 설정되지 않았습니다.');
    }
    return path.join(env.APPDATA, 'emeth', 'dashboard');
  }

  const configHome = typeof env.XDG_CONFIG_HOME === 'string' && env.XDG_CONFIG_HOME.trim() !== ''
    ? env.XDG_CONFIG_HOME
    : path.join(home, '.config');
  return path.join(configHome, 'emeth', 'dashboard');
}

function getRegistryPath(options = {}) {
  return path.join(getDashboardConfigDir(options), 'projects.json');
}

function rootKey(root, platform = process.platform) {
  const normalized = path.normalize(root);
  return platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized;
}

function invalidRegistry(message, cause) {
  return new RegistryError('registry-invalid', message, cause);
}

function validateRegistry(registry, options = {}) {
  const platform = options.platform || process.platform;
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)
    || registry.schema_version !== SCHEMA_VERSION || !Array.isArray(registry.projects)
    || Object.keys(registry).sort().join(',') !== 'projects,schema_version') {
    throw invalidRegistry('projects.json 스키마가 올바르지 않습니다.');
  }

  const ids = new Set();
  const roots = new Set();
  for (const project of registry.projects) {
    if (!project || typeof project !== 'object' || Array.isArray(project)
      || Object.keys(project).sort().join(',') !== 'id,registered_at,root'
      || !UUID.test(project.id || '')
      || typeof project.root !== 'string' || !path.isAbsolute(project.root)
      || typeof project.registered_at !== 'string'
      || Number.isNaN(Date.parse(project.registered_at))) {
      throw invalidRegistry('projects.json 프로젝트 항목이 올바르지 않습니다.');
    }

    const id = project.id.toLowerCase();
    const root = rootKey(project.root, platform);
    if (ids.has(id)) {
      throw invalidRegistry(`projects.json에 중복 프로젝트 ID가 있습니다: ${project.id}`);
    }
    if (roots.has(root)) {
      throw invalidRegistry(`projects.json에 중복 프로젝트 루트가 있습니다: ${project.root}`);
    }
    ids.add(id);
    roots.add(root);
  }

  return registry;
}

function readRegistry(options = {}) {
  const registryPath = options.registryPath || getRegistryPath(options);
  let content;
  try {
    content = fs.readFileSync(registryPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { registry: emptyRegistry(), registryPath };
    }
    throw new RegistryError('registry-read-failed', `projects.json을 읽지 못했습니다: ${error.message}`, error);
  }

  let registry;
  try {
    registry = JSON.parse(content.replace(/^\uFEFF/, ''));
  } catch (error) {
    throw invalidRegistry(`projects.json JSON이 올바르지 않습니다: ${error.message}`, error);
  }
  return { registry: validateRegistry(registry, options), registryPath };
}

function lockOption(options, name, fallback) {
  const value = options[name];
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function sleepFor(milliseconds) {
  if (milliseconds > 0) {
    Atomics.wait(LOCK_SLEEP_STATE, 0, 0, milliseconds);
  }
}

function pidExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function readRegistryLock(lockPath) {
  try {
    const value = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (!value || value.schema_version !== 1 || !UUID.test(value.token || '')
      || !Number.isInteger(value.owner_pid) || value.owner_pid <= 0
      || typeof value.started_at !== 'string' || Number.isNaN(Date.parse(value.started_at))) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, value };
  } catch (error) {
    return error.code === 'ENOENT'
      ? { ok: false, reason: 'missing' }
      : { ok: false, reason: 'invalid' };
  }
}

function sameIdentity(first, second) {
  return first.dev === second.dev && first.ino === second.ino;
}

function isExistingLockContention(error, lockPath) {
  if (error.code === 'EEXIST') {
    return true;
  }
  return new Set(['EACCES', 'EBUSY', 'EPERM']).has(error.code) && fs.existsSync(lockPath);
}

function isRecoveryClaimContention(error, recoveryPath, options) {
  if (isExistingLockContention(error, recoveryPath)) {
    return true;
  }
  const platform = options.platform || process.platform;
  return platform === 'win32' && error.code === 'EPERM';
}

function tryRecoverRegistryLock(lockPath, options) {
  const recoveryPath = `${lockPath}.recovery`;
  let recoveryDescriptor;
  try {
    recoveryDescriptor = fs.openSync(recoveryPath, 'wx');
  } catch (error) {
    if (isRecoveryClaimContention(error, recoveryPath, options)) {
      return false;
    }
    throw new RegistryError(
      'registry-lock-failed',
      `projects.json lock 복구를 시작하지 못했습니다: ${error.message}`,
      error
    );
  }

  try {
    fs.closeSync(recoveryDescriptor);
    recoveryDescriptor = undefined;
    let firstStatus;
    try {
      firstStatus = fs.lstatSync(lockPath, { bigint: true });
    } catch (error) {
      return error.code === 'ENOENT';
    }

    const lock = readRegistryLock(lockPath);
    let currentStatus;
    try {
      currentStatus = fs.lstatSync(lockPath, { bigint: true });
    } catch (error) {
      return error.code === 'ENOENT';
    }
    if (!sameIdentity(firstStatus, currentStatus)) {
      return false;
    }

    const malformedStaleMs = lockOption(
      options,
      'malformedLockStaleMs',
      DEFAULT_MALFORMED_LOCK_STALE_MS
    );
    const age = Date.now() - Number(currentStatus.mtimeMs);
    const recoverable = lock.ok
      ? !pidExists(lock.value.owner_pid)
      : lock.reason === 'invalid' && age >= malformedStaleMs;
    if (!recoverable) {
      return false;
    }

    try {
      fs.unlinkSync(lockPath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return true;
      }
      throw new RegistryError(
        'registry-lock-failed',
        `projects.json의 종료된 lock을 제거하지 못했습니다: ${error.message}`,
        error
      );
    }
  } finally {
    if (recoveryDescriptor !== undefined) {
      try { fs.closeSync(recoveryDescriptor); } catch { /* preserve the primary result */ }
    }
    try { fs.unlinkSync(recoveryPath); } catch (error) {
      if (error.code !== 'ENOENT') {
        // A later caller will stop instead of removing an unowned recovery claim.
      }
    }
  }
}

function acquireRegistryLock(registryPath, options) {
  const lockPath = `${registryPath}.lock`;
  const token = crypto.randomUUID();
  const timeoutMs = lockOption(options, 'lockTimeoutMs', DEFAULT_LOCK_TIMEOUT_MS);
  const retryMs = lockOption(options, 'lockRetryMs', DEFAULT_LOCK_RETRY_MS);
  const deadline = Date.now() + timeoutMs;
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });

  while (true) {
    let descriptor;
    let created = false;
    try {
      descriptor = fs.openSync(lockPath, 'wx');
      created = true;
      fs.writeFileSync(descriptor, JSON.stringify({
        schema_version: 1,
        token,
        owner_pid: process.pid,
        started_at: new Date().toISOString()
      }), 'utf8');
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      return { lockPath, token };
    } catch (error) {
      if (descriptor !== undefined) {
        try { fs.closeSync(descriptor); } catch { /* preserve the primary error */ }
      }
      if (created) {
        try { fs.unlinkSync(lockPath); } catch { /* preserve the primary error */ }
      }
      if (!isExistingLockContention(error, lockPath)) {
        throw new RegistryError(
          'registry-lock-failed',
          `projects.json lock을 만들지 못했습니다: ${error.message}`,
          error
        );
      }
      if (tryRecoverRegistryLock(lockPath, options)) {
        continue;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new RegistryError(
          'registry-lock-timeout',
          '다른 Emeth Discipline 작업이 projects.json을 갱신 중입니다.'
        );
      }
      sleepFor(Math.min(retryMs, remaining));
    }
  }
}

function releaseRegistryLock(lock) {
  const current = readRegistryLock(lock.lockPath);
  if (!current.ok || current.value.token !== lock.token) {
    throw new RegistryError(
      'registry-lock-lost',
      'projects.json lock 소유권을 확인하지 못했습니다.'
    );
  }
  try {
    fs.unlinkSync(lock.lockPath);
  } catch (error) {
    throw new RegistryError(
      'registry-lock-release-failed',
      `projects.json lock을 해제하지 못했습니다: ${error.message}`,
      error
    );
  }
}

function withRegistryLock(registryPath, options, action) {
  const lock = acquireRegistryLock(registryPath, options);
  let actionError;
  try {
    return action();
  } catch (error) {
    actionError = error;
    throw error;
  } finally {
    try {
      releaseRegistryLock(lock);
    } catch (releaseError) {
      if (actionError) {
        actionError.lockReleaseError = releaseError;
      } else {
        throw releaseError;
      }
    }
  }
}

function normalizeProjectRoot(projectRoot) {
  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
    throw new RegistryError('project-root-invalid', '프로젝트 루트가 필요합니다.');
  }

  const absolute = path.resolve(projectRoot);
  let realRoot;
  try {
    const realpath = fs.realpathSync.native || fs.realpathSync;
    realRoot = path.normalize(realpath(absolute));
    if (!fs.statSync(realRoot).isDirectory()) {
      throw new Error('디렉터리가 아닙니다.');
    }
  } catch (error) {
    throw new RegistryError(
      'project-root-invalid',
      `존재하는 프로젝트 디렉터리가 아닙니다: ${absolute}`,
      error
    );
  }
  return realRoot;
}

function writeRegistry(registryPath, registry) {
  const directory = path.dirname(registryPath);
  const temporaryPath = path.join(
    directory,
    `.projects.json.${process.pid}.${crypto.randomUUID()}.tmp`
  );

  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx'
    });
    fs.renameSync(temporaryPath, registryPath);
  } catch (error) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') {
        error.cleanupError = cleanupError;
      }
    }
    throw new RegistryError('registry-write-failed', `projects.json을 교체하지 못했습니다: ${error.message}`, error);
  }
}

function registerProject(projectRoot, options = {}) {
  const platform = options.platform || process.platform;
  const normalizedRoot = normalizeProjectRoot(projectRoot);
  migrateProject(normalizedRoot);
  const registryPath = options.registryPath || getRegistryPath(options);
  return withRegistryLock(registryPath, options, () => {
    const { registry } = readRegistry({ ...options, registryPath });
    const existing = registry.projects.find(
      (project) => rootKey(project.root, platform) === rootKey(normalizedRoot, platform)
    );
    if (existing) {
      return { status: 'no-op', project: existing, registryPath };
    }

    const project = {
      id: (options.randomUUID || crypto.randomUUID)(),
      root: normalizedRoot,
      registered_at: (options.now || (() => new Date().toISOString()))()
    };
    const next = {
      schema_version: SCHEMA_VERSION,
      projects: [...registry.projects, project]
    };
    validateRegistry(next, options);
    writeRegistry(registryPath, next);
    return { status: 'registered', project, registryPath };
  });
}

function forgetProject(projectId, options = {}) {
  if (!UUID.test(projectId || '')) {
    throw new RegistryError('project-id-invalid', '프로젝트 ID가 올바르지 않습니다.');
  }
  const registryPath = options.registryPath || getRegistryPath(options);
  return withRegistryLock(registryPath, options, () => {
    const { registry } = readRegistry({ ...options, registryPath });
    const index = registry.projects.findIndex(
      (project) => project.id.toLowerCase() === projectId.toLowerCase()
    );
    if (index === -1) {
      return { status: 'no-op', project: null, registryPath };
    }
    const project = registry.projects[index];
    const next = {
      schema_version: SCHEMA_VERSION,
      projects: registry.projects.filter((_item, projectIndex) => projectIndex !== index)
    };
    validateRegistry(next, options);
    writeRegistry(registryPath, next);
    return { status: 'forgotten', project, registryPath };
  });
}

module.exports = {
  RegistryError,
  emptyRegistry,
  forgetProject,
  getDashboardConfigDir,
  getRegistryPath,
  normalizeProjectRoot,
  readRegistry,
  registerProject,
  rootKey,
  validateRegistry,
  writeRegistry
};
