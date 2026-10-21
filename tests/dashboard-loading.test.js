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
  assert.match(page.get('#status-stack').textContent, /프로젝트를 읽을 수 없습니다/);
  assert.match(page.get('#view-panel').textContent, /프로젝트를 표시할 수 없음/);
});
