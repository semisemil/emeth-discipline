const fs = require('node:fs');
const { migrateDirectory } = require('./storage-migration');
const os = require('node:os');
const path = require('node:path');

const SUPPORTED_MODES = Object.freeze(['normal', 'focus', 'core']);
const MODE_SET = new Set(SUPPORTED_MODES);
const SAFE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const MAX_SESSION_FILENAME_LENGTH = 180;

function normalizeMode(value) {
  if (typeof value !== 'string' || !/^[\x00-\x7f]+$/.test(value)) {
    return null;
  }
  const mode = value.toLowerCase();
  return MODE_SET.has(mode) ? mode : null;
}

function getConfigPath(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const homeDir = options.homeDir || os.homedir();
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  if (platform === 'win32') {
    return pathApi.join(
      env.APPDATA || pathApi.join(homeDir, 'AppData', 'Roaming'),
      'proofline',
      'config.json',
    );
  }
  return pathApi.join(
    env.XDG_CONFIG_HOME || pathApi.join(homeDir, '.config'),
    'proofline',
    'config.json',
  );
}

function isNativeFileName(value, platform = process.platform) {
  if (!value || /[\0/]/.test(value)) {
    return false;
  }
  if (platform !== 'win32') {
    return true;
  }
  return !/[<>:"\\|?*\x00-\x1f]/.test(value)
    && !/[ .]$/.test(value)
    && !WINDOWS_RESERVED_NAME.test(value);
}

function percentEncodeCharacter(character) {
  return [...Buffer.from(character, 'utf8')]
    .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`)
    .join('');
}

function percentEncodeCodeUnit(codeUnit) {
  return `%u${codeUnit.toString(16).toUpperCase().padStart(4, '0')}`;
}

function encodeSessionId(sessionId, platform = process.platform) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return null;
  }
  if (SAFE_SESSION_ID.test(sessionId) && isNativeFileName(sessionId, platform)) {
    return sessionId;
  }

  let encoded = '';
  for (let index = 0; index < sessionId.length; index += 1) {
    const codeUnit = sessionId.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = sessionId.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        encoded += percentEncodeCharacter(sessionId.slice(index, index + 2));
        index += 1;
      } else {
        encoded += percentEncodeCodeUnit(codeUnit);
      }
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      encoded += percentEncodeCodeUnit(codeUnit);
      continue;
    }
    const character = sessionId[index];
    encoded += /[A-Za-z0-9._-]/.test(character)
      ? character
      : percentEncodeCharacter(character);
  }

  if (platform === 'win32' && /[ .]$/.test(encoded)) {
    const last = encoded.slice(-1);
    encoded = `${encoded.slice(0, -1)}${percentEncodeCharacter(last)}`;
  }
  if (!isNativeFileName(encoded, platform)) {
    const first = [...encoded][0];
    encoded = `${percentEncodeCharacter(first)}${encoded.slice(first.length)}`;
  }
  return encoded;
}

function decodeSessionId(encodedSessionId) {
  if (typeof encodedSessionId !== 'string') {
    return null;
  }

  let decoded = '';
  let encodedBytes = '';
  const flushBytes = () => {
    if (!encodedBytes) {
      return true;
    }
    try {
      decoded += decodeURIComponent(encodedBytes);
      encodedBytes = '';
      return true;
    } catch {
      return false;
    }
  };

  for (let index = 0; index < encodedSessionId.length; index += 1) {
    if (encodedSessionId[index] !== '%') {
      if (!flushBytes()) {
        return null;
      }
      decoded += encodedSessionId[index];
      continue;
    }

    const codeUnitMatch = encodedSessionId.slice(index).match(/^%u([0-9A-Fa-f]{4})/);
    if (codeUnitMatch) {
      if (!flushBytes()) {
        return null;
      }
      decoded += String.fromCharCode(Number.parseInt(codeUnitMatch[1], 16));
      index += 5;
      continue;
    }

    const byteMatch = encodedSessionId.slice(index).match(/^%[0-9A-Fa-f]{2}/);
    if (!byteMatch) {
      return null;
    }
    encodedBytes += byteMatch[0];
    index += 2;
  }

  return flushBytes() ? decoded : null;
}

function getSessionPath(sessionId, options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const encoded = encodeSessionId(sessionId, platform);
  if (!encoded) {
    return null;
  }
  const fileName = `${encoded}.json`;
  if (fileName.length > MAX_SESSION_FILENAME_LENGTH || !env.PLUGIN_DATA) {
    return null;
  }
  if (platform === process.platform) migrateDirectory(env.PLUGIN_DATA, 'proofline-mode', 'rules-mode');
  return pathApi.join(env.PLUGIN_DATA, 'rules-mode', fileName);
}

function logDiagnostic(details, options = {}) {
  const fsModule = options.fsModule || fs;
  const homeDir = options.homeDir || os.homedir();
  const logPath = path.join(homeDir, '.codex', 'log', 'proofline-hook.log');
  const error = details.error || {};
  const entry = {
    time: new Date().toISOString(),
    pid: process.pid,
    hook: details.hook,
    event: details.event,
    code: error.code,
    errno: error.errno,
    syscall: error.syscall,
    pluginRoot: details.pluginRoot,
    skillPath: details.skillPath || details.filePath,
    filePath: details.filePath,
    message: details.message || error.message,
  };

  try {
    fsModule.mkdirSync(path.dirname(logPath), { recursive: true });
    fsModule.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (logError) {
    console.error(`Emeth Discipline hook log failed: ${logError.message}`);
  }
}

function readModeFile(filePath, fallbackMode, details, options = {}) {
  const fsModule = options.fsModule || fs;
  try {
    const parsed = JSON.parse(fsModule.readFileSync(filePath, 'utf8'));
    const key = details.kind === 'default' ? 'defaultMode' : 'mode';
    const storedMode = parsed && parsed[key];
    // Preserve saved response preferences from before the core rename.
    const mode = normalizeMode(storedMode === 'caveman' ? 'core' : storedMode);
    if (!mode) {
      throw new Error(`Unsupported Emeth Discipline ${details.kind} mode.`);
    }
    return { mode, exists: true, valid: true };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { mode: fallbackMode, exists: false, valid: true };
    }
    logDiagnostic({ ...details, error, filePath }, options);
    return { mode: fallbackMode, exists: true, valid: false };
  }
}

function readDefaultMode(options = {}) {
  return readModeFile(
    getConfigPath(options),
    'normal',
    { hook: options.hook, event: options.event, kind: 'default' },
    options,
  ).mode;
}

function writeJsonAtomic(filePath, value, options = {}) {
  const fsModule = options.fsModule || fs;
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  fsModule.mkdirSync(directory, { recursive: true });
  try {
    fsModule.writeFileSync(temporaryPath, JSON.stringify(value), { encoding: 'utf8', flag: 'wx' });
    fsModule.renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      fsModule.unlinkSync(temporaryPath);
    } catch {
      // The temporary file may not have been created.
    }
    throw error;
  }
}

function writeModeFile(filePath, value, details, options = {}) {
  try {
    writeJsonAtomic(filePath, value, options);
    return { ok: true };
  } catch (error) {
    logDiagnostic({ ...details, error, filePath }, options);
    return { ok: false, error };
  }
}

function getCurrentMode(sessionId, options = {}) {
  const defaultMode = readDefaultMode(options);
  const sessionPath = getSessionPath(sessionId, options);
  if (!sessionPath) {
    return { mode: defaultMode, defaultMode, persistent: false };
  }

  const state = readModeFile(
    sessionPath,
    defaultMode,
    { hook: options.hook, event: options.event, kind: 'session' },
    options,
  );
  if (!state.exists && options.initialize !== false) {
    const result = writeModeFile(
      sessionPath,
      { mode: defaultMode },
      { hook: options.hook, event: options.event, kind: 'session' },
      options,
    );
    return { mode: defaultMode, defaultMode, persistent: result.ok };
  }
  return { mode: state.mode, defaultMode, persistent: state.exists };
}

function setCurrentMode(sessionId, mode, options = {}) {
  const normalized = normalizeMode(mode);
  const sessionPath = getSessionPath(sessionId, options);
  if (!normalized) {
    return { ok: false, reason: 'invalid-mode' };
  }
  if (!sessionPath) {
    return { ok: false, reason: 'session-state-unavailable' };
  }
  const result = writeModeFile(
    sessionPath,
    { mode: normalized },
    { hook: options.hook, event: options.event, kind: 'session' },
    options,
  );
  return result.ok ? result : { ...result, reason: 'write-failed' };
}

function setDefaultMode(mode, options = {}) {
  const normalized = normalizeMode(mode);
  if (!normalized) {
    return { ok: false };
  }
  return writeModeFile(
    getConfigPath(options),
    { defaultMode: normalized },
    { hook: options.hook, event: options.event, kind: 'default' },
    options,
  );
}

module.exports = {
  MAX_SESSION_FILENAME_LENGTH,
  SUPPORTED_MODES,
  decodeSessionId,
  encodeSessionId,
  getConfigPath,
  getCurrentMode,
  getSessionPath,
  isNativeFileName,
  logDiagnostic,
  normalizeMode,
  readDefaultMode,
  setCurrentMode,
  setDefaultMode,
  writeJsonAtomic,
};
