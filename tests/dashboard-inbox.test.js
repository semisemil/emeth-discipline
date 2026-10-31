'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { openPage, project, index } = require('./helpers/dashboard-page');
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
  run('dashboard/inbox.js',['on']);
  assert.equal(fs.existsSync(path.join(path.dirname(registryPath),'inbox.enabled')),true);
  const hook = JSON.parse(prompt());
  assert.match(hook.hookSpecificOutput.additionalContext,/inbox\.js.*test-chat.*first/);
  function record() {
    run('dashboard/inbox.js',['test-chat','first','result','File check','(C:/Proofline/plugins/emeth-discipline/skills/rules/codex.md:15)\n\n*(../../src/python/addons/builtin/image*data/addon_pack.py)&#x20;']);
  }
  record();
  const load = () => readInbox([registered],{registryPath});
  const item = load().items[0];
  run('dashboard/inbox.js',['off']);
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

for (const host of ['claude','mixdog']) {
  test(host + ' prompt hook follows the shared opt-in and supplies a usable task identity', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(),'emeth-inbox-hook-'));
    t.after(() => fs.rmSync(root,{recursive:true,force:true}));
    const plugin = path.resolve('plugins/emeth-discipline');
    const env = { ...process.env, APPDATA:root, XDG_CONFIG_HOME:root, PLUGIN_ROOT:'', PLUGIN_DATA:'',
      CLAUDE_PLUGIN_ROOT:plugin, CLAUDE_PLUGIN_DATA:root,
      MIXDOG_PLUGIN_ROOT:host === 'mixdog' ? plugin : '', MIXDOG_PLUGIN_DATA:'' };
    const options = {registryPath:getRegistryPath({env})};
    const project = registerProject(root,options).project;
    const run = (file,args,input) => execFileSync(process.execPath,[path.join(plugin,file),...args],{env,cwd:root,input,encoding:'utf8'});
    const submit = () => run('hooks/run.js',[],JSON.stringify({hook_event_name:'UserPromptSubmit',cwd:root,
      session_id:host === 'claude' ? 'chat' : undefined,prompt:'Inspect the result'}));
    assert.doesNotMatch(submit(),/dashboard[\\/]inbox\.js/);
    run('dashboard/inbox.js',['on']);
    const context = JSON.parse(submit()).hookSpecificOutput.additionalContext;
    const match = context.match(/inbox\.js" "([^"]+)" "([^"]+)"/);
    assert.ok(match);
    assert.ok(match[1].startsWith(host + ':'));
    run('dashboard/inbox.js',[match[1],match[2],'result','Completed','Ready for review']);
    assert.equal(readInbox([project],options).items[0].text,'Ready for review');
    run('dashboard/inbox.js',['off']);
    assert.doesNotMatch(submit(),/dashboard[\\/]inbox\.js/);
  });
}
