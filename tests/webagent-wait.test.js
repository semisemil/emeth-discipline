const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../plugins/emeth-discipline/skills/webagent/scripts/wait-for-reply.mjs');
const done = '1 text WA_DONE\n2 button 응답 복사';
const tabFor = states => ({
  ax: { get: async () => { const s = states.length > 1 ? states.shift() : states[0]; if (s instanceof Error) throw s; return s; } },
  playwright: { waitForTimeout: ms => new Promise(resolve => setTimeout(resolve, ms)) },
});
test('waits through generation and ignores a marker quoted in the request', async () => {
  const { waitForReply } = await load();
  const tab = tabFor(['1 text 마지막 줄에 WA_DONE\n2 button Description: 답변 중지, ID: send', done + '\n3 button 답변 중지', done]);
  const r = await waitForReply(tab, { marker: 'WA_DONE', pollMs: 0 });
  assert.equal(r.status, 'completed'); assert.equal(r.checks, 3); assert.equal(r.sawRunning, true);
});
test('old response with another marker, missing marker, and user marker remain pending', async () => {
  const { waitForReply } = await load();
  for (const [state] of [[done.replace('WA_DONE', 'OLD_DONE'), 1], ['1 button 응답 복사', 0], ['1 text WA_DONE', 0], ['1 text WA_DONE\n2 container 내 메시지 작업\n3 button 응답 복사', 0]]) {
    const r = await waitForReply(tabFor([state]), { marker: 'WA_DONE', timeoutMs: 10, pollMs: 1 });
    assert.equal(r.status, 'pending');
  }
});
test('observation error is distinct from completion and next slice resumes', async () => {
  const { waitForReply } = await load();
  const tab = tabFor([new Error('connection lost'), done]);
  assert.equal((await waitForReply(tab, { marker: 'WA_DONE' })).status, 'observation_error');
  assert.equal((await waitForReply(tab, { marker: 'WA_DONE' })).status, 'completed');
});
test('supports observed English UI and rejects invalid bounds', async () => {
  const { waitForReply, inspectReplyState } = await load();
  assert.deepEqual(inspectReplyState('1 text WA_DONE\n2 button Copy response\n3 button Stop generating', 'WA_DONE'), { copies: 1, running: true, markerFound: true, responseActions: true });
  await assert.rejects(waitForReply(tabFor([done]), { marker: 'WA_DONE', timeoutMs: 60000 }));
});

