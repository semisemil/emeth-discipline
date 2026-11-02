'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const test = require('node:test');
const { getRegistryPath } = require('../plugins/emeth-discipline/dashboard/registry.js');

const cli = path.resolve(__dirname, '../plugins/emeth-discipline/skills/issue-ledger/scripts/issue-ledger.js');
const timestamp = '2026-11-01T00:00:00.000Z';

function brief(title = '검색 결과의 "한글"과 경로 C:\\자료를 보존한다') {
  return {
    type: 'feature', title, risk: 'medium',
    origin: { kind: 'request', summary: '  사용자가 요청한 내용\n둘째 줄도 보존한다.  ' },
    next_action: '관련 Design을 갱신한다.',
    criteria: ['기존 검색 동작을 유지한다.', '새 결과를 독립적으로 검증한다.'],
    objective: { summary: '요청한 검색 결과를 제공한다.' },
  };
}

// Canonical input is constructed from the prior v2 public contract, not the new conversion.
function canonical(id = 'PL-0007') {
  return {
    schema_version: 2,
    identity: { id, aliases: [], type: 'task', mode: 'simple', title: '먼저 등록한 작업', risk: 'low' },
    origin: { kind: 'request', summary: '기존 요청', refs: [] },
    state: { status: 'open', current_summary: '기존 요청', next_action: '기존 작업을 진행한다.' },
    objective: { summary: '기존 계약을 유지한다.', constraints: [] },
    criteria: [{ id: 'C1', text: '기존 결과를 확인한다.', evidence_refs: [] }],
    relations: [], context: [], artifacts: [], evidence: [], events: [],
    created_at: timestamp, updated_at: timestamp,
  };
}

function initialIssue() {
  return {
    schema_version: 2,
    identity: { id: 'PL-0001', aliases: [], type: 'bug', mode: 'simple', title: '요청 중복 저장', risk: 'medium' },
    origin: { kind: 'request', summary: '같은 요청이 중복 저장된다.', refs: [] },
    state: { status: 'open', current_summary: '재현을 확인한다.', next_action: '기존 다음 작업을 보존한다.' },
    problem: { claims: [
      { id: 'P1', state: 'reported', text: '같은 요청을 두 번 저장한다.', evidence_refs: [] },
      { id: 'P2', state: 'reported', text: '응답 ID가 달라진다.', evidence_refs: [] },
    ], impact: '중복 데이터가 생긴다.' },
    criteria: [{ id: 'C1', text: '한 번만 저장한다.', evidence_refs: [] }],
    relations: [], context: [], artifacts: [], evidence: [], events: [], created_at: timestamp, updated_at: timestamp,
  };
}

function observation(extra = {}) {
  return { kind: 'test', location: 'tests/한글.test.js', observation: '요청을 한 번 저장했다.\n인용 "원문"을 보존한다.', ...extra };
}

function fixture(t, initial) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-issue-brief-'));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const root = path.join(project, '.emeth', 'issues');
  const file = path.join(root, 'PL-0001.json');
  if (initial) { fs.mkdirSync(root,{recursive:true});fs.writeFileSync(file,JSON.stringify(initial,null,2)+'\n'); }
  const env = { ...process.env, APPDATA: path.join(project, '.config'),
    XDG_CONFIG_HOME: path.join(project, '.config'), CODEX_HOME: path.join(project, '.codex') };
  const args = rest => [cli, ...rest, '--root', root, '--project-root', project];
  function run(rest, input) {
    return spawnSync(process.execPath, args(rest), {
      encoding: 'utf8', input: input === undefined ? undefined : JSON.stringify(input), env, windowsHide: true,
    });
  }
  function create(input = brief(), rest = []) {
    return run(['create', '--input-format', 'brief', '--input', '-', ...rest], input);
  }
  function read(id = 'PL-0001') { return JSON.parse(fs.readFileSync(path.join(root, `${id}.json`), 'utf8')); }
  function files() { return fs.existsSync(root) ? fs.readdirSync(root).filter(name => name.endsWith('.json') && !name.endsWith('.example.json')) : []; }
  function createAsync(input, rest = []) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args(['create', '--input-format', 'brief', '--input', '-', ...rest]),
        { env, windowsHide: true });
      let stdout = '', stderr = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.on('error', reject);
      child.on('close', status => resolve({ status, stdout, stderr }));
      child.stdin.end(JSON.stringify(input));
    });
  }
  function work(number, related = ['PL-0001'], kind = 'design') {
    const prefix = kind === 'design' ? 'DESIGN' : 'SPEC';
    const id = `${prefix}-${String(number).padStart(4, '0')}`;
    const location = `.emeth/${kind === 'design' ? 'designs' : 'specs'}/${id}-example/${prefix}.md`;
    const target = path.join(project, location);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `---\n${JSON.stringify({ schema_version: 2, id, title: '관련 계약', kind: 'feature', status: 'ready', revision: 1,
      supersedes: [], superseded_by: null, related_issues: related })}\n---\n\n# 계약\n`);
    return { kind, id, location };
  }
  const update = input => run(['update','PL-0001','--input-format','brief','--operation','-'],input);
  return { project, root, file, env, run, create, createAsync, read, files, update, work };
}

