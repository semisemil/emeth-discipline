#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const S = require('./storage.js');
const W = require('./workflow.js');
const R = require('./record.js');
const M = require('./memory.js');
const { parseManifest } = require('../../../dashboard/architecture.js');

const TITLES = {
  en: { index: 'Architecture', 'system-context': 'System context', containers: 'Containers', context: 'Project context',
    'decision-index': 'Architecture decisions', 'component-index': 'Components', decision: 'Decision record', container: 'Container', reason: 'Responsibility boundary' },
  ko: { index: '아키텍처', 'system-context': '시스템 맥락', containers: '컨테이너', context: '프로젝트 맥락',
    'decision-index': '아키텍처 결정', 'component-index': '컴포넌트', decision: '결정 기록', container: '컨테이너', reason: '책임 경계' },
};
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function invalid(message) { S.fail('memory-author-invalid', message); }
function title(value) {
  if (typeof value !== 'string' || !value.trim() || /[\r\n\x00-\x1f]/.test(value)) invalid('Use a nonempty single-line title.');
  return value.trim();
}
function body(value) {
  if (typeof value !== 'string' || !value.trim()) invalid('Supply nonempty Markdown body.');
  return value.trim();
}
function label(value) { return value.replace(/[\\[\]|]/g, '\\$&'); }
function link(from, to, text) { return `[${label(text)}](${path.posix.relative(path.posix.dirname(from), to)})`; }
function fresh(prefix) { return `${prefix}-${randomUUID()}`; }
function corpus(state, sources) {
  return M.recordsFromSources(state, new Map([...sources].map(([file, text]) => [file, text ?? ''])));
}

