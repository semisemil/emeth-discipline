// README의 추가 코드 검사 14항목. 모델별 None/Core/Workflow 제출물에 적용한다.
// SEED는 변경 전 소스와 esbuild 의존성을 갖춘 경로이며, OUTPUT에 검사 결과를 저장한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const single=process.argv[2]==='--single';
const [seedArg,noneArg,coreArg,workflowArg,outputArg] = single
  ? [process.argv[3],process.argv[4],process.argv[4],process.argv[4],process.argv[5]]
  : process.argv.slice(2);
if (!outputArg) throw new Error('Usage: node docs/benchmarks/superjson-probes.mjs SEED NONE CORE WORKFLOW OUTPUT\n   or: node docs/benchmarks/superjson-probes.mjs --single SEED SUBMISSION OUTPUT');
const seed=path.resolve(seedArg);
const root=path.resolve(outputArg);
const sourceRoots={none:path.resolve(noneArg),'core':path.resolve(coreArg),workflow:path.resolve(workflowArg),submission:path.resolve(noneArg)};
const require = createRequire(path.join(seed, 'package.json'));
const esbuild = require('esbuild');
const built = path.join(root, 'built');
fs.mkdirSync(built, {recursive:true});
const variants = {};
for (const name of single?['seed','submission']:['seed', 'none', 'core', 'workflow']) {
  const variantRoot = sourceRoots[name];
  const src = path.join(name === 'seed' ? seed : variantRoot, 'src');
  const outfile = path.join(built, name+'.mjs');
  await esbuild.build({entryPoints:[path.join(src,'index.ts')],outfile,bundle:true,platform:'node',format:'esm',target:'node22',nodePaths:[path.join(seed,'node_modules')],logLevel:'silent'});
  const api = await import(pathToFileURL(outfile));
  variants[name] = { SuperJSON: api.default };
  if (name !== 'seed') {
    const stackFile = path.join(built, name+'-stack.mjs');
    await esbuild.build({entryPoints:[path.join(src,'error-stack.ts')],outfile:stackFile,bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'silent'});
    Object.assign(variants[name], await import(pathToFileURL(stackFile)));
    const optionsFile = path.join(built, name+'-options.mjs');
    await esbuild.build({entryPoints:[path.join(src,'error-options.ts')],outfile:optionsFile,bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'silent'});
    const {normalizeErrorStackOptions} = await import(pathToFileURL(optionsFile));
    for (const key of ['processStackString','processStackFrames']) {
      const fn=variants[name][key];
      variants[name][key]=(stack,options)=>fn(stack,normalizeErrorStackOptions(options));
    }
  }
}
const cases = [];
function probe(id, contract, fn, baseline = false) { cases.push({id,contract,fn,baseline}); }
const round = (sj, value) => sj.parse(sj.stringify(value));
probe('basename-root', 'basename keeps only the filename for a root-level absolute path', ({processStackString:f}) => {
  const value=f('header\n at /app.ts:1:2',{redactPaths:'basename'});
  assert.equal(value,'header\nat app.ts:1:2'); return value;
});
probe('basename-relative', 'basename keeps only the filename for a relative path', ({processStackString:f}) => {
  const value=f('header\n at fn (src/app.ts:1:2)',{redactPaths:'basename'});
  assert.equal(value,'header\nat fn (app.ts:1:2)'); return value;
});
probe('basename-spaces', 'basename keeps only the filename when a directory contains spaces', ({processStackString:f}) => {
  const value=f('header\n at fn (/Users/Jane Doe/app.ts:1:2)',{redactPaths:'basename'});
  assert.equal(value,'header\nat fn (app.ts:1:2)'); return value;
});
probe('cwd-prefix-boundary', 'strip_cwd removes a path prefix, not a matching interior directory', ({processStackString:f}) => {
  const old=process.cwd;
  try {process.cwd=()=>'/repo';const value=f('header\n at /other/repo/app.ts:1:2',{redactPaths:'strip_cwd'});
    assert.equal(value,'header\nat /other/repo/app.ts:1:2');return value;
  } finally {process.cwd=old;}
});
probe('carriage-return-frames', 'frames represent each line even without newline normalization', ({processStackFrames:f}) => {
  const value=f('header\r  frame',{});
  assert.deepEqual(value,[{raw:'header'},{raw:'frame'}]);return value;
});
probe('legacy-receiver-allowances', 'omitting errorStack preserves legacy receiver property allowances', ({SuperJSON:S}) => {
  const sender=new S();sender.allowErrorProps('errors','stackFrames');
  const e=Object.assign(new Error('legacy'),{errors:[1],stackFrames:[{raw:'legacy'}]});
  const out=new S().deserialize(sender.serialize(e));
  assert.equal(out.errors,undefined);assert.equal(out.stackFrames,undefined);return {errors:out.errors??null,stackFrames:out.stackFrames??null};
},true);
probe('legacy-aggregate', 'omitting errorStack preserves the original AggregateError serialized fields', ({SuperJSON:S}) => {
  const value=new S().serialize(new AggregateError([1],'legacy')).json;
  assert.equal(Object.hasOwn(value,'errors'),false);return Object.keys(value);
},true);
probe('configured-allowed-errors', 'new stack options preserve explicitly allowed ordinary Error properties', ({SuperJSON:S}) => {
  const sj=new S({errorStack:{mode:'string'}});sj.allowErrorProps('errors');
  const out=round(sj,Object.assign(new Error('ordinary'),{errors:[1]}));
  assert.deepEqual(out.errors,[1]);return out.errors;
});
probe('registered-cause', 'a retained registered Error subclass preserves its class and fields', ({SuperJSON:S}) => {
  class CodedError extends Error { code=42; }
  const sj=new S({errorStack:{includeCauses:'direct'}});sj.registerClass(CodedError);
  const out=round(sj,new Error('root',{cause:new CodedError('child')}));
  assert.equal(out.cause instanceof CodedError,true);assert.equal(out.cause.code,42);return {classPreserved:true,code:out.cause.code};
},true);
probe('shared-cause-identity', 'the retained cause and standalone Error share identity when their views match', ({SuperJSON:S}) => {
  const sj=new S({errorStack:{includeCauses:'direct'}});const child=new Error('child');
  const out=round(sj,{root:new Error('root',{cause:child}),child});
  assert.equal(out.root.cause,out.child);return true;
},true);
probe('hook-object-cross-call', 'serializing an Error cause does not change subsequent plain-object serialization', ({SuperJSON:S}) => {
  const replacement={name:'ChildError',message:'replacement'};
  const sender=new S({errorStack:{includeCauses:'direct'}});
  sender.registerErrorStackProcessor('ChildError',()=>replacement);
  const child=new Error('child');child.name='ChildError';
  sender.serialize(new Error('root',{cause:child}));
  const out=round(new S(),replacement);
  assert.equal(out instanceof Error,false);assert.deepEqual(out,replacement);return {plainObject:true};
});
probe('box-shared-identity', 'diagnostic: an Error referenced both directly and in a registered container', ({SuperJSON:S}) => {
  class Box { constructor(value){this.value=value;} }
  const sj=new S();sj.registerClass(Box);const e=new Error('child');
  const out=round(sj,{e,box:new Box(e)});
  assert.equal(out.box.value,out.e);return true;
},true);
probe('registered-primitive-policy', 'sanitizeMessage applies to a retained custom Error serialization with string output', ({SuperJSON:S}) => {
  class CodedError extends Error {}
  const sj=new S({errorStack:{includeCauses:'direct',sanitizeMessage:true}});
  sj.registerCustom({isApplicable:v=>v instanceof CodedError,serialize:v=>v.message,
    deserialize:v=>new CodedError(v)},'coded-string');
  const out=round(sj,new Error('root',{cause:new CodedError('person@example.com')}));
  assert.equal(out.cause.message,'[redacted]');return out.cause.message;
});
// The task's "plain object" describes the serialization hook input, not the
// deserialized cause. Original and reference implementations preserve Error
// metadata across instances; no matching receiver configuration is required.
probe('cross-instance-cause-type', 'retained Error causes preserve their type through JSON transport to an unconfigured receiver', ({SuperJSON:S}) => {
  const observed={};
  for(const mode of ['off','string','frames']){
    const sender=new S({errorStack:{mode,includeCauses:'deep'}});
    const payload=JSON.parse(JSON.stringify(sender.serialize(new Error('root',{
      cause:new Error('child',{cause:new Error('grandchild')})
    }))));
    const restored=new S().deserialize(payload);
    observed[mode]={child:restored.cause instanceof Error,grandchild:restored.cause?.cause instanceof Error};
    assert.equal(observed[mode].child,true,`${mode}: immediate cause must restore as Error`);
    assert.equal(observed[mode].grandchild,true,`${mode}: nested cause must restore as Error`);
    assert.equal(restored.cause.message,'child');
    assert.equal(restored.cause.cause.message,'grandchild');
  }
  return observed;
},true);
const results=[];
for(const entry of cases){
  const row={id:entry.id,contract:entry.contract,variants:{}};
  for(const [name,api] of Object.entries(variants)){
    if(name==='seed'&&!entry.baseline)continue;
    try {row.variants[name]={passed:true,observed:entry.fn(api)};}
    catch(e){row.variants[name]={passed:false,error:e.message,actual:e.actual,expected:e.expected};}
  }
  results.push(row);
}
fs.writeFileSync(path.join(root,'probe-results.json'),JSON.stringify({model_calls:0,method:'Same targeted probes on esbuild bundles of immutable submitted sources; seed is the unchanged baseline where applicable; not a replacement benchmark score.',results},null,2)+'\n');
for(const r of results)console.log(JSON.stringify({id:r.id,...Object.fromEntries(Object.entries(r.variants).map(([k,v])=>[k,v.passed?'PASS':{error:v.error}]))}));