function rejected(result) { assert.equal(result.status,1,result.stderr);assert.equal(result.stdout,'');assert.match(result.stderr,/issue-store-changed/); }

test('rejected input loses no user fields, publishes no partial state, and allows correction', t => {
  const f=fixture(t),input=brief();
  const discarded=f.create({...input,notes:'사용자가 보존할 내용'});
  assert.notEqual(discarded.status,0);assert.deepEqual(f.files(),[]);
  assert.equal(fs.existsSync(getRegistryPath({env:f.env})),false);
  const created=f.create(input);assert.equal(created.status,0,created.stderr);
  const initial=f.read();
  const before=fs.readFileSync(f.file);
  const invalid=f.update({current_summary:'검증 전 완료 처리',status:'resolved'});
  assert.notEqual(invalid.status,0);assert.deepEqual(fs.readFileSync(f.file),before);
  const corrected=f.update({current_summary:'검증을 계속한다.'});
  assert.equal(corrected.status,0,corrected.stderr);
  const saved=f.read();
  assert.deepEqual(saved.state,{...initial.state,current_summary:'검증을 계속한다.'});
  assert.deepEqual({...saved,state:initial.state,updated_at:initial.updated_at},initial);
});

test('claims require current proof and explicit transitions preserve unrelated Issue state', t => {
  const f=fixture(t,initialIssue()),summary='재현 근거를 검토한다.';
  const transition=state=>f.run(['update','PL-0001','--operation','-'],{
    type:'set_claim_state',claim_id:'P1',state,current_summary:summary,updated_at:new Date().toISOString()
  });
  const original=fs.readFileSync(f.file);
  assert.notEqual(transition('confirmed').status,0);assert.deepEqual(fs.readFileSync(f.file),original);
  const proof=f.update({current_summary:summary,evidence:[observation({targets:['P1']})]});
  assert.equal(proof.status,0,proof.stderr);
  const baseline=f.read();assert.equal(baseline.problem.claims[0].state,'reported');
  for(const state of ['confirmed','refuted','reported']){
    const result=transition(state);assert.equal(result.status,0,result.stderr);
    const actual=f.read(),expected=structuredClone(baseline);
    expected.updated_at=actual.updated_at;expected.problem.claims[0].state=state;
    assert.deepEqual(actual,expected);
  }
  const invalidation=f.run(['update','PL-0001','--operation','-'],{
    type:'add_evidence',current_summary:summary,updated_at:new Date().toISOString(),targets:['C1'],
    evidence:{id:'E2',kind:'test',location:'재검증',observation:'이전 관찰을 무효화했다.',observed_at:new Date().toISOString(),invalidates:['E1']}
  });
  assert.equal(invalidation.status,0,invalidation.stderr);
  const invalidated=fs.readFileSync(f.file);
  assert.notEqual(transition('confirmed').status,0);assert.deepEqual(fs.readFileSync(f.file),invalidated);
});

test('inline creation returns generated IDs for a sequential update without guessing ledger numbers',t=>{
  const f=fixture(t),old=canonical('PL-0007');fs.mkdirSync(f.root,{recursive:true});
  const oldBytes=JSON.stringify(old,null,2)+'\n';fs.writeFileSync(path.join(f.root,'PL-0007.json'),oldBytes);
  const input=brief();input.type='bug';delete input.objective;
  input.problem={claims:['사용자가 요청을 저장할 때 오류가 발생한다.'],impact:'요청을 저장하지 못한다.'};
  const encoded=encodeURIComponent(JSON.stringify(input)).replaceAll("'",'%27');
  const result=f.run(['create','--input-format','brief','--data',encoded,'--output-format','json']);
  assert.equal(result.status,0,result.stderr);const created=JSON.parse(result.stdout);
  assert.equal(result.stderr,'');assert.deepEqual(created.warnings,[]);assert.ok(created.registration);
  assert.equal(created.id,'PL-0008');assert.equal(created.path,path.join(f.root,'PL-0008.json'));
  assert.equal(created.state.status,'open');assert.equal(created.state.current_summary,input.origin.summary);
  assert.deepEqual(created.criteria.map(item=>({id:item.id,text:item.text})),input.criteria.map((text,index)=>({id:'C'+(index+1),text})));
  assert.deepEqual(created.claims,[{id:'P1',state:'reported',text:input.problem.claims[0],evidence_refs:[]}]);
  const update={current_summary:'첫 조건의 로컬 검증 결과를 기록했다.',status:'doing',next_action:'남은 조건을 검증한다.',evidence:[{kind:'test',location:'local-check',observation:'첫 조건의 결과를 확인했다.',targets:[created.criteria[0].id]}]};
  const saved=f.run(['update',created.id,'--input-format','brief','--data',encodeURIComponent(JSON.stringify(update))]);
  assert.equal(saved.status,0,saved.stderr);
  const issue=f.read(created.id);assert.deepEqual(issue.criteria[0].evidence_refs,['E1']);assert.deepEqual(issue.criteria[1].evidence_refs,[]);
  assert.equal(issue.state.next_action,update.next_action);
  assert.equal(fs.readFileSync(path.join(f.root,'PL-0007.json'),'utf8'),oldBytes);
});

