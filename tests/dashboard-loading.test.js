'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { dashboard, index, project, deferred } = require('./helpers/dashboard-page');

test('pending project switches preserve the current body without a loading banner', async t => {
  const page = await dashboard(t);
  const pending = deferred();
  page.routes['/api/v1/projects/beta/index'] = pending.promise;
  const body = page.get('#view-panel');
  const original = body.innerHTML;
  page.click('[data-project-id="beta"]');
  page.change('#global-search', 'still pending', 'input');
  assert.equal(body.innerHTML, original);
  assert.equal(body.getAttribute('aria-busy'), 'true');
  assert.equal(page.get('#status-stack').textContent, '');
  page.change('#global-search', '', 'input');
  pending.resolve(index(project('beta'), 'Loaded beta'));
  await page.settle();
  assert.match(body.textContent, /Loaded beta/);
  assert.doesNotMatch(body.textContent, /alpha/);
  assert.equal(body.hasAttribute('aria-busy'), false);
});

test('background refresh cannot supersede a pending project switch and a failed switch settles', async t => {
  const page = await dashboard(t);
  const pending = deferred();
  page.routes['/api/v1/projects/beta/index'] = pending.promise;
  page.click('[data-project-id="beta"]');
  page.document.dispatchEvent(new page.window.Event('visibilitychange'));
  page.intervals[0].callback();
  assert.equal(page.calls.filter(call => call.url === '/api/v1/projects/beta/index').length, 1);
  pending.resolve({ error: { code: 'project-unavailable', message: 'Offline' } });
  await page.settle();
  assert.equal(page.get('#view-panel').hasAttribute('aria-busy'), false);
  assert.equal(page.get('#refresh-button').disabled, false);
  assert.ok(page.get('#status-stack [role="alert"]').textContent.trim());
  assert.ok(page.get('#view-panel .empty-state'));
  assert.equal(page.get('#view-panel .issue-table'), null);
});

test('failed preference writes preserve saved controls and allow loading and project selection', async t => {
  const page = await dashboard(t, {
    storage: { 'emeth.dashboard.project': 'beta', 'emeth.dashboard.theme': 'dark', 'emeth.dashboard.accent': '#123456' },
    setup(window) {
      window.Storage.prototype.setItem = () => { throw new window.DOMException('Storage quota exceeded', 'QuotaExceededError'); };
    },
  });
  assert.match(page.get('#view-panel').textContent, /beta/);
  assert.equal(page.document.documentElement.dataset.theme, 'dark');
  assert.equal(page.get('#accent-color').value, '#123456');
  assert.equal(page.get('#background-mode').value, 'color');
  page.click('#theme-button');
  page.change('#accent-color', '#654321', 'input');
  page.click('[data-project-id="alpha"]'); await page.settle();
  assert.equal(page.document.documentElement.dataset.theme, 'light');
  assert.equal(page.get('#accent-color').value, '#654321');
  assert.match(page.get('#view-panel').textContent, /alpha/);
  assert.equal(new URL(page.window.location.href).searchParams.get('project'), 'alpha');
});

test('unavailable preference storage still loads the default project and permits switching', async t => {
  const page = await dashboard(t, { setup(window) {
    const unavailable = () => { throw new window.DOMException('Storage disabled', 'SecurityError'); };
    window.Storage.prototype.getItem = unavailable;
    window.Storage.prototype.setItem = unavailable;
  } });
  assert.match(page.get('#view-panel').textContent, /alpha/);
  page.click('[data-project-id="beta"]'); await page.settle();
  assert.match(page.get('#view-panel').textContent, /beta/);
  assert.equal(page.get('#view-panel').hasAttribute('aria-busy'), false);
});
