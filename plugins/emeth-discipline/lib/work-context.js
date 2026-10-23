'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

class WorkContext {
  constructor(file) {
    this.file = file;
    this.state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { schema_version: 1, progress: {}, reads: {} };
    if (this.state.schema_version !== 1) throw new Error('Unsupported work context');
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const staged = this.file + '.' + randomUUID() + '.tmp';
    fs.writeFileSync(staged, JSON.stringify(this.state));
    try {
      for (let attempt = 0; ; attempt++) {
        try { fs.renameSync(staged, this.file); break; }
        catch (error) {
          if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt === 5) throw error;
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10 * 2 ** attempt);
        }
      }
    } finally { if (fs.existsSync(staged)) fs.unlinkSync(staged); }
  }

  progress(update = {}) {
    const fields = Object.keys(update);
    for (const field of fields) if (!['stage', 'decisions', 'pending', 'artifacts'].includes(field)) throw new Error('Unknown progress field: ' + field);
    if (update.stage !== undefined && typeof update.stage !== 'string') throw new Error('Stage must be text');
    for (const field of ['decisions', 'pending', 'artifacts']) if (update[field] !== undefined && (!Array.isArray(update[field]) || update[field].some(x => typeof x !== 'string'))) throw new Error(field + ' must contain text');
    const changed = fields.some(field => JSON.stringify(this.state.progress[field]) !== JSON.stringify(update[field]));
    Object.assign(this.state.progress, update);
    if (changed) this.save();
    return { ...this.state.progress };
  }

  read(file, { from = 1, to = null, refresh = false } = {}) {
    file = fs.realpathSync(file);
    if (!Number.isInteger(from) || from < 1 || (to !== null && (!Number.isInteger(to) || to < from))) throw new Error('Invalid line range');
    const bytes = fs.readFileSync(file), version = digest(bytes);
    const all = bytes.toString('utf8').replace(/\r\n/g, '\n').split('\n');
    const lines = all.slice(from - 1, to ?? all.length);
    if (lines.join('\n').length > 128000) throw new Error('Select a line range for outputs larger than128000 characters');
    const key = JSON.stringify([file, from, to]);
    const previous = this.state.reads[key];
    const metadata = { path: file, sha256: version, bytes: bytes.length, from, to: Math.min(to ?? all.length, all.length) };
    if (previous?.sha256 !== version) {
      this.state.reads[key] = { ...metadata, lines };
      this.save();
    }
    if (!refresh && previous && JSON.stringify(previous.lines) === JSON.stringify(lines)) return { ...metadata, status: 'unchanged' };
    if (!refresh && previous) {
      let prefix = 0, suffix = 0;
      while (prefix < previous.lines.length && prefix < lines.length && previous.lines[prefix] === lines[prefix]) prefix++;
      while (suffix < previous.lines.length - prefix && suffix < lines.length - prefix && previous.lines.at(-1 - suffix) === lines.at(-1 - suffix)) suffix++;
      return { ...metadata, status: 'changed', previous_sha256: previous.sha256, changes: {
        start: from + prefix, removed: previous.lines.slice(prefix, previous.lines.length - suffix), added: lines.slice(prefix, lines.length - suffix)
      } };
    }
    return { ...metadata, status: 'full', content: lines.join('\n') };
  }

  summary() {
    return { progress: this.progress(), reads: Object.values(this.state.reads).map(({ lines, ...metadata }) => metadata) };
  }
}

if (require.main === module) {
  try {
    const [operation, ...args] = process.argv.slice(2), options = {};
    for (let n = 0; n < args.length; n++) {
      if (args[n] === '--refresh') options.refresh = true;
      else if (['--state', '--path', '--from', '--to', '--stage', '--decision', '--pending'].includes(args[n]) && args[n + 1]) {
        const key = args[n].slice(2), value = args[++n];
        if (['decision', 'pending'].includes(key)) (options[key] ??= []).push(value); else options[key] = value;
      } else throw new Error('Unknown or missing argument: ' + args[n]);
    }
    if (!options.state) throw new Error('--state <temporary-state-file> is required');
    const context = new WorkContext(path.resolve(options.state));
    let result;
    if (operation === 'read') {
      if (!options.path) throw new Error('--path is required');
      result = context.read(options.path, { from: Number(options.from ?? 1), to: options.to ? Number(options.to) : null, refresh: options.refresh });
    } else if (operation === 'checkpoint') result = context.progress({ ...(options.stage ? { stage: options.stage } : {}), ...(options.decision ? { decisions: options.decision } : {}), ...(options.pending ? { pending: options.pending } : {}) });
    else if (operation === 'status') result = context.summary();
    else throw new Error('Use read, checkpoint or status');
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { WorkContext };
