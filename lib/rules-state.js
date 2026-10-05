const fs = require('node:fs');
const path = require('node:path');
const host = require('./host');

const SAFE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const MAX_SESSION_FILENAME_LENGTH = 180;

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

function getModelPath(sessionId, options = {}) {
  const env = options.env || process.env;
  if (host.name(env) !== 'codex') return null;
  const data = host.dataDir({ env });
  const platform = options.platform || process.platform;
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const encoded = encodeSessionId(sessionId, platform);
  if (!encoded) {
    return null;
  }
  const fileName = `${encoded}.json`;
  if (fileName.length > MAX_SESSION_FILENAME_LENGTH || !data) {
    return null;
  }
  return pathApi.join(data, 'rules-model', fileName);
}

function logDiagnostic(details, options = {}) {
  const fsModule = options.fsModule || fs;
  const logPath = path.join(host.logDir(options), 'emeth-hook.log');
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

module.exports = {
  MAX_SESSION_FILENAME_LENGTH,
  decodeSessionId,
  encodeSessionId,
  getModelPath,
  isNativeFileName,
  logDiagnostic,
  writeJsonAtomic,
};
