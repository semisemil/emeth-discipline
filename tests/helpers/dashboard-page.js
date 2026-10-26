'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');

const assets = path.resolve(__dirname, '../../plugins/emeth-discipline/dashboard/assets');
const turn = () => new Promise(resolve => setImmediate(resolve));

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function openPage(t, { page = 'dashboard', query = '', routes = {}, storage = {}, width = 1024, setup } = {}) {
  const calls = [], errors = [], intervals = [];
  class Assets extends ResourceLoader {
    fetch(url) {
      const name = new URL(url).pathname.slice(1);
      return Promise.resolve(fs.readFileSync(path.join(assets, name)));
    }
  }
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(fs.readFileSync(path.join(assets, page === 'intro' ? 'index.html' : `${page}.html`), 'utf8'), {
    url: `http://127.0.0.1/${page === 'intro' ? '' : page}${query}`,
    runScripts: 'dangerously', resources: new Assets(), virtualConsole, pretendToBeVisual: true,
    beforeParse(window) {
      window.innerWidth = width;
      window.matchMedia = media => ({ matches: media.includes('prefers-reduced-motion') ||
        /max-width: (\d+)px/.test(media) && window.innerWidth <= Number(media.match(/max-width: (\d+)px/)[1]) });
      window.setInterval = (callback, delay) => { intervals.push({ callback, delay }); return intervals.length; };
      window.requestAnimationFrame = callback => { callback(); return 0; };
      // jsdom does not lay out elements. This supplies visibility at the browser boundary for focus trapping.
      window.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [{}]; };
      // Font loading and canvas measurement are browser boundaries absent in jsdom.
      window.document.fonts = { ready: Promise.resolve(), load: async () => [] };
      window.HTMLCanvasElement.prototype.getContext = () => null;
      window.fetch = async (url, options = {}) => {
        calls.push({ url, method: options.method || 'GET' });
        const route = routes[url];
        if (route === undefined) errors.push(new Error(`Unexpected request: ${url}`));
        assert.notEqual(route, undefined, `Unexpected request: ${url}`);
        const data = await (typeof route === 'function' ? route(options) : route);
        return { ok: !data?.error, status: data?.error ? 409 : 200, json: async () => JSON.parse(JSON.stringify(data)) };
      };
      for (const [key, value] of Object.entries(storage)) window.localStorage.setItem(key, value);
      setup?.(window);
    },
  });
  t.after(() => dom.window.close());
  await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
  const { window } = dom;
  const document = window.document;
  const result = {
    window, document, calls, routes, intervals,
    get: selector => document.querySelector(selector),
    click(selector) { const node = document.querySelector(selector); assert.ok(node, selector); node.click(); },
    change(selector, value, type = 'change') {
      const node = document.querySelector(selector); assert.ok(node, selector);
      node.value = value; node.dispatchEvent(new window.Event(type, { bubbles: true }));
    },
    key(node, key, extra = {}) { node.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })); },
    async settle() { for (let i = 0; i < 4; i++) await turn(); assert.deepEqual(errors, []); },
    resize(next) { window.innerWidth = next; window.dispatchEvent(new window.Event('resize')); },
  };
  await result.settle();
  return result;
}

const project = (id, name = id) => ({ id, name, root: `C:/work/${id}`, availability: 'available', counts: { active: 1, blocked: 0 } });
function index(project, title = project.name) {
  return { project, read_at: title, issues: [{ id: 'PL-0001', title, type: 'task', status: 'doing', risk: 'low',
    current_summary: title, next_action: 'Continue', flow_signal_ids: [] }], plans: [], specs: [], designs: [], flow_signals: [], diagnostics: [] };
}
async function dashboard(t, options = {}) {
  const projects = options.projects || [project('alpha'), project('beta')];
  const routes = { '/api/v1/health': { version: '0.22.2' }, '/api/v1/projects': { projects },
    ...Object.fromEntries(projects.map(p => [`/api/v1/projects/${p.id}/index`, index(p)])), ...options.routes };
  return openPage(t, { ...options, routes });
}

module.exports = { openPage, dashboard, project, index, deferred };
