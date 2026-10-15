'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const sleepState = new Int32Array(new SharedArrayBuffer(4));
const OWNER = 'owner.json';

function sleep(milliseconds) {
  Atomics.wait(sleepState, 0, 0, milliseconds);
}
// Renaming onto an existing lock fails with one of these; Windows also reports pending deletions and open handles this way.
function contended(error) {
  return ['EEXIST', 'ENOTEMPTY', 'ENOTDIR'].includes(error.code)
    || (process.platform === 'win32' && ['EPERM', 'EACCES', 'EBUSY'].includes(error.code));
}
function stat(file) {
  try { return fs.lstatSync(file, { bigint: true }); }
  catch (error) { if (error.code === 'ENOENT' || contended(error)) return null; throw error; }
}
// A lock is a directory holding its owner's PID; earlier versions used a file holding the same JSON.
function owner(file, status) {
  try {
    const { pid } = JSON.parse(fs.readFileSync(status.isDirectory() ? path.join(file, OWNER) : file, 'utf8'));
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch { return null; }
}
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}
// Takes the lock off its name in one step, then deletes it.
function discard(file) {
  const removed = `${file}.${crypto.randomUUID()}.removed`;
  fs.renameSync(file, removed);
  fs.rmSync(removed, { recursive: true, force: true });
}
// Removes a lock whose owner process has exited. Only the holder of the recovery claim removes a lock it does not own,
// and an exited owner cannot release its lock, so the lock checked here is the one removed.
// A claim left by a crash during recovery is not removed automatically, because no removal of it can rule out a live claim.
function recover(file) {
  const claim = `${file}.recovery`;
  try { fs.closeSync(fs.openSync(claim, 'wx')); }
  catch (error) { if (contended(error)) return false; throw error; }
  try {
    const before = stat(file);
    if (!before || before.isSymbolicLink()) return false;
    const pid = owner(file, before);
    if (!pid || alive(pid)) return false;
    const now = stat(file);
    if (!now || now.ino !== before.ino || now.dev !== before.dev) return false;
    discard(file);
    return true;
  } catch (error) {
    if (contended(error)) return false;
    throw error;
  } finally {
    fs.rmSync(claim, { force: true });
  }
}
// Windows can refuse the rename while a waiter reads the owner file. A lock left here is recovered after this process exits.
function release(file) {
  const deadline = Date.now() + 1000;
  while (true) {
    const status = stat(file);
    if (!status || status.isSymbolicLink() || owner(file, status) !== process.pid) return;
    try { discard(file); return; }
    catch (error) {
      if (!contended(error) || Date.now() >= deadline) return;
      sleep(10);
    }
  }
}
// Runs action while this process holds the lock. The lock appears under its name with the owner already recorded.
function withFileLock(file, action, busy) {
  const deadline = Date.now() + 5000;
  const unavailable = (message) => Object.assign(new Error(message), { code: busy.code });
  const staged = `${file}.${crypto.randomUUID()}.tmp`;
  fs.mkdirSync(staged);
  try {
    fs.writeFileSync(path.join(staged, OWNER), JSON.stringify({ pid: process.pid }));
    let failure;
    while (true) {
      // Windows lets a directory rename replace a file, so the rename is tried only while the name is free.
      let current = stat(file);
      if (!current) {
        try { fs.renameSync(staged, file); break; }
        catch (error) {
          if (!contended(error)) throw error;
          failure = error;
          current = stat(file);
        }
      }
      if (current?.isSymbolicLink()) throw unavailable(`Lock file is a symbolic link: ${file}`);
      if (current && recover(file)) continue;
      if (Date.now() >= deadline) throw current || !failure ? unavailable(busy.message) : failure;
      sleep(20);
    }
  } finally {
    fs.rmSync(staged, { recursive: true, force: true });
  }
  try { return action(); }
  finally { release(file); }
}

module.exports = { withFileLock };
