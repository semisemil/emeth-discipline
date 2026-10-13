'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const core = require('../plugins/emeth-discipline/dashboard/assets/core');
const source = fs.readFileSync(path.join(__dirname, '../plugins/emeth-discipline/dashboard/assets/app.js'), 'utf8');

function functionSource(start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

test('pending project switches preserve the current body even when rendering is requested', () => {
  const body = ['existing project'];
  const state = { projectTransition: {}, loading: true, index: null, view: 'work' };
  const context = vm.createContext({
    state, document: {}, updateContext() {},
    elements: { viewPanel: { querySelector() {}, replaceChildren() { body.length = 0; } } },
    selectedProject: () => ({ availability: 'available' }),
    commitView: (content) => body.push(content), renderWork: () => 'new project',
  });
  vm.runInContext(functionSource('  function renderView(', '  function updateTabs()'), context);
  context.renderView();
  assert.deepEqual(body, ['existing project']);
  state.loading = false;
  state.index = {};
  context.renderView();
  assert.deepEqual(body, ['new project']);
});

test('project loading does not insert a banner above the existing body', () => {
  const messages = [];
  const context = vm.createContext({
    state: { projectTransition: {}, loading: true, notice: '프로젝트 작업을 읽습니다.' },
    elements: { status: { replaceChildren() { messages.length = 0; }, append(value) { messages.push(value); } } },
    make() { throw new Error('A transition must not create a layout-shifting banner'); },
  });
  vm.runInContext(functionSource('  function renderStatus()', '  async function loadProjects('), context);
  context.renderStatus();
  assert.equal(messages.length, 0);
});

test('background refresh cannot supersede a pending project switch; a failed switch settles', async () => {
  let reject;
  let calls = 0;
  let renders = 0;
  const state = { projectTransition: {}, selectedProjectId: 'new', index: null, loading: false };
  const context = vm.createContext({
    state, indexRequestGate: core.createLatestRequestGate(),
    selectedProject: () => ({ id: 'new', availability: 'available' }),
    setLoading(value) { state.loading = value; },
    setError(error) { state.error = error; },
    api() { calls++; return new Promise((_resolve, rejectRequest) => { reject = rejectRequest; }); },
    renderStatus() {}, updateContext() {}, renderProjects() {}, renderView() { renders++; },
  });
  vm.runInContext(functionSource('  async function loadIndex(', '  async function selectProject('), context);
  const request = context.loadIndex();
  assert.equal(state.loading, true);
  await context.loadIndex(false, true);
  assert.equal(calls, 1);
  reject(new Error('Offline'));
  await request;
  assert.equal(state.loading, false);
  assert.equal(state.error.message, 'Offline');
  assert.equal(renders, 1);
});
