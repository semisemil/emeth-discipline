const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../plugins/emeth-discipline/skills/webagent/scripts/webagent.mjs');

test('compact output preserves the full answer, sources and truncation but omits diagnostics', async () => {
  const { compactResult } = await load();
  const result = { status: 'completed', id: 'a', text: '전체 답변', url: 'https://chatgpt.com/c/a', links: [], truncated: false, fullChars: 5, checks: 4, elapsedMs: 1234, cached: true, model: 'test' };
  assert.deepEqual(compactResult(result), { status: 'completed', id: 'a', text: '전체 답변', url: result.url });
  const shortened = compactResult({ ...result, truncated: true, links: [{ url: 'https://example.org/' }] });
  assert.equal(shortened.fullChars, 5); assert.equal(shortened.truncated, true); assert.equal(shortened.links.length, 1);
  const error = { status: 'submission_uncertain', error: 'lost ack', id: 'a', stage: 'submitting' };
  assert.deepEqual(compactResult(error), error);
});

test('named collaborators are distinct, reused explicitly and retain pending request identity', async () => {
  const { WebAgent } = await load(); const w = new WebAgent({});
  w.create('review', { model: 'GPT-5.6 Sol' }); w.create('second');
  assert.notEqual(w.sessions.get('review').client, w.sessions.get('second').client);
  assert.throws(() => w.create('review'), /already exists/);
  const seen = []; const client = w.sessions.get('review').client;
  client.run = async request => { seen.push(request); client.jobs.set(request.id, { ...request, stage: 'waiting' }); return { status: 'pending', id: request.id }; };
  const first = await w.ask('review', '검토'); await w.resume('review', first.id);
  assert.equal(seen[0].id, seen[1].id); assert.equal(seen[1].prompt, '검토'); assert.equal(seen[1].model, 'GPT-5.6 Sol');
  assert.equal(w.list().length, 2);
});

test('checkpoint restores a waiting job and its conversation without submitting', async () => {
  const { WebAgent } = await load(); const opened = [];
  const browser = { tabs: { new: async () => ({ goto: async url => opened.push(url), url: async () => opened.at(-1) }) } };
  const old = new WebAgent(browser); old.create('review'); const client = old.sessions.get('review').client;
  client.tab = { url: async () => 'https://chatgpt.com/c/abc-def' };
  client.jobs.set('a', { id: 'a', prompt: '검토', marker: 'WA_a_DONE', stage: 'waiting' });
  const saved = await old.checkpoint(); const fresh = new WebAgent(browser); await fresh.restore(saved);
  assert.deepEqual(opened, ['https://chatgpt.com/c/abc-def']); assert.equal(fresh.list()[0].requests[0].stage, 'waiting');
  assert.notEqual(fresh.sessions.get('review').client.jobs.get('a'), client.jobs.get('a'));
  await assert.rejects(new WebAgent(browser).restore({ version: 1, sessions: [{ name: 'x', url: 'https://evil.example/', jobs: [] }] }));
});
