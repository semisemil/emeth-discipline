'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const test = require('node:test');
const writer = path.resolve(__dirname, '../plugins/emeth-discipline/writers/document-writer.js');
function fixture(t) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-verified-record-'));
  t.after(() => fs.rmSync(project, {recursive:true, force:true}));
  const env = {...process.env, APPDATA:path.join(project,'.config'), XDG_CONFIG_HOME:path.join(project,'.config')};
  const issueFile=path.join(project,'.emeth/issues/PL-0001.json');
  fs.mkdirSync(path.dirname(issueFile),{recursive:true});
  const template=fs.readFileSync(path.resolve(__dirname,'../plugins/emeth-discipline/skills/issue-ledger/assets/templates/issue-objective.json'),'utf8');
  const issue=JSON.parse(template.replace(/REPLACE: [^"]*/g,'관련 계약 두 개를 갱신하고 이전 리비전을 보존한다.'));
  issue.identity.id='PL-0001'; issue.created_at=issue.updated_at='2026-11-01T00:00:00.000Z';
  fs.writeFileSync(issueFile,JSON.stringify(issue,null,2)+'\n');
  const designs=[1,2].map(n=>{
    const id='DESIGN-'+String(n).padStart(4,'0'),directory=path.join(project,'.emeth/designs',id+'-contract');
    fs.mkdirSync(directory,{recursive:true});
    const text='---\n'+JSON.stringify({schema_version:2,id,title:'계약 '+n,kind:'feature',status:'completed',revision:3,supersedes:[],superseded_by:null,related_issues:[]},null,2)+'\n---\n\n# 계약\n\n이전 계약\n';
    fs.writeFileSync(path.join(directory,'DESIGN.md'),text);return {id,directory,text};
  });
  const packet={designs:designs.map(d=>({id:d.id,change_kind:'major',patch:{edits:[{old:'이전 계약',new:'현재 계약'}]}})),issue:{id:'PL-0001',outcome:{current_summary:'두 계약을 갱신하고 이전 리비전과 연결을 보존했다.',evidence:[{kind:'verification',location:'Design 저장 결과',observation:'두 계약과 이전 리비전 저장을 확인했다.',targets:['C1']}],status:'resolved'}}};
  const run=input=>spawnSync(process.execPath,[writer,'record','--project-root',project],{encoding:'utf8',input:JSON.stringify(input),env,windowsHide:true});
  const context=extra=>spawnSync(process.execPath,[writer,'context','--project-root',project,...(extra.includes('--records')?[]:['--records','both']),...extra],{encoding:'utf8',env,windowsHide:true});
  return {project,issueFile,designs,packet,run,context,env};
}

async function executeInline(f,code,bindings,applyPatch) {
  const executions=[],emissions=[],stopped=new Error('cell exited');let exited=false;
  try {
    await require('node:vm').runInNewContext('(async()=>{'+code+'})()',{
      ...bindings,text:value=>emissions.push(value),exit:()=>{exited=true;throw stopped;},
      tools:{exec_command:async options=>{
        const result=spawnSync(options.shell,process.platform==='win32'?['-NoProfile','-Command',options.cmd]:['-c',options.cmd],{cwd:options.workdir,env:f.env,encoding:'utf8',windowsHide:true});
        executions.push({options,result});return {exit_code:result.status,output:result.stdout+result.stderr};
      },apply_patch:applyPatch||(()=>{throw Error('Unexpected source edit');})}
    });
  } catch(error) {if(error!==stopped)throw error;}
  return {executions,emissions,exited};
}

test('context confines discovery to the requested record kind', t=>{
  const f=fixture(t),file=path.join(f.designs[0].directory,'DESIGN.md');
  fs.writeFileSync(file,'unreadable Design metadata');
  let r=f.context(['--records','issues']);assert.equal(r.status,0,r.stderr);
  let result=JSON.parse(r.stdout);assert.equal(result.complete,true);assert.equal(result.issues.total,1);assert.equal(result.designs,undefined);
  assert.equal(result.scope,'issues');
  fs.writeFileSync(file,f.designs[0].text);fs.writeFileSync(f.issueFile,'unreadable Issue JSON');
  r=f.context(['--records','designs','--query','계약']);assert.equal(r.status,0,r.stderr);
  result=JSON.parse(r.stdout);assert.equal(result.complete,true);assert.equal(result.designs.total,2);assert.equal(result.issues,undefined);
  assert.equal(result.scope,'designs');
  assert.equal(result.record_help,undefined);
});

test('a missing record scope fails before accessing or migrating a record store',t=>{
  const project=fs.mkdtempSync(path.join(os.tmpdir(),'emeth-missing-record-scope-'));
  t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
  const legacy=path.join(project,'.proofline','issues');fs.mkdirSync(legacy,{recursive:true});
  fs.writeFileSync(path.join(legacy,'unreadable.json'),'invalid record');
  const r=spawnSync(process.execPath,[writer,'context','--project-root',project,'--query','anything'],{encoding:'utf8',windowsHide:true});
  assert.notEqual(r.status,0);assert.match(JSON.parse(r.stderr).error.message,/Supply --records/);
  assert.equal(fs.existsSync(path.join(project,'.emeth')),false);
  assert.equal(fs.readFileSync(path.join(legacy,'unreadable.json'),'utf8'),'invalid record');
});

test('the empty-store batch registers before source edits, then executes verification and saves the Designs and Issue',async t=>{
  const f=fixture(t);fs.unlinkSync(f.issueFile);
  const source=path.join(f.project,'source.js');fs.writeFileSync(source,"exports.contractValue=()=> 'old';\n");
  const r=f.context(['--query','contractValue','--code-context','3','--format','codex-text']);assert.equal(r.status,0,r.stderr);
  const code=/```javascript\n([\s\S]*?)```/.exec(r.stdout)?.[1];assert.ok(code);
  const brief={type:'task',title:'계약 값 갱신',risk:'low',origin:{kind:'request',summary:'계약 값을 변경한다.'},next_action:'값을 수정하고 로컬에서 검증한다.',objective:{summary:'새 계약 값을 반환한다.'},criteria:['공개 함수가 새 값을 반환한다.']};
  const outcome={current_summary:'계약 값을 수정하고 로컬에서 검증했다.',status:'resolved'};
  const verification=[{command:[process.execPath,'-e',"require('node:assert/strict').equal(require('./source').contractValue(),'new');"],targets:['C1'],observation:'공개 함수의 새 반환값을 로컬에서 확인한다.'}];
  let patched=false;
  const executed=await executeInline(f,code,{brief,preparedPatch:'prepared source patch',designs:f.packet.designs,outcome,verificationFor:created=>verification.map(check=>({...check,targets:[created.criteria[0].id]}))},async patch=>{
    assert.equal(patch,'prepared source patch');assert.equal(JSON.parse(fs.readFileSync(f.issueFile)).state.status,'open');
    fs.writeFileSync(source,"exports.contractValue=()=> 'new';\n");patched=true;return 'Applied';
  });
  assert.ok(patched);assert.equal(executed.exited,false);
  for(const {result} of executed.executions)assert.equal(result.status,0,result.stderr);
  const issue=JSON.parse(fs.readFileSync(f.issueFile));assert.equal(issue.state.status,'resolved');assert.deepEqual(issue.criteria[0].evidence_refs,['E1']);
  for(const design of f.designs)assert.match(fs.readFileSync(path.join(design.directory,'DESIGN.md'),'utf8'),/현재 계약/);
});

test('the existing-Issue code example executes edits, verification and record saves in one cell',async t=>{
  const f=fixture(t),source=path.join(f.project,'source.js');
  const summary="한글 🚀 '인용' $name `표기` $(Set-Content injected.txt injected)\n'@\n새 줄";
  f.packet.issue.outcome.current_summary=summary;
  fs.writeFileSync(source,"exports.contractValue=()=> 'old';\n");
  const context=f.context(['--query','contractValue','--code-context','3','--format','codex-text']);
  assert.equal(context.status,0,context.stderr);
  const code=/```javascript\n([\s\S]*?)```/.exec(context.stdout)?.[1];assert.ok(code);
  delete f.packet.issue.outcome.evidence;
  f.packet.verification=[{command:[process.execPath,'-e',"require('node:assert/strict').equal(require('./source').contractValue(),'new');require('node:fs').appendFileSync('checks.txt','once');"],targets:['C1'],observation:'소스의 현재 반환값을 확인했다.'}];
  let edits=0;
  const executed=await executeInline(f,code,{packet:f.packet,preparedPatch:'prepared source edit'},async patch=>{
    assert.equal(patch,'prepared source edit');edits++;
    assert.equal(JSON.parse(fs.readFileSync(f.issueFile)).state.status,'open');
    fs.writeFileSync(source,"exports.contractValue=()=> 'new';\n");return 'Applied';
  });
  assert.equal(edits,1);assert.equal(executed.executions.length,1);
  assert.equal(executed.executions[0].result.status,0,executed.executions[0].result.stderr);
  assert.equal(fs.readFileSync(path.join(f.project,'checks.txt'),'utf8'),'once');
  const issue=JSON.parse(fs.readFileSync(f.issueFile));assert.equal(issue.state.status,'resolved');assert.deepEqual(issue.criteria[0].evidence_refs,['E1']);
  assert.equal(issue.state.current_summary,summary);
  assert.equal(fs.existsSync(path.join(f.project,'injected.txt')),false);
  for(const design of f.designs)assert.match(fs.readFileSync(path.join(design.directory,'DESIGN.md'),'utf8'),/현재 계약/);
});

test('the prepared batch stops before code edits when the previously empty store changes',async t=>{
  const f=fixture(t),original=fs.readFileSync(f.issueFile);fs.unlinkSync(f.issueFile);
  fs.writeFileSync(path.join(f.project,'source.js'),'exports.contractValue=()=> 1;\n');
  const r=f.context(['--query','contractValue','--code-context','3','--format','codex-text']);assert.equal(r.status,0,r.stderr);
  const code=/```javascript\n([\s\S]*?)```/.exec(r.stdout)?.[1];assert.ok(code);
  fs.writeFileSync(f.issueFile,original);
  const brief={type:'task',title:'다음 작업',risk:'low',origin:{kind:'request',summary:'요청한 값을 변경한다.'},next_action:'다음 작업을 확인한다.',objective:{summary:'요청한 값을 제공한다.'},criteria:['요청한 값을 반환한다.']};
  const executed=await executeInline(f,code,{brief},()=>{assert.fail('Registration failure must stop source edits');});
  assert.equal(executed.exited,true);assert.notEqual(executed.executions[0].result.status,0);
  assert.deepEqual(fs.readFileSync(f.issueFile),original);assert.equal(fs.readFileSync(path.join(f.project,'source.js'),'utf8'),'exports.contractValue=()=> 1;\n');
});

test('code context supplies real source excerpts while excluding a configured Design store', {skip:spawnSync('rg',['--version'],{windowsHide:true}).status!==0},t=>{
  const f=fixture(t),directory=path.join(f.project,'docs','[record-store]','DESIGN-0001-contract');
  fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,'DESIGN.md'),f.designs[0].text+'\ncalculateLimit RECORD_CONTENT_ONLY\n');
  fs.writeFileSync(path.join(f.project,'.emeth/documents.json'),JSON.stringify({schema_version:1,designs:'docs/[record-store]'}));
  fs.writeFileSync(path.join(f.project,'source.js'),'exports.calculateLimit = values => values.length;\n');
  const manifest='{"scripts":{"test":"node --test"}}\n';
  fs.writeFileSync(path.join(f.project,'package.json'),manifest);
  fs.writeFileSync(path.join(f.project,'AGENTS.md'),'Use the project test command.\n');
  const r=f.context(['--query','calculateLimit','--code-context','3']);assert.equal(r.status,0,r.stderr);
  const result=JSON.parse(r.stdout);assert.equal(result.code.available,true);assert.match(result.code.text,/source\.js:1:exports\.calculateLimit/);
  assert.doesNotMatch(result.code.text,/RECORD_CONTENT_ONLY|DESIGN\.md/);
  assert.match(result.designs.matches[0].sources[0].text,/RECORD_CONTENT_ONLY/);
  assert.match(result.code.files.text,/source\.js/);
  assert.doesNotMatch(result.code.files.text,/\.emeth|record-store|DESIGN\.md/);
  assert.equal(result.files.find(file=>file.path==='package.json').text,manifest);
  assert.deepEqual(result.files.find(file=>file.path==='source.js'),{path:'source.js',text:'exports.calculateLimit = values => values.length;\n',truncated:false});
  assert.equal(result.files.find(file=>file.path==='AGENTS.md').text,'Use the project test command.\n');
  fs.writeFileSync(path.join(f.project,'AGENTS.md'),'instruction '.repeat(2000));
  const bounded=JSON.parse(f.context(['--query','calculateLimit','--code-context','3']).stdout);
  assert.ok(bounded.files.reduce((n,file)=>n+(file.text?.length||0),0)<=6000);
  assert.equal(bounded.files.find(file=>file.path==='AGENTS.md').truncated,true);
});

