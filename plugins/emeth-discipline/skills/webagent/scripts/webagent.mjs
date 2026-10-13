import { randomUUID } from 'node:crypto';
import { ChatSession } from './chat-session.mjs';

// Keeps diagnostic data available without making it the default model input.
export function compactResult(result) {
  if (result.status !== 'completed') return result;
  const out = { status: result.status, id: result.id, text: result.text };
  if (result.url) out.url = result.url;
  if (result.links?.length) out.links = result.links;
  if (result.truncated) { out.truncated = true; out.fullChars = result.fullChars; }
  return out;
}

export class WebAgent {
  constructor(browser) { this.browser = browser; this.sessions = new Map(); }

  create(name, { model } = {}) {
    if (typeof name !== 'string' || !name.trim()) throw new Error('A session name is required');
    if (this.sessions.has(name)) throw new Error('Session already exists; reuse it or choose a new name');
    this.sessions.set(name, { client: new ChatSession(this.browser), model });
    return name;
  }

  async ask(name, prompt, { id = randomUUID(), verbose = false, ...options } = {}) {
    const session = this.sessions.get(name);
    if (!session) throw new Error('Create or restore the named session first');
    const result = await session.client.run({ ...options, id, prompt, model: session.model });
    return verbose ? result : compactResult(result);
  }

  async resume(name, id, options = {}) {
    const session = this.sessions.get(name);
    const job = session?.client.jobs.get(id);
    if (!job) throw new Error('Unknown request; do not resubmit without checking the original conversation');
    return this.ask(name, job.prompt, { ...options, id });
  }

  list() {
    return [...this.sessions].map(([name, { client, model }]) => ({
      name, model, requests: [...client.jobs.values()].map(j => ({ id: j.id, stage: j.stage })),
    }));
  }

  async checkpoint() {
    const sessions = [];
    for (const [name, { client, model }] of this.sessions) {
      if (client.busy) throw new Error('Wait for the active tool call before checkpointing');
      const url = client.tab ? await client.tab.url() : null;
      if (url && !/^https:\/\/chatgpt\.com\/c\/(?!WEB:)[A-Za-z0-9-]+$/.test(url)) throw new Error('Wait for a permanent conversation URL');
      // Only jobs that already have a permanent conversation can be restored.
      if (!url && client.jobs.size) throw new Error('Unsubmitted preparation must remain in the current runtime');
      sessions.push({ name, model, url, jobs: structuredClone([...client.jobs.values()]) });
    }
    return { version: 1, sessions };
  }

  async restore(saved) {
    if (saved?.version !== 1 || !Array.isArray(saved.sessions)) throw new Error('Invalid checkpoint');
    const names = new Set(this.sessions.keys());
    for (const row of saved.sessions) {
      if (typeof row.name !== 'string' || !row.name.trim() || names.has(row.name)) throw new Error('Duplicate or invalid session name');
      names.add(row.name);
      if (row.url && !/^https:\/\/chatgpt\.com\/c\/(?!WEB:)[A-Za-z0-9-]+$/.test(row.url)) throw new Error('Invalid conversation URL');
      if (!Array.isArray(row.jobs) || row.jobs.some(j => !['waiting', 'completed', 'draft', 'submitting'].includes(j.stage)) || (!row.url && row.jobs.length)) throw new Error('Invalid job checkpoint');
    }
    for (const row of saved.sessions) {
      this.create(row.name, { model: row.model });
      const { client } = this.sessions.get(row.name);
      client.model = row.model || 'current UI setting';
      client.jobs = new Map(row.jobs.map(j => [j.id, structuredClone(j)]));
      if (row.url) { client.tab = await this.browser.tabs.new(); await client.tab.goto(row.url); }
    }
  }
}
