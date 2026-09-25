'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const test = require('node:test');
const cli = path.resolve(__dirname, '../writers/document-writer.js');
function fixture(t, kind='design', pretty=false, newline='\n') {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'emeth-status-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const project=path.join(root,'project'), id=kind==='design'?'DESIGN-0001':'SPEC-0001';
  const file=path.join(project,'.emeth',kind==='design'?'designs':'specs',id+'-test',kind==='design'?'DESIGN.md':'SPEC.md');
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const metadata={schema_version:2,id,title:'상태 변경',kind:'feature',status:'ready',revision:3,supersedes:[],superseded_by:null,related_issues:[]};
  const body='\r\n# Body 한글\n\n"status": "ready" must remain.\r\nTrailing spaces  \n';
  const text='---'+newline+JSON.stringify(metadata,null,pretty?2:undefined).replace(/\n/g,newline)+newline+'---'+newline+body;
  fs.writeFileSync(file,text);
  const env={...process.env,APPDATA:path.join(root,'config'),XDG_CONFIG_HOME:path.join(root,'config')};
  const run=(extra=[],memory='off')=>spawnSync(process.execPath,[cli,'status','--project-root',project,'--id',id,'--status','completed',...(memory ? ['--memory',memory] : []),...extra],{env,encoding:'utf8',input:'Not document stdin',timeout:10000,windowsHide:true});
  return {root,project,id,file,metadata,body,text,run};
}
for(const kind of ['design','spec']) for(const pretty of [false,true]) test(`${kind} status handles ${pretty?'pretty CRLF':'compact LF'} JSON without document input`,t=>{
  const f=fixture(t,kind,pretty,pretty?'\r\n':'\n');
  const r=f.run();assert.equal(r.status,0,r.stderr);
  const output=JSON.parse(r.stdout);assert.equal(output.document_status,'completed');assert.equal(output.write.status,'updated');assert.equal(output.write.revision,3);assert.equal(output.write.snapshot,null);assert.notEqual(output.registration.status,'failed');
  const text=fs.readFileSync(f.file,'utf8'), match=text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  assert.deepEqual(JSON.parse(match[1]),{...f.metadata,status:'completed'});
  assert.deepEqual(Buffer.from(match[2]),Buffer.from(f.body));
  const before=fs.readFileSync(f.file);const again=f.run();assert.equal(again.status,0,again.stderr);assert.equal(JSON.parse(again.stdout).write.status,'no-op');assert.deepEqual(fs.readFileSync(f.file),before);
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
test('missing and ambiguous IDs fail without changing a document',t=>{
 const f=fixture(t);const other=path.join(path.dirname(path.dirname(f.file)),f.id+'-duplicate',path.basename(f.file));
 fs.mkdirSync(path.dirname(other));fs.writeFileSync(other,f.text);
 assert.notEqual(f.run().status,0);assert.equal(fs.readFileSync(f.file,'utf8'),f.text);
 fs.unlinkSync(other);fs.unlinkSync(f.file);assert.notEqual(f.run().status,0);assert.equal(fs.existsSync(f.file),false);
});
test('status respects an active Design lock',t=>{
 const f=fixture(t),lock=path.join(f.project,'.emeth','.design-write.lock');fs.writeFileSync(lock,String(process.pid));
 const r=f.run();assert.notEqual(r.status,0);assert.match(r.stderr,/document-locked/);assert.equal(fs.readFileSync(f.file,'utf8'),f.text);assert.equal(fs.readFileSync(lock,'utf8'),String(process.pid));
});

test('status and repeated status do not initialize an absent Memory', t => {
  const f = fixture(t);
  for (const expected of ['updated', 'no-op']) {
    const result = f.run([], null);
    assert.equal(result.status, 0, result.stderr);
    const value = JSON.parse(result.stdout);
    assert.equal(value.write.status, expected);
    assert.equal(value.memory.status, 'not-connected');
    assert.equal(fs.existsSync(path.join(f.project, 'docs')), false);
    assert.equal(fs.existsSync(path.join(f.project, '.emeth/architecture.json')), false);
  }
});

test('status reports a connected Memory without rewriting its files', t => {
  const f = fixture(t);
  require('../skills/architecture-memory/scripts/record.js').ensureMemory(f.project);
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