test('readable context supplies complete matched source once and preserves excerpts for oversized files', {skip:spawnSync('rg',['--version'],{windowsHide:true}).status!==0},t=>{
  const f=fixture(t),source='exports.uniqueContract = () => 42;\n';
  fs.writeFileSync(path.join(f.project,'source.js'),source);
  const first=f.context(['--query','uniqueContract','--code-context','3','--format','codex-text']);
  assert.equal(first.status,0,first.stderr);
  assert.equal(first.stdout.split(source.trim()).length-1,1);
  assert.match(first.stdout,/supplied_as_full_files/);
  assert.doesNotMatch(first.stdout,/Code explanation guidance/);
  fs.writeFileSync(path.join(f.project,'source.js'),source+'// unrelated source\n'.repeat(500));
  const second=f.context(['--query','uniqueContract','--code-context','3','--format','codex-text']);
  assert.equal(second.status,0,second.stderr);
  assert.match(second.stdout,/source\.js:1:exports\.uniqueContract/);
  assert.doesNotMatch(second.stdout,/supplied_as_full_files/);
});

test('initial source context reports preexisting Git changes without enumerating default or configured record stores',{
  skip:spawnSync('rg',['--version'],{windowsHide:true}).status!==0||spawnSync('git',['--version'],{windowsHide:true}).status!==0
},t=>{
  const f=fixture(t),source=path.join(f.project,'source.js'),storage=path.join(f.project,'docs','[store]');
  fs.writeFileSync(source,"exports.contractValue=()=> 'old';\n");fs.mkdirSync(storage,{recursive:true});
  fs.writeFileSync(path.join(storage,'private.md'),'contractValue RECORD_CONTENT_ONLY');
  fs.writeFileSync(path.join(f.project,'.emeth/documents.json'),JSON.stringify({schema_version:1,designs:'docs/[store]'}));
  for(const args of [['init','--quiet'],['add','source.js'],['-c','user.name=Context Test','-c','user.email=context@invalid.local','-c','commit.gpgsign=false','commit','--quiet','-m','Initial source']]){
    const result=spawnSync('git',args,{cwd:f.project,encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);
  }
  fs.appendFileSync(source,'// Existing local change\n');
  const r=f.context(['--records','issues','--query','contractValue','--code-context','3']);assert.equal(r.status,0,r.stderr);
  const result=JSON.parse(r.stdout);assert.equal(result.worktree_status.available,true);assert.equal(result.worktree_status.truncated,false);
  assert.match(result.worktree_status.text,/(?:^|\n) M source\.js(?:\r?\n|$)/);
  assert.doesNotMatch(result.worktree_status.text,/\.emeth|\.proofline|\[store\]|private\.md/);
  assert.doesNotMatch(result.code.text,/RECORD_CONTENT_ONLY/);assert.equal(result.designs,undefined);
});

test('file input saves a large Issue outcome and preserves BOM Design document-set bytes',t=>{
  const f=fixture(t),detail=path.join(f.designs[0].directory,'contract.md');
  const overview='\ufeff'+f.designs[0].text.replace('"related_issues": []','"related_issues": [], "documents": ["contract.md"]').replaceAll('\n','\r\n');
  const body='\ufeff# 상세\r\n\r\n기존 조건.\r\n유지할 마지막 문장.';
  fs.writeFileSync(path.join(f.designs[0].directory,'DESIGN.md'),overview);fs.writeFileSync(detail,body);
  f.packet.designs[0].patch.documents=[{path:'contract.md',edits:[{old:'기존 조건.',new:'새 조건.'}]}];
  f.packet.issue.outcome.current_summary='상세 결과 '.repeat(4000);
  const file=path.join(f.project,"입력 '$name'.json");fs.writeFileSync(file,JSON.stringify(f.packet));
  const saved=spawnSync(process.execPath,[writer,'record','--project-root',f.project,'--input',file],{env:f.env,encoding:'utf8',windowsHide:true});
  assert.equal(saved.status,0,saved.stderr);
  for(const design of f.designs){const text=fs.readFileSync(path.join(design.directory,'DESIGN.md'),'utf8');assert.match(text,/현재 계약/);assert.doesNotMatch(text,/이전 계약/);}
  assert.deepEqual(fs.readFileSync(detail),Buffer.from(body.replace('기존 조건.','새 조건.')));
  const result=JSON.parse(saved.stdout),snapshot=result.designs[0].write.snapshot.path;
  assert.deepEqual(fs.readFileSync(path.join(f.project,snapshot)),Buffer.from(overview));
  assert.deepEqual(fs.readFileSync(path.join(path.dirname(path.join(f.project,snapshot)),'contract.md')),Buffer.from(body));
  const issue=JSON.parse(fs.readFileSync(f.issueFile));assert.equal(issue.state.status,'resolved');assert.deepEqual(issue.criteria[0].evidence_refs,['E1']);
  assert.equal(issue.state.current_summary,f.packet.issue.outcome.current_summary);
});

test('a failed prepared check leaves all Issue and Design bytes and revisions untouched',t=>{
  const f=fixture(t),before=fs.readFileSync(f.issueFile);
  f.packet.verification=[{command:[process.execPath,'-e',"require('node:assert/strict').equal(41,42);"],observation:'기대값을 확인한다.',targets:['C1']}];
  const r=f.run(f.packet);assert.notEqual(r.status,0);const error=JSON.parse(r.stderr);
  assert.equal(error.error.code,'record-verification-failed');assert.equal(error.records.designs.length,0);
  assert.notEqual(error.records.verification[0].exit_code,0);assert.match(error.records.verification[0].stderr,/AssertionError/);
  assert.deepEqual(fs.readFileSync(f.issueFile),before);
  for(const d of f.designs){assert.equal(fs.readFileSync(path.join(d.directory,'DESIGN.md'),'utf8'),d.text);assert.equal(fs.existsSync(path.join(d.directory,'revisions')),false);}
});
test('a later Design failure reports saved work and leaves the Issue and pending Design untouched',t=>{
  const f=fixture(t),original=fs.readFileSync(f.issueFile);f.packet.designs[1].patch.edits[0].old='없는 문장';
  const r=f.run(f.packet);assert.notEqual(r.status,0);const error=JSON.parse(r.stderr);
  assert.equal(error.records.designs.length,1);assert.equal(error.records.issue.status,'not-written');
  assert.ok(fs.readFileSync(path.join(f.designs[0].directory,'DESIGN.md'),'utf8').includes('현재 계약'));
  assert.equal(fs.readFileSync(path.join(f.designs[1].directory,'DESIGN.md'),'utf8'),f.designs[1].text);assert.deepEqual(fs.readFileSync(f.issueFile),original);
});
test('invalid final Issue proof preserves the Issue and exposes all successfully saved Designs for recovery',t=>{
  const f=fixture(t),original=fs.readFileSync(f.issueFile);f.packet.issue.outcome.evidence[0].targets=['C999'];
  const r=f.run(f.packet);assert.notEqual(r.status,0);const error=JSON.parse(r.stderr);
  assert.equal(error.error.code,'record-issue-update-failed');assert.equal(error.records.designs.length,2);assert.equal(error.records.issue.status,'not-written');assert.deepEqual(fs.readFileSync(f.issueFile),original);
});
