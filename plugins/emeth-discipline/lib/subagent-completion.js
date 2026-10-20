#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');

class CompletionNotifications {
  constructor({ directory, request }) { this.directory = directory; this.request = request; }

  async perform(operation, { parent, task, message }) {
    if (!['notify', 'ack'].includes(operation)) throw new Error('Expected notify or ack');
    if (typeof parent !== 'string' || !parent.trim() || typeof task !== 'string' || !task.trim()) throw new Error('Parent session and assignment ID are required');
    if (operation === 'notify' && (typeof message !== 'string' || !message.trim())) throw new Error('Completion report is required');
    const key = createHash('sha256').update(JSON.stringify([parent, task])).digest('hex');
    const file = path.join(this.directory, key + '.json'), lock = file + '.lock';
    fs.mkdirSync(this.directory, { recursive: true });
    const deadline = Date.now() + 10000;
    let handle;
    while (!handle) {
      try { handle = fs.openSync(lock, 'wx'); }
      catch (error) {
        if (error.code !== 'EEXIST' || Date.now() >= deadline) throw error;
        await delay(20);
      }
    }
    try {
      const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { parent, task, clientId: key, acknowledged: false };
      const save = () => {
        const staged = file + '.' + randomUUID() + '.tmp';
        fs.writeFileSync(staged, JSON.stringify(state));
        try { fs.renameSync(staged, file); } finally { if (fs.existsSync(staged)) fs.unlinkSync(staged); }
      };
      if (operation === 'notify' && state.acknowledged) return { status: 'acknowledged', task };
      if (operation === 'notify') {
        const { thread } = await this.request('thread/read', { threadId: parent, includeTurns: false });
        if (thread.canAcceptDirectInput === false) {
          const target = thread.source?.subAgent?.thread_spawn?.agent_path;
          if (typeof target !== 'string' || !target.startsWith('/')) throw new Error('Subagent parent has no canonical agent path');
          return { status: 'native-followup-required', task, target, message: `[Emeth completion: ${task}]\n${message}` };
        }
      }
      const queued = [];
      let cursor;
      do {
        const page = await this.request('thread/queue/list', { threadId: parent, ...(cursor ? { cursor } : {}) });
        queued.push(...page.data.filter(item => item.clientUserMessageId === state.clientId));
        cursor = page.nextCursor;
      } while (cursor);
      if (operation === 'ack') {
        let deleted = 0;
        for (const item of queued) {
          const result = await this.request('thread/queue/delete', { threadId: parent, queuedSubmissionId: item.id });
          if (result.deleted) deleted++;
        }
        state.acknowledged = true; save();
        return { status: 'acknowledged', task, deleted };
      }
      if (!state.queuedId) {
        const item = queued[0] ?? (await this.request('thread/queue/add', {
          threadId: parent, clientUserMessageId: state.clientId,
          input: [{ type: 'text', text: `[Emeth completion: ${task}]\n${message}`, textElements: [] }],
        })).queuedSubmission;
        state.queuedId = item.id; save();
      }
      return { status: 'registered', task, queuedSubmissionId: state.queuedId };
    } finally { fs.closeSync(handle); fs.unlinkSync(lock); }
  }
}

async function main() {
  const [operation, ...args] = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i++) {
    if (!['--parent', '--task', '--message', '--state-dir', '--codex'].includes(args[i]) || !args[i + 1]) throw new Error('Unknown or missing argument: ' + args[i]);
    options[args[i].slice(2)] = args[++i];
  }
  if (operation === 'allocate') {
    if (!options.parent?.trim() || !options.task?.trim()) throw new Error('Parent session and assignment label are required');
    process.stdout.write(JSON.stringify({ status: 'allocated', parent: options.parent, task: options.task + '-' + randomUUID() }) + '\n');
    return;
  }
  let rpc;
  try {
    rpc = await require('./codex-rpc').connect({ binary: options.codex || 'codex' });
    const notifications = new CompletionNotifications({
      directory: options['state-dir'] || path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'emeth', 'completions'),
      request: rpc.request,
    });
    const result = await notifications.perform(operation, options);
    process.stdout.write(JSON.stringify(result) + '\n');
  } finally { rpc?.close(); }
}

if (require.main === module) main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
module.exports = { CompletionNotifications };
