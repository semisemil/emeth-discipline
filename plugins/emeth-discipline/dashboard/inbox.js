'use strict';

const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { readRegistry, getRegistryPath } = require('./registry');
const fs = require('node:fs');

function projectFor(cwd, projects) {
  if (!cwd) return;
  const dir = path.resolve(cwd.replace(/^\\\\\?\\/, ''));
  const direct = projects.find(project => {
    const relative = path.relative(project.root, dir);
    return !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
  });
  if (direct) return direct;
  // Codex worktrees have their own cwd but share the registered repository.
  let root = dir;
  while (root !== path.dirname(root)) {
    const marker = path.join(root, '.git');
    if (fs.existsSync(marker)) {
      if (!fs.statSync(marker).isFile()) return;
      const match = /^gitdir: (.+)$/m.exec(fs.readFileSync(marker, 'utf8').trim());
      if (!match) return;
      const common = path.dirname(path.resolve(root, match[1]));
      return projects.find(project => !path.relative(path.join(project.root, '.git', 'worktrees'), common));
    }
    root = path.dirname(root);
  }
}

function withStore(options, writable, action) {
  const registry = options?.registryPath || getRegistryPath(options);
  const file = path.join(path.dirname(registry), 'work-items.sqlite');
  if (!writable && !fs.existsSync(file)) return [];
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(file, { readOnly: !writable });
  try {
    db.exec('PRAGMA busy_timeout=4000');
    if (writable) db.exec(`CREATE TABLE IF NOT EXISTS items (
      key TEXT PRIMARY KEY, project TEXT NOT NULL, thread TEXT NOT NULL, kind TEXT NOT NULL,
      title TEXT NOT NULL, text TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'open', updated INTEGER NOT NULL)`);
    return action(db);
  } finally { db.close(); }
}

function registeredProject(cwd, options) {
  return projectFor(cwd, readRegistry(options).registry.projects.sort((a,b) => b.root.length - a.root.length));
}

function record(project, thread, task, kind, title, text, options) {
  if (!/^(?:(?:claude|mixdog):)?[\w-]{1,128}$/.test(thread || '') || !/^[\w-]{1,128}$/.test(task || '') ||
      !['active','question','result'].includes(kind) || !title?.trim() || title.length > 240 ||
      typeof text !== 'string' || text.length > 16000) throw Error('Invalid dashboard work item');
  const key = createHash('sha256').update(JSON.stringify([project.id,thread,task])).digest('hex');
  withStore(options, true, db => db.prepare(`INSERT INTO items(key,project,thread,kind,title,text,updated)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET kind=excluded.kind,title=excluded.title,
    text=excluded.text,updated=excluded.updated
    WHERE items.kind<>excluded.kind OR items.title<>excluded.title OR items.text<>excluded.text`)
    .run(key,project.id,thread,kind,title.trim(),text.trim(),Date.now()));
  return key;
}

function readInbox(projects, options) {
  const names = new Map(projects.map(p => [p.id, path.basename(p.root)]));
  const items = withStore(options,false,db => db.prepare('SELECT key,project,thread AS id,kind,title,text,state,updated FROM items ORDER BY updated DESC').all());
  return { items: items.filter(item => names.has(item.project)).map(item => ({ ...item, projectName: names.get(item.project) })) };
}

function setDisposition(projects, key, state, options) {
  if (!['open','later','done'].includes(state)) return false;
  return withStore(options,true,db => {
    const row = db.prepare('SELECT project FROM items WHERE key=?').get(key);
    if (!row || !projects.some(p => p.id === row.project)) return false;
    db.prepare('UPDATE items SET state=? WHERE key=?').run(state,key);
    return true;
  });
}

function recordingFlag() {
  return path.join(path.dirname(getRegistryPath()), 'inbox.enabled');
}

function notice(input) {
  if (!input.cwd || !fs.existsSync(recordingFlag())) return '';
  const project = registeredProject(input.cwd);
  if (!project) return '';
  const host = require('../lib/host').name();
  if (host === 'codex' && (!input.session_id || !input.turn_id)) return '';
  const session = input.session_id || randomUUID();
  const task = input.turn_id || randomUUID();
  if (![session, task].every(id => /^[\w-]{1,128}$/.test(id))) return '';
  const thread = host === 'codex' ? session : host + ':' + session;
  const command = 'node "' + __filename + '" ' + JSON.stringify(thread) + ' ' + JSON.stringify(task);
  return `This project has a shared dashboard. Record the current task at the start and update its record when a user decision or reviewable result is ready. Run from the project: ${command} <active|question|result> "<short task title>" "<what the user needs to decide or verify, with evidence if relevant>". Use the same task ID for updates; append a short suffix for independently actionable items. Write in the user's language. The dashboard retains these records after the chat is read.`;
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && ['on', 'off'].includes(args[0])) {
      const enabled = args[0] === 'on';
      const flag = recordingFlag();
      if (enabled) {
        fs.mkdirSync(path.dirname(flag), { recursive: true });
        fs.closeSync(fs.openSync(flag, 'a'));
      } else {
        fs.rmSync(flag, { force: true });
      }
      console.log(JSON.stringify({ enabled }));
      return;
    }
    if (args.length !== 5) throw Error('Expected thread, task, kind, title and text. Pass - for text to read it from stdin.');
    if (!fs.existsSync(recordingFlag())) {
      console.log(JSON.stringify({ recorded: false, reason: 'recording-disabled' }));
      return;
    }
    const [thread,task,kind,title,body] = args;
    const text = body === '-' ? fs.readFileSync(0,'utf8').trim() : body;
    const project = registeredProject(process.cwd());
    if (!project) throw Error('Current project is not registered');
    console.log(JSON.stringify({ key: record(project,thread,task,kind,title,text) }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { notice, readInbox, setDisposition, record };
