'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const test = require('node:test');
const cli = path.resolve(__dirname, '../plugins/emeth-discipline/writers/document-writer.js');
function fixture(t, { pretty=false, newline='\n' }={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'emeth-status-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const project=path.join(root,'project'), id='DESIGN-0001';
  const file=path.join(project,'.emeth','designs',id+'-test','DESIGN.md');
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const metadata={schema_version:2,id,title:'상태 변경',kind:'feature',status:'ready',revision:3,supersedes:[],superseded_by:null,related_issues:[]};
  const body='\r\n# Body 한글\n\n"status": "ready" must remain.\r\nTrailing spaces  \n';
  const text='---'+newline+JSON.stringify(metadata,null,pretty?2:undefined).replace(/\n/g,newline)+newline+'---'+newline+body;
  fs.writeFileSync(file,text);
  const env={...process.env,APPDATA:path.join(root,'config'),XDG_CONFIG_HOME:path.join(root,'config')};
  const run=(extra=[],memory='off')=>spawnSync(process.execPath,[cli,'status','--project-root',project,'--id',id,'--status','completed',...(memory ? ['--memory',memory] : []),...extra],{env,encoding:'utf8',input:'Not document stdin',timeout:10000,windowsHide:true});
  return {root,project,id,file,metadata,body,text,run};
}
test('Design status preserves pretty CRLF metadata and body bytes without document input',t=>{
  const f=fixture(t,{pretty:true,newline:'\r\n'});
  const r=f.run();assert.equal(r.status,0,r.stderr);
  const output=JSON.parse(r.stdout);assert.equal(output.document_status,'completed');assert.equal(output.write.status,'updated');assert.equal(output.write.revision,3);assert.equal(output.write.snapshot,null);assert.notEqual(output.registration.status,'failed');
  const text=fs.readFileSync(f.file,'utf8'), match=text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  assert.deepEqual(JSON.parse(match[1]),{...f.metadata,status:'completed'});
  assert.deepEqual(Buffer.from(match[2]),Buffer.from(f.body));
  assert.equal(fs.existsSync(path.join(path.dirname(f.file),'revisions')),false);
});
test('invalid status and duplicate options leave the document unchanged',t=>{
 const f=fixture(t);
 for(const args of [['--status','bogus'],['--id','../outside'],['--relative-path','elsewhere']]) {
  const r=f.run(args);assert.notEqual(r.status,0);assert.equal(fs.readFileSync(f.file,'utf8'),f.text);
 }
 const r=spawnSync(process.execPath,[cli,'status','--project-root',f.project,'--id',f.id,'--status','bogus','--memory','off'],{encoding:'utf8'});
 assert.notEqual(r.status,0);assert.equal(fs.readFileSync(f.file,'utf8'),f.text);
});
test('a missing ID fails without recreating its document',t=>{
 const f=fixture(t);fs.unlinkSync(f.file);
 assert.notEqual(f.run().status,0);assert.equal(fs.existsSync(f.file),false);
});
test('status respects an active Design lock',t=>{
 const f=fixture(t),lock=path.join(f.project,'.emeth','.design-write.lock');fs.mkdirSync(lock);
 const owner=path.join(lock,'owner.json'),ownerText=JSON.stringify({pid:process.pid});fs.writeFileSync(owner,ownerText);
 const r=f.run();assert.notEqual(r.status,0);assert.match(r.stderr,/document-locked/);assert.equal(fs.readFileSync(f.file,'utf8'),f.text);assert.equal(fs.readFileSync(owner,'utf8'),ownerText);
});

test('status does not initialize an absent Memory', t => {
  const f = fixture(t);
  const result = f.run([], null);
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.write.status, 'updated');
  assert.equal(value.memory.status, 'not-connected');
  assert.equal(fs.existsSync(path.join(f.project, 'docs')), false);
  assert.equal(fs.existsSync(path.join(f.project, '.emeth/architecture.json')), false);
});

test('status reports a connected Memory without rewriting its files', t => {
  const f = fixture(t);
  require('../plugins/emeth-discipline/skills/architecture-memory/scripts/record.js').ensureMemory(f.project);
  const names = ['.emeth/architecture.json', 'docs/architecture/.architecture-memory/manifest.json', 'docs/architecture/04-context.md'];
  const before = names.map(name => ({ bytes: fs.readFileSync(path.join(f.project, name)), time: fs.statSync(path.join(f.project, name)).mtimeMs }));
  const result = f.run([], null);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).memory.status, 'connected');
  names.forEach((name, index) => {
    assert.deepEqual(fs.readFileSync(path.join(f.project, name)), before[index].bytes);
    assert.equal(fs.statSync(path.join(f.project, name)).mtimeMs, before[index].time);
  });
});

test('status preserves disabled or broken Memory and completes the document independently', t => {
  for (const [binding, expected] of [
    [JSON.stringify({ schema_version: 1, root: 'docs/architecture', enabled: false }), 'disabled'],
    [JSON.stringify({ schema_version: 1, root: 'docs/architecture' }), 'unavailable'],
    ['{broken', 'failed'],
  ]) {
    const f = fixture(t);
    const file = path.join(f.project, '.emeth/architecture.json');
    fs.writeFileSync(file, binding);
    const result = f.run([], null);
    assert.equal(result.status, 0, result.stderr);
    const value = JSON.parse(result.stdout);
    assert.equal(value.document_status, 'completed');
    assert.equal(value.memory.status, expected);
    assert.equal(fs.readFileSync(file, 'utf8'), binding);
    assert.equal(fs.existsSync(path.join(f.project, 'docs')), false);
  }
});
