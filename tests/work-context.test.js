'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {WorkContext}=require('../plugins/emeth-discipline/lib/work-context');
const helper=path.resolve(__dirname,'../plugins/emeth-discipline/lib/work-context.js');

test('versioned public reads preserve content, return changes and allow refresh after recovery',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'emeth-context-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'artifact.md'),state=path.join(dir,'state.json');
 fs.writeFileSync(file,'one\ntwo\nthree\n');
 const call=(...args)=>{const r=spawnSync(process.execPath,[helper,'read','--state',state,'--path',file,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
 const first=call();assert.equal(first.status,'full');assert.equal(first.content,'one\ntwo\nthree\n');
 assert.equal(call().status,'unchanged');
 assert.equal(call('--refresh').content,first.content);
 fs.writeFileSync(file,'one\nupdated\nthree\n');
 const changed=call();assert.equal(changed.previous_sha256,first.sha256);assert.deepEqual(changed.changes,{start:2,removed:['two'],added:['updated']});
 assert.equal(call('--refresh').content,'one\nupdated\nthree\n');
 const another=new WorkContext(path.join(dir,'independent.json'));assert.equal(another.read(file).status,'full');
});

test('workflow decisions and read ranges survive a new context instance',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'emeth-context-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'source.txt'),state=path.join(dir,'state.json');fs.writeFileSync(file,'first\nsecond\nthird');
 const context=new WorkContext(state);context.progress({stage:'review',decisions:['Keep the public API'],pending:['Independent review'],artifacts:[file]});
 assert.equal(context.read(file,{from:2,to:2}).content,'second');
 fs.writeFileSync(file,'changed\nsecond\nthird');
 const restored=new WorkContext(state);assert.equal(restored.progress().stage,'review');
 const unchangedRange=restored.read(file,{from:2,to:2});assert.equal(unchangedRange.status,'unchanged');
 assert.equal(new WorkContext(state).summary().reads[0].sha256,unchangedRange.sha256);
 assert.equal(restored.read(file).status,'full');
});
