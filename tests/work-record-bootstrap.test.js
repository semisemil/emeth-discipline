'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const plugin = path.resolve(__dirname, '../plugins/emeth-discipline');
const hook = path.join(plugin, 'hooks/work-records.js');

function fixture(t, enabled = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-record-bootstrap-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 10 }));
  const project = path.join(root, 'project');
  fs.mkdirSync(project);
  const env = { ...process.env, HOME: root, USERPROFILE: root, CODEX_HOME: path.join(root, 'codex'),
    APPDATA: path.join(root, 'config'), XDG_CONFIG_HOME: path.join(root, 'xdg'),
    PLUGIN_ROOT: plugin, PLUGIN_DATA: path.join(root, 'plugin-data'),
    CLAUDE_PLUGIN_ROOT: '', CLAUDE_PLUGIN_DATA: '' };
  function write(name, text = '') {
    const target = path.join(project, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
  function run(event = {}, extraEnv = {}, preload) {
    return spawnSync(process.execPath, [...(preload ? ['--require',preload] : []),hook], { encoding: 'utf8', windowsHide: true,
      env: { ...env, ...extraEnv }, input: JSON.stringify({ cwd: project,
        session_id: 'public-bootstrap', hook_event_name: 'SessionStart', source: 'startup', ...event }) });
  }
  if (enabled) write('.emeth/work-records.json', '{"schema_version":1,"enabled":true}');
  function control(...args) {
    return spawnSync(process.execPath, [path.join(plugin, 'dashboard/control.js'), ...args], {
      cwd: project, env, encoding: 'utf8', windowsHide: true,
    });
  }
  const claude = (event = {}, extraEnv = {}) => run(event, { PLUGIN_ROOT:'', PLUGIN_DATA:'', CLAUDE_PLUGIN_ROOT:plugin, ...extraEnv });
  return { root, project, write, run, control, claude };
}

function output(result) {
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout) : {};
}

function context(result, state) {
  const response = output(result);
  assert.equal(response.hookSpecificOutput?.hookEventName, 'SessionStart');
  const text = response.hookSpecificOutput.additionalContext;
  assert.equal(typeof text,'string');
  if (!text.includes('--format codex-text')) {
    assert.match(text, new RegExp('Issue store:\\s*' + state + '\\b', 'i'));
  }
  return text;
}

function tree(root) {
  const result = {};
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      result[path.relative(root, file)] = entry.isDirectory() ? 'directory' : fs.readFileSync(file).toString('base64');
      if (entry.isDirectory()) visit(file);
    }
  }
  visit(root);
  return result;
}

test('default-disabled records perform no Issue or Design discovery or reads', t => {
  const f = fixture(t, false);
  f.write('.emeth/issues/PL-0001.json','DO_NOT_READ');
  f.write('.emeth/designs/DESIGN-0001-contract/DESIGN.md','DO_NOT_READ');
  const trace=path.join(f.root,'record-access.txt'),guard=path.join(f.root,'record-access.cjs');
  const blocked=['.emeth/issues','.emeth/designs','.proofline/issues','.proofline/designs'].map(p=>path.join(f.project,p));
  fs.writeFileSync(guard,"const fs=require('node:fs'),path=require('node:path');const roots="+JSON.stringify(blocked)+";for(const name of ['existsSync','statSync','lstatSync','readdirSync','readFileSync']){const original=fs[name];fs[name]=function(file,...args){if(typeof file==='string'&&roots.some(root=>path.resolve(file)===root||path.resolve(file).startsWith(root+path.sep))){fs.appendFileSync("+JSON.stringify(trace)+",name+' '+file+'\\n');throw Error('Unexpected record access');}return original.call(this,file,...args);};}");
  const before = tree(f.root);
  assert.deepEqual(output(f.run({}, {}, guard)), {});
  assert.equal(fs.existsSync(trace),false,'OFF must not inspect the record stores');
  assert.deepEqual(tree(f.root), before);
});

test('a fresh opted-in project is active from subdirectories but a nested repository does not inherit it', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.project, 'src'));
  assert.ok(context(f.run({cwd:path.join(f.project,'src')}), 'absent').replaceAll('\\','/').includes(f.project.replaceAll('\\','/')));
  fs.mkdirSync(path.join(f.project, 'src/.git'));
  assert.deepEqual(output(f.run({cwd:path.join(f.project,'src')})), {});
});

