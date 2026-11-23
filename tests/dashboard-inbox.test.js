'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { openPage, dashboard, project, index, deferred } = require('./helpers/dashboard-page');
const { readInbox, setDisposition } = require('../plugins/emeth-discipline/dashboard/inbox');
const { registerProject, getRegistryPath } = require('../plugins/emeth-discipline/dashboard/registry');

test('ordinary Codex hook supplies a writer and review state survives reopening the integrated dashboard', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'emeth-work-record-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const env = { ...process.env, APPDATA:root, XDG_CONFIG_HOME:root, PLUGIN_ROOT:path.resolve('plugins/emeth-discipline') };
  const registryPath = getRegistryPath({env});
  const registered = registerProject(root,{registryPath}).project;
  const p = project(registered.id);
  const input = {hook_event_name:'UserPromptSubmit',session_id:'test-chat',turn_id:'first',cwd:root,prompt:'Check this file'};
  const run = (file,args,stdin) => execFileSync(process.execPath,[path.join(env.PLUGIN_ROOT,file),...args],{env,cwd:root,input:stdin,encoding:'utf8'});
  const prompt = () => run('hooks/run.js',[],JSON.stringify(input));
  assert.doesNotMatch(prompt(), /inbox\.js/);
  record();
  assert.equal(fs.existsSync(path.join(path.dirname(registryPath),'work-items.sqlite')),false);
  run('skills/settings/scripts/settings.js',['inbox','on']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'emeth/settings.json'),'utf8')).inbox,true);
  const hook = JSON.parse(prompt());
  assert.match(hook.hookSpecificOutput.additionalContext,/inbox\.js.*test-chat.*first/);
  function record() {
    run('dashboard/inbox.js',['test-chat','first','result','File check','(C:/Proofline/plugins/emeth-discipline/skills/rules/codex.md:15)\n\n*(../../src/python/addons/builtin/image*data/addon_pack.py)&#x20;']);
  }
  record();
  const load = () => readInbox([registered],{registryPath});
  const item = load().items[0];
  run('skills/settings/scripts/settings.js',['inbox','off']);
  assert.doesNotMatch(prompt(), /inbox\.js/);
  run('dashboard/inbox.js',['test-chat','second','result','Disabled','Should not be recorded']);
  assert.deepEqual(load().items,[item]);
  const routes = { '/api/v1/health':{version:'1'},'/api/v1/projects':{projects:[p]},
    ['/api/v1/projects/'+p.id+'/index']:index(p),'/api/v1/inbox':load };
  for (const state of ['later','done']) routes['/api/v1/inbox/'+item.key+'/'+state] = () => {
    assert.ok(setDisposition([registered],item.key,state,{registryPath}));
    return {};
  };
  const page = await openPage(t,{page:'home',routes});
  assert.equal(page.get('#inbox-link').getAttribute('aria-current'),'page');
  assert.equal(page.get('.entry-body').textContent.trim(),'codex.md:15\naddon_pack.py');
  assert.equal(page.get('.file-reference').title,'C:/Proofline/plugins/emeth-discipline/skills/rules/codex.md:15');
  assert.equal(page.get('#unread-count').textContent, '1');
  const row = page.get('[data-kind="result"] details');
  row.open = true;
  row.dispatchEvent(new page.window.Event('toggle'));
  assert.equal(page.get('#unread-count').hidden, true);
  const key = 'emeth.inbox.read.' + item.key;
  const readStorage = { [key]: page.window.localStorage.getItem(key) };
  page.click('[data-kind="result"] button');
  await page.settle();
  record();
  const reopened = await openPage(t,{page:'home',routes,storage:readStorage});
  assert.equal(reopened.get('#unread-count').hidden,true);
  assert.equal(reopened.get('[data-kind="later"] .count').textContent,'1');
  reopened.click('[data-kind="later"] button');
  await reopened.settle();
  assert.equal(load().items[0].state,'done');
});

test('claude prompt hook follows the shared opt-in and supplies a usable task identity', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'emeth-inbox-hook-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const plugin = path.resolve('plugins/emeth-discipline');
  const env = { ...process.env, APPDATA:root, XDG_CONFIG_HOME:root, PLUGIN_ROOT:'', PLUGIN_DATA:'',
    CLAUDE_PLUGIN_ROOT:plugin, CLAUDE_PLUGIN_DATA:root };
  const options = {registryPath:getRegistryPath({env})};
  const project = registerProject(root,options).project;
  const run = (file,args,input) => execFileSync(process.execPath,[path.join(plugin,file),...args],{env,cwd:root,input,encoding:'utf8'});
  const submit = () => run('hooks/run.js',[],JSON.stringify({hook_event_name:'UserPromptSubmit',cwd:root,
    session_id:'chat',prompt:'Inspect the result'}));
  assert.doesNotMatch(submit(),/dashboard[\\/]inbox\.js/);
  run('skills/settings/scripts/settings.js',['inbox','on']);
  const context = JSON.parse(submit()).hookSpecificOutput.additionalContext;
  const match = context.match(/inbox\.js" "([^"]+)" "([^"]+)"/);
  assert.ok(match);
  assert.ok(match[1].startsWith('claude:'));
  run('dashboard/inbox.js',[match[1],match[2],'result','Completed','Ready for review']);
  assert.equal(readInbox([project],options).items[0].text,'Ready for review');
  run('skills/settings/scripts/settings.js',['inbox','off']);
  assert.doesNotMatch(submit(),/dashboard[\\/]inbox\.js/);
});

