const fs = require('node:fs');
const path = require('node:path');
const host = require('./host');

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

module.exports = {
  logDiagnostic,
};