// Plans contain the same patches used by ordinary recording. Both publication paths
// validate the complete plan before writing any document.
function plan(state, sources, command, input) {
  if (!object(input)) invalid('Supply a JSON object.');
  const initial = corpus(state, sources);
  const language = state.manifest.language.split('-')[0];
  const words = TITLES[language] || TITLES.en;
  const documents = [...state.manifest.documents];
  const patches = new Map();
  const result = { documents: [], ids: [] };
  function owner(record) {
    return documents.find(doc => path.relative(state.projectRoot, path.join(state.architectureRoot, doc.path)).split(path.sep).join('/') === record.path);
  }
  function select(selector) {
    const exact = documents.find(doc => doc.id === selector);
    if (exact) return exact;
    const matches = documents.filter(doc => doc.kind === selector);
    if (matches.length !== 1) invalid(`Select a unique document ID or kind: ${selector}`);
    return matches[0];
  }
  function patchFor(doc) {
    if (!patches.has(doc.id)) patches.set(doc.id, { document: doc.id, path: doc.path, kind: doc.kind, edits: [] });
    return patches.get(doc.id);
  }
  function introduction(doc, text) {
    const before = sources.get(doc.path) ?? null;
    const parsed = M.sections(before || '');
    const intro = before === null ? null : parsed.intro || (parsed.sections.length === 1 && !/^## /u.test(parsed.sections[0].text) ? before.trim() : '');
    patchFor(doc).intro = { before: intro, after: text.trim() };
  }
  function create(kind, heading, file, id) {
    id ||= fresh(kind);
    file ||= `${kind}/${id}.md`;
    if (documents.some(doc => doc.id === id || doc.path.toLowerCase() === file.toLowerCase())) invalid(`Document already exists: ${file}`);
    if (fs.existsSync(S.safePath(state.architectureRoot, file))) S.fail('memory-target-exists', `Preserve unregistered file: ${file}`);
    const doc = { id, kind, path: file };
    documents.push(doc);
    introduction(doc, `# ${title(heading)}`);
    result.documents.push({ id, kind, path: file });
    return doc;
  }
  function ensure(kind) {
    const matches = documents.filter(doc => doc.kind === kind);
    if (matches.length > 1) invalid(`Multiple ${kind} documents; select a canonical index first.`);
    if (matches.length) {
      const doc = matches[0];
      if (sources.get(doc.path) === null) introduction(doc, `# ${words[kind] || kind}`);
      return doc;
    }
    const fixed = W.BASE.find(([, value]) => value === kind);
    return create(kind, words[kind] || kind, fixed?.[2] || 'components/README.md', fixed?.[0] || 'component-index');
  }
  function section(doc, value, extra = '') {
    if (!object(value)) invalid('Each section must be an object.');
    if (doc.kind === 'decision' && /^- (?:Status|상태): (?:accepted|deprecated|superseded)\s*$/m.test(M.sections(sources.get(doc.path) || '').intro)) invalid('Preserve accepted ADR bodies; create a superseding decision.');
    const old = value.id ? initial.byId.get(value.id) : null;
    if (value.id && (!old || owner(old)?.id !== doc.id || value.expected !== M.receiptFor(old))) {
      S.fail('memory-record-changed', `Read the current section before editing: ${value.id}`);
    }
    if (old && !/^## /u.test(old.text)) invalid('Add a section beneath the document preamble instead of replacing it.');
    const id = old?.stable ? old.id : fresh('AM');
    const metadata = { id };
    for (const key of ['paths', 'terms', 'links', 'always']) {
      const v = value[key] ?? old?.[key];
      if (v !== undefined && (key === 'always' ? typeof v !== 'boolean' : !Array.isArray(v) || v.some(item => typeof item !== 'string'))) invalid(`Invalid ${key}.`);
      if (v !== undefined && (key === 'always' ? v : v.length)) metadata[key] = v;
    }
    if (!['confirmed', 'inferred', 'proposed', 'unknown'].includes(value.confidence)
        || !['current', 'planned', 'historical'].includes(value.lifecycle)) invalid('Supply confidence and lifecycle for each section.');
    const text = `## ${title(value.title || old?.title)}\n<!-- am: ${JSON.stringify(metadata)} -->\n\n**${value.confidence}/${value.lifecycle}**\n\n${body(value.body)}${extra}\n`;
    patchFor(doc).edits.push({ id: old?.id || id, ...(old && !old.stable ? { replacement_id: id } : {}), expected: old ? value.expected : null, text });
    result.ids.push(id);
    return id;
  }
  function indexEntry(index, doc, heading, details = '') {
    const id = 'AM-index-' + createHash('sha256').update(doc.id).digest('hex').slice(0, 24);
    const old = initial.byId.get(id);
    const target = `](${path.posix.relative(path.posix.dirname(index.path), doc.path)})`;
    if (!old && (sources.get(index.path) || '').includes(target)) {
      if (details) {
        const original = sources.get(index.path);
        const matching = original.split('\n').filter(line => line.includes(target));
        if (matching.length !== 1) invalid(`Ambiguous index entry: ${doc.id}`);
        const line = matching[0];
        const cells = line.split('|');
        const status = cells.map((cell, i) => /^(accepted|proposed|deprecated|superseded)$/.test(cell.trim()) ? i : -1).filter(i => i >= 0);
        let replacement;
        if (status.length === 1) {
          cells[status[0]] = cells[status[0]].replace(/accepted|proposed|deprecated|superseded/, details);
          replacement = cells.join('|');
        } else if (!status.length && !line.trim().startsWith('|')) replacement = line + ` — ${details}`;
        else invalid(`Cannot identify the index status field: ${doc.id}`);
        const parsed = M.sections(original);
        if (parsed.intro.includes(line) || parsed.sections.length === 1 && !/^## /u.test(parsed.sections[0].text)) {
          introduction(index, (parsed.intro || original.trim()).replace(line, replacement));
        } else {
          const record = initial.records.find(record => owner(record)?.id === index.id && record.text.split('\n').includes(line));
          if (!record) invalid(`Cannot identify index section: ${doc.id}`);
          const replacementId = record.stable ? record.id : fresh('AM');
          let text = record.text.replace(line, replacement);
          if (!record.stable) text = text.replace(/^(## [^\n]*\n)/, `$1<!-- am: ${JSON.stringify({ id: replacementId })} -->\n`);
          patchFor(index).edits.push({ id: record.id, expected: M.receiptFor(record), text,
            ...(!record.stable ? { replacement_id: replacementId } : {}) });
        }
      }
      return;
    }
    const text = `## ${title(heading)}\n<!-- am: ${JSON.stringify({ id })} -->\n\n${link(index.path, doc.path, heading)}${details ? ` — ${details}` : ''}\n`;
    const edits = patchFor(index).edits;
    const edit = { id, expected: old ? M.receiptFor(old) : null, text };
    const pending = edits.findIndex(item => item.id === id);
    if (pending < 0) edits.push(edit); else edits[pending] = edit;
  }
  function addSections(doc, values = []) {
    if (!Array.isArray(values)) invalid('sections must be an array.');
    for (const value of values) section(doc, value);
  }
  function decisionNumber() {
    const texts = [...documents.flatMap(doc => [doc.id, doc.path]), ...[...sources.values()].filter(Boolean)];
    const directory = S.safePath(state.architectureRoot, 'decisions');
    if (fs.existsSync(directory)) texts.push(...fs.readdirSync(directory));
    let last = 0;
    for (const text of texts) for (const match of text.matchAll(/ADR-(\d+)/g)) last = Math.max(last, Number(match[1]));
    if (!Number.isSafeInteger(last + 1)) invalid('ADR sequence exhausted.');
    return 'ADR-' + String(last + 1).padStart(4, '0');
  }
  if (command === 'scaffold') {
    for (const [, kind] of W.BASE) ensure(kind);
    const index = select('index');
    for (const doc of documents.filter(doc => doc.id !== index.id && W.BASE.some(([, kind]) => kind === doc.kind))) {
      indexEntry(index, doc, words[doc.kind] || doc.kind);
    }
    // An empty decision index records the collection's actual inventory.
    const indexDoc = select('decision-index');
    if (!documents.some(doc => doc.kind === 'decision') && !sources.get(indexDoc.path)?.trim()) {
      introduction(indexDoc, `# ${words['decision-index']}\n\n| ADR | Status |\n|---|---|`);
    }
  } else if (command === 'section') {
    section(select(input.document), input);
  } else if (command === 'document') {
    if (!['context', 'system-context', 'containers'].includes(input.kind)) invalid('Use document for context, system-context or containers.');
    const doc = create(input.kind, input.title);
    addSections(doc, input.sections);
    indexEntry(ensure('index'), doc, input.title);
  } else if (command === 'component') {
    if (!/^CNT-\d+$/.test(input.container || '') || !documents.some(doc => doc.kind === 'containers'
      && new RegExp(`\\b${input.container}\\b`).test(sources.get(doc.path) || ''))) invalid('Select an existing CNT ID from the containers document.');
    const doc = create('component', input.title, `components/${input.container}.md`);
    introduction(doc, `# ${title(input.title)}\n\n${words.container}: ${input.container}\n${words.reason}: ${title(input.reason)}`);
    addSections(doc, input.sections);
    const index = ensure('component-index');
    indexEntry(index, doc, input.title, `${input.container}: ${input.reason}`);
    indexEntry(ensure('index'), index, words['component-index']);
  } else if (command === 'decision') {
    if (!['accepted', 'proposed'].includes(input.status)) invalid('A new decision status must be accepted or proposed.');
    const date = input.date || 'unknown';
    if (date !== 'unknown' && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) invalid('Use YYYY-MM-DD or unknown for the decision date.');
    if (!object(input.current) || !input.current.id) invalid('Supply the affected current section and its receipt.');
    const current = initial.byId.get(input.current.id);
    if (!current || ['decision', 'decision-index', 'index', 'component-index'].includes(current.kind)) invalid('Select a current architecture section.');
    if (!['current', 'planned'].includes(input.current.lifecycle)) invalid('A current decision effect needs current or planned lifecycle.');
    const currentDoc = owner(current);
    const index = ensure('decision-index');
    const id = decisionNumber();
    const doc = create('decision', input.title, `decisions/${id}.md`, id);
    introduction(doc, `# ${id}: ${title(input.title)}\n\n- Status: ${input.status}\n- Decision date: ${date}\n- Supersedes: ${input.supersedes || 'none'}\n- Superseded by: none\n- Current document: ${link(doc.path, currentDoc.path, current.title)}`);
    section(doc, { title: words.decision, body: input.body, confidence: input.status === 'accepted' ? 'confirmed' : 'proposed',
      lifecycle: input.status === 'accepted' ? 'historical' : 'planned', paths: input.paths });
    section(currentDoc, input.current, `\n\n${link(currentDoc.path, doc.path, id)}`);
    indexEntry(index, doc, `${id}: ${input.title}`, input.status);
    indexEntry(ensure('index'), index, words['decision-index']);
    if (input.supersedes) {
      if (input.status !== 'accepted') invalid('Only an accepted decision can supersede another decision.');
      const old = select(input.supersedes);
      if (old.kind !== 'decision') invalid('supersedes must identify an ADR.');
      const text = sources.get(old.path) || '';
      const intro = M.sections(text).intro;
      if (!/^- (?:Status|상태): (?:accepted|deprecated)\s*$/m.test(intro)
        || !/^- (?:Superseded by|대체한 결정|후속 결정): none\s*$/m.test(intro)) invalid('The previous ADR needs an accepted/deprecated status and an empty Superseded by field.');
      introduction(old, intro.replace(/^(- (?:Status|상태): )(?:accepted|deprecated)\s*$/m, '$1superseded')
        .replace(/^(- (?:Superseded by|대체한 결정|후속 결정): )none\s*$/m, `$1${id}`));
      indexEntry(index, old, text.split('\n')[0].replace(/^# /, ''), 'superseded');
    }
  } else invalid(`Unknown authoring command: ${command}`);
  return { payload: { documents: [...patches.values()].filter(item => item.intro || item.edits.length) }, result };
}

function run(project, command, input = {}, options = {}) {
  project = fs.realpathSync(project);
  const found = W.locate(project, options.root);
  if (!fs.existsSync(found.directory)) S.fail('memory-not-initialized', 'Run workflow.js init or record.js ensure first.');
  return S.exclusive(found.directory, () => {
    const pending = fs.existsSync(S.safePath(found.directory, `${S.WORK}/state.json`)) ? W.loadState(found.directory) : null;
    if (pending?.phase === 'applying') S.fail('memory-work-pending', 'Resume workflow.js apply first.');
    const draft = pending?.phase === 'draft';
    if (S.binding(project)?.enabled === false || (!draft && (!S.binding(project) || !found.existing?.manifest.managed))) S.fail('memory-disabled', 'Memory is not connected or is disabled.');
    const directory = draft ? W.draftDirectory(found.directory) : found.directory;
    const journal = S.safePath(directory, `${S.WORK}/record.json`);
    if (command === 'recover') {
      const saved = S.jsonFile(journal, 128 * 1024 * 1024);
      if (!saved) return { status: 'no-op', target: draft ? 'draft' : 'live' };
      R.publish(directory, []);
      return { status: 'resumed', target: draft ? 'draft' : 'live', paths: saved.entries.filter(entry => entry.path !== W.MANIFEST).map(entry => entry.path) };
    }
    if (fs.existsSync(journal)) S.fail('memory-record-pending', 'Resume author.js recover before authoring.');
    const manifestText = S.textFile(S.safePath(directory, W.MANIFEST), 256 * 1024);
    const manifest = parseManifest(manifestText);
    const state = { projectRoot: project, architectureRoot: directory, manifest };
    const sources = new Map(manifest.documents.map(doc => [doc.path, S.textFile(S.safePath(directory, doc.path))]));
    if (!draft && [...sources.values()].some(text => text === null)) S.fail('memory-document-missing', 'A registered document is missing.');
    if (command === 'read') return { target: draft ? 'draft' : 'live', ...M.read(corpus(state, sources), input) };
    const planned = plan(state, sources, command, input);
    if (!planned.payload.documents.length) return { status: 'no-op', target: draft ? 'draft' : 'live', ...planned.result };
    const prepared = R.preparePatch(state, sources, {}, planned.payload);
    const changed = R.publish(directory, [...prepared.entries,
      { path: W.MANIFEST, before: S.hash(manifestText), after: JSON.stringify(state.manifest, null, 2) + '\n' }]);
    return { status: changed ? 'updated' : 'no-op', target: draft ? 'draft' : 'live', ...planned.result };
  });
}
function main() {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (!['scaffold', 'document', 'component', 'decision', 'section', 'read', 'recover'].includes(command)) invalid('Commands: scaffold, document, component, decision, section, read, recover.');
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i].replace(/^--/, '');
      if (args[i] !== `--${key}` || !['project-root', 'root'].includes(key) || options[key] !== undefined || !args[i + 1]) invalid('Use --project-root and optional --root.');
      options[key] = args[i + 1];
    }
    const input = ['scaffold', 'recover'].includes(command) ? {} : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(0)));
    process.stdout.write(JSON.stringify(run(options['project-root'], command, input, options)) + '\n');
  } catch (error) {
    process.stderr.write(JSON.stringify({ error: { code: error.code || 'memory-author-failed', message: error.message } }) + '\n');
    process.exitCode = 1;
  }
}
if (require.main === module) main();
module.exports = { run, plan };