test('detailed selection supplies reusable state and criteria with explicit continuation while preserving the default list', t => {
  const f = fixture(t);
  for (const id of ['PL-0007', 'PL-0008']) {
    const value = canonical(id);
    value.identity.title = `독립 작업 ${id}`;
    const r = f.run(['create', '--input', '-'], value);
    assert.equal(r.status, 0, r.stderr);
  }
  const before = f.files().map(file => fs.readFileSync(path.join(f.root, file)));
  assert.equal(f.run(['list', '--all']).stdout, 'PL-0007\topen\t독립 작업 PL-0007\nPL-0008\topen\t독립 작업 PL-0008\n');
  const page = f.run(['list', '--all', '--details', '--limit', '1']);
  assert.equal(page.status, 0, page.stderr);
  assert.match(page.stdout, /\[PL-0007\]/);
  assert.match(page.stdout, /C1: 기존 결과를 확인한다\./);
  assert.match(page.stdout, /more: 1; next: --offset 1/);
  assert.doesNotMatch(page.stdout, /\[PL-0008\]/);
  const next = f.run(['list', '--all', '--details', '--limit', '1', '--offset', '1']);
  assert.match(next.stdout, /\[PL-0008\]/);
  assert.doesNotMatch(next.stdout, /more:|\[PL-0007\]/);
  assert.notEqual(f.run(['list', '--details', '--limit']).status, 0, 'A missing page bound must not silently become a one-record page');
  assert.deepEqual(f.files().map(file => fs.readFileSync(path.join(f.root, file))), before);
});

test('research briefs preserve supplied claims, source refs, summary, and existing relations', t => {
  const type = 'research';
  const f = fixture(t);
  const seed = f.run(['create', '--input', '-'], canonical());
  assert.equal(seed.status, 0, seed.stderr);
  const input = { ...brief(), type, current_summary: '새로 확인한 현재 상태',
    origin: { kind: 'review', summary: '검토에서 발견한 주장', refs: ['docs/검토.md#원문'] },
    problem: { claims: ['  첫 번째 주장을 보존한다.  ', '둘째 주장\n추가 관찰'], impact: '검색 결과가 누락될 수 있다.' },
    relations: [{ type: 'follow_up_to', target: 'PL-0007' }] };
  delete input.objective;
  const file = path.join(f.project, 'brief.json');
  fs.writeFileSync(file, JSON.stringify(input));
  const result = f.run(['create', '--input-format', 'brief', '--input', file]);
  assert.equal(result.status, 0, result.stderr);
  const saved = f.read('PL-0008');
  assert.deepEqual(saved.origin, input.origin);
  assert.equal(saved.identity.type, type);
  assert.equal(saved.state.current_summary, input.current_summary);
  assert.equal(saved.problem.impact, input.problem.impact);
  assert.deepEqual(saved.problem.claims, [
    { id: 'P1', state: 'reported', text: input.problem.claims[0], evidence_refs: [] },
    { id: 'P2', state: 'reported', text: input.problem.claims[1], evidence_refs: [] },
  ]);
  assert.deepEqual(saved.relations, input.relations);
  assert.deepEqual(saved.evidence, []);
  assert.equal(saved.objective, undefined);
  assert.equal(f.run(['validate']).status, 0);
});

