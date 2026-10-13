import { inspectReplyState } from './wait-for-reply.mjs';

const idFor = (state, predicate) => {
  const matches = state.split('\n').filter(predicate).map(line => Number(line.match(/^\s*(\d+) /)?.[1])).filter(Number.isInteger);
  if (matches.length !== 1) throw new Error(`Expected one visible control, found ${matches.length}`);
  return matches[0];
};

// Browser runtime owns all I/O. No connector cache, private endpoint or second browser.
export class ChatSession {
  constructor(browser) {
    this.browser = browser;
    this.tab = null;
    this.jobs = new Map();
    this.busy = false;
  }

  async state() { return this.tab.ax.get('state', { disableDiffing: true }); }

  async prepare(model, deadline) {
    if (!this.tab) {
      this.tab = await this.browser.tabs.new();
      await this.tab.goto('https://chatgpt.com/');
    }
    let state;
    do {
      state = await this.state();
      if (/radio button Chat, Value: 1/.test(state) && /text entry area/.test(state)) break;
      if (/radio button Work, Value: 1/.test(state)) throw new Error('Chat is not selected');
      if (Date.now() >= deadline) return false;
      await this.tab.playwright.waitForTimeout(500);
    } while (true);
    if (model) {
      const lines = state.split('\n');
      const input = lines.findIndex(line => /text entry area/.test(line));
      const menuLine = lines.slice(input + 1).find(line => /pop up button \(collapsed\)/.test(line));
      if (!menuLine) throw new Error('Model menu unavailable');
      await this.tab.ax.click(Number(menuLine.trim().match(/^\d+/)[0]));
      state = await this.state();
      await this.tab.ax.click(idFor(state, line => /Description: (모델 선택|Select model),/.test(line)));
      state = await this.state();
      const choice = idFor(state, line => line.trim().replace(/^\d+ /, '').startsWith(`${model}, Value:`));
      if (!state.split('\n').some(line => line.trim() === `${choice} ${model}, Value: 1`)) {
        await this.tab.ax.click(choice);
        state = await this.state();
        await this.tab.ax.click(idFor(state, line => /Description: (모델 선택|Select model),/.test(line)));
        state = await this.state();
        if (!state.split('\n').some(line => line.trim().replace(/^\d+ /, '') === `${model}, Value: 1`)) throw new Error('Model selection unverified');
      }
      await this.tab.ax.pressKey('Escape');
      await this.state();
      await this.tab.ax.pressKey('Escape');
      await this.state();
    }
    this.model = model || 'current UI setting';
    return true;
  }

  async extract(marker, maxChars) {
    const result = await this.tab.playwright.getByText(marker, { exact: true }).evaluate(el => {
      const response = el.closest('[data-message-author-role="assistant"]');
      if (!response) return null;
      return { text: response.innerText, links: [...response.querySelectorAll('a[href]')].map(a => ({ text: a.innerText, url: a.href })) };
    });
    if (!result || !result.text.trimEnd().endsWith(marker)) throw new Error('Assistant response boundary unverified');
    const text = result.text.trimEnd().slice(0, -marker.length).trimEnd();
    return { text: text.slice(0, maxChars), links: result.links, truncated: text.length > maxChars, fullChars: text.length };
  }

  async run({ id, prompt, model, timeoutMs = 45000, maxChars = 6000 }) {
    if (!/^[A-Za-z0-9_-]+$/.test(id) || typeof prompt !== 'string' || !prompt.trim()) throw new Error('Invalid request');
    if (!(timeoutMs > 0 && timeoutMs <= 50000) || !Number.isInteger(maxChars) || maxChars <= 0) throw new Error('Invalid limits');
    if (this.busy) throw new Error('One request at a time per conversation');
    let job = this.jobs.get(id);
    if (job && (job.prompt !== prompt || job.model !== model)) throw new Error('Request ID reused with different input');
    if ([...this.jobs.values()].some(j => j.id !== id && j.stage !== 'completed')) throw new Error('Resume the outstanding request first');
    if (!job) {
      job = { id, prompt, model, marker: `WA_${id}_DONE`, stage: this.tab ? 'ready' : 'preparing' };
      if (this.tab && model && model !== this.model) throw new Error('Use a new session for a different model');
      this.jobs.set(id, job);
    }
    if (job.stage === 'completed') {
      if (job.result.truncated && maxChars > job.result.text.length) {
        job.result = { ...job.result, ...await this.extract(job.marker, maxChars) };
      }
      return { ...job.result, cached: true };
    }
    this.busy = true;
    const started = Date.now(), deadline = started + timeoutMs;
    let checks = 0;
    try {
      if (job.stage === 'preparing') {
        if (!await this.prepare(model, deadline)) return { status: 'pending', id, stage: job.stage };
        job.stage = 'ready';
      }
      if (job.stage === 'ready') {
        const state = await this.state();
        if (inspectReplyState(state, job.marker).running || state.includes(job.marker)) throw new Error('Existing generation or reused marker');
        const input = idFor(state, line => !line.startsWith('The focused') && /text entry area/.test(line));
        if (!state.includes('ID: prompt-textarea')) throw new Error('Composer ID unverified');
        if ((await this.tab.playwright.locator('[id="prompt-textarea"]').innerText()).trim()) throw new Error('Composer has an existing draft');
        await this.tab.ax.click(input);
        job.stage = 'draft';
        // AX typeText can treat a newline as Enter and submit a partial prompt.
        // The composer ID is discovered in the current accessibility state.
        await this.tab.playwright.locator('[id="prompt-textarea"]').fill(`${prompt}\n마지막 별도 문단에는 ${job.marker}만 써줘.`);
        if (!(await this.state()).includes(job.marker)) throw new Error('Draft marker missing; not submitted');
        job.stage = 'submitting';
        await this.tab.ax.pressKey('Return');
        job.stage = 'waiting';
      }
      if (job.stage === 'draft' || job.stage === 'submitting') return { status: 'submission_uncertain', id, stage: job.stage };
      do {
        const state = await this.state();
        checks++;
        const observed = inspectReplyState(state, job.marker);
        if (observed.markerFound && observed.responseActions && !observed.running) {
          const result = await this.extract(job.marker, maxChars);
          const url = await this.tab.url();
          if (!url || url.includes('/c/WEB:') || !url.includes('/c/')) throw new Error('Permanent conversation URL not ready');
          job.stage = 'completed';
          job.result = { status: 'completed', id, url, model: this.model, ...result, checks, elapsedMs: Date.now() - started };
          return job.result;
        }
        if (Date.now() >= deadline) break;
        await this.tab.playwright.waitForTimeout(Math.max(0, Math.min(2000, deadline - Date.now())));
      } while (Date.now() < deadline);
      return { status: 'pending', id, stage: job.stage, checks, elapsedMs: Date.now() - started };
    } catch (error) {
      return { status: ['draft', 'submitting'].includes(job.stage) ? 'submission_uncertain' : 'observation_error', id, stage: job.stage, error: String(error) };
    } finally {
      this.busy = false;
    }
  }
}
