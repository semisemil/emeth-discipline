'use strict';

// Global user settings shared by every Codex and Claude Code session of this user.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { getDashboardConfigDir } = require('../dashboard/registry');

// Setting name used by commands → property stored in settings.json. Every setting defaults to off.
const SETTINGS = Object.freeze({ 'work-records': 'work_records', inbox: 'inbox' });
const SCHEMA_VERSION = 1;

function settingsError(message, file) {
  return Object.assign(new Error(`${message}: ${file}`), { code: 'INVALID_SETTINGS', path: file });
}

function settingsPath(options = {}) {
  return path.join(path.dirname(getDashboardConfigDir(options)), 'settings.json');
}

function readJsonFile(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > 16384) throw settingsError('Invalid settings file', file);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) throw settingsError('Invalid settings file', file);
    throw error;
  }
}

function readStored(file) {
  const value = readJsonFile(file);
  if (value === null) return {};
  const properties = Object.values(SETTINGS);
  if (!value || Array.isArray(value) || value.schema_version !== SCHEMA_VERSION
      || Object.entries(value).some(([key, setting]) => key !== 'schema_version'
        && (!properties.includes(key) || typeof setting !== 'boolean'))) {
    throw settingsError('Invalid settings file', file);
  }
  const { schema_version: _version, ...stored } = value;
  return stored;
}

// Earlier releases stored each setting in its own file. They are read until settings.json
// records the setting, and left in place for older installations that still read them.
function readLegacy(options) {
  const legacy = {};
  const records = readJsonFile(path.join(path.dirname(getDashboardConfigDir(options)), 'work-records.json'));
  if (records && typeof records.enabled === 'boolean') legacy.work_records = records.enabled;
  if (fs.existsSync(path.join(getDashboardConfigDir(options), 'inbox.enabled'))) legacy.inbox = true;
  return legacy;
}

function readSettings(options = {}) {
  const file = settingsPath(options);
  const stored = readStored(file);
  const legacy = Object.values(SETTINGS).some(key => !(key in stored)) ? readLegacy(options) : {};
  const settings = {};
  for (const [name, key] of Object.entries(SETTINGS)) {
    const configured = key in stored || key in legacy;
    settings[name] = { enabled: stored[key] ?? legacy[key] ?? false, configured };
  }
  return { path: file, settings };
}

function isEnabled(name, options = {}) {
  if (!(name in SETTINGS)) throw Object.assign(new Error(`Unknown setting: ${name}`), { code: 'UNKNOWN_SETTING' });
  return readSettings(options).settings[name].enabled;
}

function writeSetting(name, enabled, options = {}) {
  if (!(name in SETTINGS)) throw Object.assign(new Error(`Unknown setting: ${name}`), { code: 'UNKNOWN_SETTING' });
  if (typeof enabled !== 'boolean') throw Object.assign(new Error('Expected on or off'), { code: 'INVALID_VALUE' });
  const current = readSettings(options);
  const next = { schema_version: SCHEMA_VERSION };
  for (const [settingName, key] of Object.entries(SETTINGS)) {
    if (current.settings[settingName].configured) next[key] = current.settings[settingName].enabled;
  }
  next[SETTINGS[name]] = enabled;
  fs.mkdirSync(path.dirname(current.path), { recursive: true });
  const temporary = `${current.path}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(next)}\n`, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, current.path);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return readSettings(options);
}

module.exports = { SETTINGS, settingsPath, readSettings, isEnabled, writeSetting };
