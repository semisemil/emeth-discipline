const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../plugins/emeth-discipline/skills/webagent/scripts/chat-session.mjs');

function fixture() {
  const f = { phase: 'main', draft: '', selected: false, submissions: 0, tabs: 0, complete: true, text: '검토 결과\n두 번째 줄', links: [{ text: 'source', url: 'https://example.org/' }] };
  const main = () => `1 radio button Chat, Value: 1\n2 text entry area (settable) Description: ChatGPT와 채팅, ID: prompt-textarea\n3 pop up button (collapsed) High, ID: menu\n${f.draft}`;
  const tab = {
    goto: async () => {}, url: async () => 'https://chatgpt.com/c/test',
    ax: {
      get: async () => {
        if (f.failRead && f.phase === 'waiting') { f.failRead = false; throw Error('temporary read failure'); }
        if (f.phase === 'levels') return main() + '\n4 (collapsed) Description: 모델 선택, Secondary Actions: Expand';
        if (f.phase === 'models') return main() + `\n5 GPT-5.6 Sol, Value: ${f.selected ? 1 : 0}`;
        if (f.phase === 'waiting') return f.complete ? `${main()}\n6 text ${f.marker}\n7 button 응답 복사` : `${main()}\n8 button Description: 답변 중지`;
        return main();
      },
      click: async id => { if (id === 3) f.phase = 'levels'; if (id === 4) f.phase = 'models'; if (id === 5) { f.selected = true; f.phase = 'levels'; } },
      pressKey: async key => {
        if (key === 'Escape') f.phase = 'main';
        if (key === 'Return') { f.submissions++; f.phase = 'waiting'; f.sent = f.draft; f.draft = ''; if (f.failSubmit) throw Error('submit acknowledgement lost'); }
      },
    },
    playwright: {
      waitForTimeout: ms => new Promise(resolve => setTimeout(resolve, ms)),
      locator: () => ({ innerText: async () => f.draft, fill: async text => { f.draft = text; f.marker = text.match(/WA_\w+_DONE/)[0]; } }),
      getByText: marker => ({ evaluate: async () => { assert.equal(marker, f.marker); return { text: `${f.text}\n${marker}`, links: f.links }; } }),
    },
  };
  f.browser = { tabs: { new: async () => { f.tabs++; return tab; } } };
  return f;
}

test('new session owns model selection, multiline send, wait and exact response extraction', async () => {
  const { ChatSession } = await load(); const f = fixture(); const s = new ChatSession(f.browser);
  const r = await s.run({ id: 'one', prompt: '첫 줄\n두 번째 줄', model: 'GPT-5.6 Sol' });
  assert.equal(r.status, 'completed'); assert.equal(f.tabs, 1); assert.equal(f.selected, true); assert.equal(f.submissions, 1);
  assert.ok(f.sent.includes('첫 줄\n두 번째 줄\n')); assert.ok(f.sent.includes('WA_one_DONE'));
  assert.equal(r.text, f.text); assert.deepEqual(r.links, f.links);
  assert.equal((await s.run({ id: 'two', prompt: '후속', model: 'GPT-5.6 Sol' })).status, 'completed');
  assert.equal(f.tabs, 1); assert.equal(f.submissions, 2);
});
test('pending requests resume without resending and reject a competing request', async () => {
  const { ChatSession } = await load(); const f = fixture(); const s = new ChatSession(f.browser); f.complete = false;
  assert.equal((await s.run({ id: 'one', prompt: '검토', timeoutMs: 5 })).status, 'pending');
  await assert.rejects(s.run({ id: 'two', prompt: '다른 작업' }), /outstanding/);
  f.complete = true; assert.equal((await s.run({ id: 'one', prompt: '검토' })).status, 'completed'); assert.equal(f.submissions, 1);
});
test('uncertain submission never retries Return', async () => {
  const { ChatSession } = await load(); const f = fixture(); f.failSubmit = true; const s = new ChatSession(f.browser);
  for (let i = 0; i < 2; i++) assert.equal((await s.run({ id: 'one', prompt: '검토' })).status, 'submission_uncertain');
  assert.equal(f.submissions, 1);
});
test('observation failure resumes the existing generation', async () => {
  const { ChatSession } = await load(); const f = fixture(); f.failRead = true; const s = new ChatSession(f.browser);
  assert.equal((await s.run({ id: 'one', prompt: '검토' })).status, 'observation_error');
  assert.equal((await s.run({ id: 'one', prompt: '검토' })).status, 'completed'); assert.equal(f.submissions, 1);
});
test('completed results are cached; a larger read recovers truncation without resubmission', async () => {
  const { ChatSession } = await load(); const f = fixture(); const s = new ChatSession(f.browser);
  assert.equal((await s.run({ id: 'one', prompt: '검토', maxChars: 2 })).truncated, true);
  const r = await s.run({ id: 'one', prompt: '검토', maxChars: 100 });
  assert.equal(r.text, f.text); assert.equal(r.cached, true); assert.equal(r.truncated, false); assert.equal(f.submissions, 1);
  await assert.rejects(s.run({ id: 'one', prompt: '수정된 입력' }), /different input/);
});
test('pre-existing drafts are preserved', async () => {
  const { ChatSession } = await load(); const f = fixture(); f.draft = '사용자 초안'; const s = new ChatSession(f.browser);
  const r = await s.run({ id: 'one', prompt: '검토' }); assert.equal(r.status, 'observation_error'); assert.equal(f.submissions, 0); assert.equal(f.draft, '사용자 초안');
});
