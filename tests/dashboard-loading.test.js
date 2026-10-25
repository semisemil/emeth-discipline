'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { dashboard, index, project, deferred } = require('./helpers/dashboard-page');

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