test('one brief stdin update links work, generates evidence metadata, changes only selected claims, and resolves', t => {
  const f = fixture(t, initialIssue());
  const work = [f.work(1),f.work(2,['PL-0001'],'spec')];
  const before = Date.now();
  const added = observation({ targets: ['PL-0001/C1', 'PL-0001#P2'], claims: [{ id: 'P1', state: 'confirmed' }] });
  const result = f.update({ current_summary: '계약과 검증 결과를 기록했다.', work, evidence: [added], status: 'resolved' });
  assert.equal(result.status, 0, result.stderr);
  const saved = f.read();
  assert.deepEqual(saved.context, [{ kind: 'Design', location: work[0].location },{ kind: 'Spec', location: work[1].location }]);
  assert.equal(saved.evidence.length, 1);
  const item = saved.evidence[0];
  assert.match(item.id, /^E\d+$/);
  assert.deepEqual({ kind: item.kind, location: item.location, observation: item.observation }, observation());
  assert.ok(Date.parse(item.observed_at) >= before && Date.parse(item.observed_at) <= Date.now());
  assert.deepEqual(saved.problem.claims.map(({ id, state, evidence_refs }) => ({ id, state, evidence_refs })), [
    { id: 'P1', state: 'confirmed', evidence_refs: [item.id] },
    { id: 'P2', state: 'reported', evidence_refs: [item.id] },
  ]);
  assert.deepEqual(saved.criteria[0].evidence_refs, [item.id]);
  assert.deepEqual(saved.state, { status: 'resolved', current_summary: '계약과 검증 결과를 기록했다.' });
  assert.deepEqual(saved.events.map(({ from, to }) => ({ from, to })), [{ from: 'open', to: 'resolved' }]);
  assert.equal(f.run(['validate']).status, 0);
});

test('an evidence target qualified by another Issue cannot change the current Issue', t => {
  const f=fixture(t, initialIssue()),before=fs.readFileSync(f.file);
  const r=f.update({current_summary:'검증 결과를 연결한다.',evidence:[observation({targets:['PL-0002/C1']})]});
  assert.notEqual(r.status,0);assert.match(r.stderr,/PL-0002\/C1/);
  assert.deepEqual(fs.readFileSync(f.file),before);
});

test('a missing backlink rejects the entire canonical batch without saving its earlier operations', t => {
  const f=fixture(t,initialIssue()),before=fs.readFileSync(f.file);
  const operation={type:'batch',current_summary:'관련 문서와 검증 결과를 기록한다.',updated_at:timestamp,operations:[
    {type:'link_work',work:f.work(1)},
    {type:'add_evidence',evidence:{id:'E1',...observation(),observed_at:timestamp},targets:['C1']},
    {type:'link_work',work:f.work(2,[])},
    {type:'set_state',status:'doing',next_action:'계약을 구현한다.'}
  ]};
  const rejected=f.run(['update','PL-0001','--operation','-'],operation);
  assert.equal(rejected.status,1);
  assert.match(rejected.stderr,/related_issues|역링크/);
  assert.deepEqual(fs.readFileSync(f.file),before);
});

test('recognized legacy Issues block guarded publication even when the supplied current store is absent', t => {
  const f = fixture(t);
  const legacy = path.join(f.project, '.proofline/issues');
  fs.mkdirSync(legacy, { recursive: true });
  fs.writeFileSync(path.join(legacy, 'old.json'), JSON.stringify(canonical()));
  rejected(f.create(brief(), ['--if-empty']));
  const stores = [f.root, legacy].filter(directory => fs.existsSync(directory));
  assert.deepEqual(stores.flatMap(directory => fs.readdirSync(directory).filter(name => name.endsWith('.json'))), ['old.json']);
  assert.equal(fs.existsSync(getRegistryPath({ env: f.env })), false);
});

test('invalid recognized files never permit guarded publication', t => {
  const f = fixture(t);
  fs.mkdirSync(f.root, { recursive: true });
  fs.writeFileSync(path.join(f.root, 'invalid.json'), '{broken');
  const result = f.create(brief(), ['--if-empty']);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.deepEqual(f.files(), ['invalid.json']);
  assert.equal(fs.existsSync(getRegistryPath({ env: f.env })), false);
});

test('simultaneous guarded creates publish exactly one Issue under the existing create lock', async t => {
  const f = fixture(t);
  fs.mkdirSync(f.root, { recursive: true });
  const results = await Promise.all([f.createAsync(brief('첫 번째 요청'), ['--if-empty']), f.createAsync(brief('두 번째 요청'), ['--if-empty'])]);
  assert.equal(results.filter(result => result.status === 0).length, 1, JSON.stringify(results));
  rejected(results.find(result => result.status !== 0));
  assert.deepEqual(f.files(), ['PL-0001.json']);
  const saved = JSON.parse(fs.readFileSync(path.join(f.root, 'PL-0001.json'), 'utf8'));
  assert.ok(['첫 번째 요청', '두 번째 요청'].includes(saved.identity.title));
});