test('dashboard commands report and toggle global automatic records through the real session hook', t => {
  const f = fixture(t, false);
  const before = tree(f.root);
  const initial = output(f.control('work-records', 'status'));
  assert.equal(initial.scope, 'global');
  assert.equal(initial.enabled, false);
  assert.equal(initial.configured, false);
  assert.deepEqual(tree(f.root), before, 'Reading status creates no state');
  assert.deepEqual(output(f.run()), {});

  const enabled = output(f.control('work-records', 'on'));
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.configured, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(enabled.path, 'utf8')), {schema_version:1, enabled:true});
  assert.equal(output(f.control('work-records', 'status')).enabled, true);
  context(f.run(), 'absent');
  const other=path.join(f.root,'other-project');fs.mkdirSync(other);
  assert.ok(context(f.run({cwd:other}),'absent').replaceAll('\\','/').includes(other.replaceAll('\\','/')));
  assert.deepEqual(fs.readdirSync(other),[]);
  assert.deepEqual(fs.readdirSync(f.project), [], 'Enabling global records creates no project state');
  assert.deepEqual(fs.readdirSync(path.dirname(enabled.path)), ['work-records.json'], 'No server, registry or inbox state');

  f.write('.emeth/work-records.json', '{"schema_version":1,"enabled":false}');
  const local = fs.readFileSync(path.join(f.project, '.emeth/work-records.json'));
  assert.equal(output(f.control('work-records', 'on')).enabled, true);
  assert.deepEqual(output(f.run()), {}, 'A project can opt out of the enabled global default');
  assert.deepEqual(fs.readFileSync(path.join(f.project, '.emeth/work-records.json')), local);
  fs.unlinkSync(path.join(f.project, '.emeth/work-records.json'));

  assert.equal(output(f.control('work-records', 'off')).enabled, false);
  assert.equal(output(f.control('work-records', 'status')).enabled, false);
  assert.deepEqual(output(f.run()), {});
  f.write('.emeth/work-records.json', '{"schema_version":1,"enabled":true}');
  context(f.run(), 'absent');
});

test('an invalid project setting does not inherit global enable, while a valid project does not read global errors', t => {
  const f = fixture(t, false);
  const globalFile = path.join(f.root, 'config/emeth/work-records.json');
  fs.mkdirSync(path.dirname(globalFile), {recursive:true});
  fs.writeFileSync(globalFile, '{"schema_version":1,"enabled":true}');
  f.write('.emeth/work-records.json', '{"schema_version":1,"enabled":"false"}');
  f.write('.emeth/issues/PL-0001.json', 'Existing Issue');
  const before = tree(f.root);
  const invalid = f.run();
  assert.deepEqual(output(invalid), {});
  assert.match(invalid.stderr, /disabled/);
  assert.deepEqual(tree(f.root), before);
  fs.writeFileSync(globalFile, 'broken JSON');
  f.write('.emeth/work-records.json', '{"schema_version":1,"enabled":true}');
  const local = f.run();
  context(local, 'absent');
  assert.equal(local.stderr, '');
});

test('CLI host Issue snapshots distinguish empty from recognized files without parsing bodies', t => {
  const f = fixture(t);
  f.write('.emeth/issues/template.example.json', 'not JSON');
  f.write('.emeth/issues/template.example.md', 'not Markdown');
  f.write('.emeth/issues/notes.txt', 'not an Issue');
  context(f.claude(), 'empty');
  f.write('.emeth/issues/arbitrary-name.md', 'not a valid Issue');
  const denied = path.join(f.project, '.emeth/issues/arbitrary-name.md');
  f.write('deny-body.cjs', `const fs = require('node:fs'); const read = fs.readFileSync;
    fs.readFileSync = (file, ...args) => {
      if (String(file) === ${JSON.stringify(denied)}) throw new Error('Issue bodies must not be read');
      return read(file, ...args);
    };`);
  const before = tree(f.root);
  context(f.claude({}, { NODE_OPTIONS: '--require ' + JSON.stringify(path.join(f.project, 'deny-body.cjs')) }), 'present');
  assert.deepEqual(tree(f.root), before);
});

test('legacy Issues cannot become an empty snapshot and the hook does not migrate their storage', t => {
  const f = fixture(t);
  f.write('.proofline/issues/old.md', 'legacy body with .proofline/designs/example.md');
  f.write('.emeth/issues/template.example.json', '{}');
  const before = tree(f.root);
  const text = output(f.claude()).hookSpecificOutput?.additionalContext;
  assert.ok(text, 'Legacy Issue storage enables the guide');
  assert.match(text, /Issue store:\s*(?:present|unavailable)\b/i);
  assert.deepEqual(tree(f.root), before);
});