test('bulk read respects the project and folder, persists reads and flags later updates', async t => {
  const items = [
    { key:'a', project:'alpha', kind:'question', state:'open' },
    { key:'b', project:'alpha', kind:'result', state:'open' },
    { key:'c', project:'beta', kind:'result', state:'open' },
    { key:'d', project:'alpha', kind:'active', state:'open' },
    { key:'e', project:'alpha', kind:'result', state:'later' },
    { key:'f', project:'alpha', kind:'result', state:'done' },
  ].map(item => ({ ...item, id:item.key, projectName:item.project, title:item.key, text:'Review', updated:1 }));
  const options = { page:'home', routes:{ '/api/v1/inbox':() => ({items}) } };
  const page = await dashboard(t, options);
  page.change('.inbox-scope', 'alpha');
  page.click('[data-bulk="read"]');
  assert.equal(page.get('#unread-count').textContent, '4');
  assert.equal(page.get('[data-bulk="read"]').disabled, true);
  assert.equal(page.get('[data-kind="question"] .entry-unread'), null);
  assert.equal(page.get('[data-kind="result"] .entry-unread'), null);
  assert.ok(page.get('[data-kind="active"] .entry-unread'));
  assert.equal(page.calls.some(call => call.method === 'POST'), false);
  const storage = Object.fromEntries(Object.entries(page.window.localStorage));
  assert.equal(storage['emeth.inbox.read.a'], '1');
  assert.equal(storage['emeth.inbox.read.b'], '1');
  assert.equal(storage['emeth.inbox.read.c'], undefined);
  const reopened = await dashboard(t, { ...options, storage });
  assert.equal(reopened.get('#unread-count').textContent, '4');
  items[0].updated = 2;
  await reopened.window.EmethInbox.refresh();
  assert.equal(reopened.get('#unread-count').textContent, '5');
  reopened.change('.inbox-scope', 'alpha');
  reopened.click('[data-folder="later"]');
  reopened.click('[data-bulk="read"]');
  assert.equal(reopened.window.localStorage.getItem('emeth.inbox.read.e'), '1');
  assert.equal(reopened.window.localStorage.getItem('emeth.inbox.read.a'), '1');
});

test('bulk completion uses the current list and preserves failures for retry', async t => {
  const items = [
    { key:'a', project:'alpha', state:'open' },
    { key:'b', project:'alpha', state:'open' },
    { key:'c', project:'beta', state:'open' },
    { key:'d', project:'alpha', state:'later' },
  ].map(item => ({ ...item, id:item.key, projectName:item.project, kind:'result', title:item.key, text:'Review', updated:1 }));
  const pending = deferred();
  let fail = true;
  const page = await dashboard(t, { page:'home', routes:{
    '/api/v1/inbox':() => ({items}),
    '/api/v1/inbox/a/done':async () => { await pending.promise; items[0].state = 'done'; return {}; },
    '/api/v1/inbox/b/done':() => {
      if (fail) return {error:true};
      items[1].state = 'done';
      return {};
    },
  } });
  page.change('.inbox-scope', 'alpha');
  page.click('[data-bulk="done"]');
  assert.equal(page.get('[data-bulk="done"]').disabled, true);
  assert.equal(page.get('[data-bulk="read"]').disabled, true);
  assert.equal(page.get('.entry-actions button').disabled, true);
  pending.resolve();
  await page.settle();
  assert.deepEqual(items.map(item => item.state), ['done', 'open', 'open', 'later']);
  assert.equal(page.get('#unread-count').textContent, '3');
  assert.match(page.get('#inbox-status').textContent, /1개 항목을 처리 완료.*1개 항목은 저장하지 못했습니다/);
  assert.deepEqual(page.calls.filter(call => call.method === 'POST').map(call => call.url),
    ['/api/v1/inbox/a/done', '/api/v1/inbox/b/done']);
  fail = false;
  page.click('[data-bulk="done"]');
  await page.settle();
  assert.equal(items[1].state, 'done');
  assert.equal(page.get('[data-bulk="done"]').disabled, true);
  page.click('[data-folder="done"]');
  assert.equal(page.get('[data-bulk="done"]').disabled, true);
  page.change('.inbox-scope', 'beta');
  page.click('[data-folder="later"]');
  assert.equal(page.get('[data-bulk="read"]').disabled, true);
  assert.equal(page.get('[data-bulk="done"]').disabled, true);
});
