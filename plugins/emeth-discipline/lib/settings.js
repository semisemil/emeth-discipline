'use strict';

// Global user settings shared by every Codex and Claude Code session of this user.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { getDashboardConfigDir } = require('../dashboard/registry');

// Setting name used by commands → property stored in settings.json. Every setting defaults to off.
const SETTINGS = Object.freeze({ 'work-records': 'work_records', inbox: 'inbox', language: 'language' });
// Command value → stored value. A null value removes the property and restores the default.
const TOGGLE = Object.freeze({ on: true, off: false });
const VALUES = Object.freeze({
  'work-records': TOGGLE,
  inbox: TOGGLE,
  // Each language needs skills/rules/references/language-<value>.md.
  language: Object.freeze({ ko: 'ko', off: null }),
});
const SCHEMA_VERSION = 1;

function storedValueAllowed(key, value) {
  const name = Object.keys(SETTINGS).find(settingName => SETTINGS[settingName] === key);
  return name !== undefined && value !== null && Object.values(VALUES[name]).includes(value);
}

function entry(name, value, configured) {
  return VALUES[name] === TOGGLE ? { enabled: value ?? false, configured } : { value: value ?? null, configured };
}

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
  if (!value || Array.isArray(value) || value.schema_version !== SCHEMA_VERSION
      || Object.entries(value).some(([key, setting]) => key !== 'schema_version' && !storedValueAllowed(key, setting))) {
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
  const legacy = ['work_records', 'inbox'].some(key => !(key in stored)) ? readLegacy(options) : {};
  const settings = {};
  for (const [name, key] of Object.entries(SETTINGS)) {
    settings[name] = entry(name, stored[key] ?? legacy[key], key in stored || key in legacy);
  }
  return { path: file, settings };
}

function unknownSetting(name) {
  return Object.assign(new Error(`Unknown setting: ${name}`), { code: 'UNKNOWN_SETTING' });
}

function isEnabled(name, options = {}) {
  if (VALUES[name] !== TOGGLE) throw unknownSetting(name);
  return readSettings(options).settings[name].enabled;
}

// Returns the configured value of a non-toggle setting, or null when it is not set.
function settingValue(name, options = {}) {
  if (!(name in SETTINGS) || VALUES[name] === TOGGLE) throw unknownSetting(name);
  return readSettings(options).settings[name].value;
}

// `value` is a command word from VALUES, such as `on`, `off` or `ko`.
function writeSetting(name, value, options = {}) {
  if (!(name in SETTINGS)) throw unknownSetting(name);
  if (!Object.hasOwn(VALUES[name], value)) {
    throw Object.assign(new Error(`Expected ${Object.keys(VALUES[name]).join(' or ')}`), { code: 'INVALID_VALUE' });
  }
  const current = readSettings(options);
  const next = { schema_version: SCHEMA_VERSION };
  for (const [settingName, key] of Object.entries(SETTINGS)) {
    const setting = current.settings[settingName];
    if (setting.configured) next[key] = 'enabled' in setting ? setting.enabled : setting.value;
  }
  if (VALUES[name][value] === null) delete next[SETTINGS[name]];
  else next[SETTINGS[name]] = VALUES[name][value];
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

module.exports = { SETTINGS, VALUES, settingsPath, readSettings, isEnabled, settingValue, writeSetting };
