'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { dataDir } = require('../lib/host');

const sessionKey = /^[a-zA-Z0-9_-]{1,128}$/;
const liteInvocation = '/emeth-discipline:figure-it-out-lite';
const testAuthorPath = '/root/lite_test_author';

function sessionTranscript(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) return;
  const sessions = fs.realpathSync(path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'sessions'));
  const transcript = fs.realpathSync(file);
  const relative = path.relative(sessions, transcript);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return;
  return transcript;
}

function testAuthorIdentity(file, sessionId) {
  const header = Buffer.alloc(64 * 1024);
  const count = fs.readSync(file, header, 0, header.length, 0);
  const end = header.indexOf(10);
  if (end < 0 || end >= count) return;
  const first = JSON.parse(header.toString('utf8', 0, end));
  const { id, parent_thread_id: parent, agent_path: agentPath } = first.payload || {};
  if (first.type !== 'session_meta' || agentPath !== testAuthorPath || !sessionKey.test(id || '') || !sessionKey.test(parent || '')) return;
  if (id !== sessionId && parent !== sessionId) return;
  return { id, parent };
}

function currentUsage(file, threadId, turnId) {
  const size = fs.fstatSync(file).size;
  const capacity = Math.min(size, 1024 * 1024);
  const buffer = Buffer.alloc(capacity);
  const start = size - capacity;
  const read = fs.readSync(file, buffer, 0, capacity, start);
  const lines = buffer.toString('utf8', 0, read).split('\n');
  if (start) lines.shift();
  lines.pop();
  for (const line of lines.reverse()) {
    if (!line.includes('"type":"token_usage_record"')) continue;
    const entry = JSON.parse(line);
    const usage = entry.payload;
    if (entry.type === 'token_usage_record' && usage.thread_id === threadId && usage.turn_id === turnId) return usage;
  }
}

function liteSource(source) {
  if (!fs.existsSync(path.join(source, 'input.md'))) return false;
  const prompt = fs.readFileSync(path.join(source, 'input.md'), 'utf8');
  return prompt.trimStart().split(/\s/, 1)[0].replace(/^\$/, '/') === liteInvocation;
}

function noticeFor(source, filename, output, limit, notice) {
  if (!Number.isSafeInteger(output) || output < limit) return;
  fs.writeFileSync(path.join(source, filename), JSON.stringify({ output_tokens: output }), { flag: 'wx' });
  return {
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: notice },
  };
}

function testAuthorNotice(file, transcript, sources, sessionId, turnId) {
  const role = testAuthorIdentity(file, sessionId);
  if (!role || !path.basename(transcript).endsWith('-' + role.id + '.jsonl')) return;
  const usage = currentUsage(file, role.id, turnId);
  if (usage?.session_id !== role.parent || !sessionKey.test(usage?.root_turn_id || '')) return;
  const source = path.join(sources, role.parent, usage.root_turn_id);
  const marker = 'lite-test-author-budget-' + role.id + '.json';
  if (fs.existsSync(path.join(source, marker)) || !liteSource(source)) return;
  const output = usage.thread_token_usage?.output_tokens ?? usage.turn_token_usage?.output_tokens;
  return noticeFor(source, marker, output, 1_000,
    `This Lite test assignment has generated ${output} tokens. Finish the executable test and hand off its path, run command and result or prerequisite. Add a case only for a required independent observation the current test and existing checks do not cover.`);
}

function budgetNotice(input) {
  const { session_id: sessionId, turn_id: turnId, transcript_path: transcriptPath } = input;
  if (input.hook_event_name !== 'PostToolUse' || !sessionKey.test(sessionId || '') || !sessionKey.test(turnId || '')) return;
  const data = dataDir();
  if (!data) return;
  const sources = path.join(data, 'request-sources');
  const source = path.join(sources, sessionId, turnId);
  const isCoordinator = liteSource(source);
  if (isCoordinator && fs.existsSync(path.join(source, 'lite-budget-notice.json'))) return;
  const transcript = sessionTranscript(transcriptPath);
  if (!transcript) return;
  const file = fs.openSync(transcript, 'r');
  try {
    if (!isCoordinator) return testAuthorNotice(file, transcript, sources, sessionId, turnId);
    if (!path.basename(transcript).endsWith('-' + sessionId + '.jsonl')) return;
    const usage = currentUsage(file, sessionId, turnId);
    const output = usage?.turn_token_usage?.output_tokens;
    return noticeFor(source, 'lite-budget-notice.json', output, 3_000,
      `This Lite coordinator turn has generated ${output} tokens. Reuse completed work and evidence. Group the remaining changes and checks needed for the requested deliverable and its verification.`);
  } finally {
    fs.closeSync(file);
  }
}

try {
  const result = budgetNotice(JSON.parse(fs.readFileSync(0, 'utf8')));
  if (result) process.stdout.write(JSON.stringify(result));
} catch {
  // A missing or unavailable usage record leaves workflow execution unaffected.
}
