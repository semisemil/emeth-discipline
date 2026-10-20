'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const test = require('node:test');
const mapping = require('./fixtures/pstack-import.json');

const plugin = path.resolve(__dirname, '../plugins/emeth-discipline');
const read = (root, relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('relocated package exposes the imported workflow and its complete local reference graph', t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-pstack-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 10 }));
  const installed = path.join(temporary, 'installed');
  fs.cpSync(plugin, installed, { recursive: true });
  assert.ok(fs.existsSync(path.join(installed, 'references/pstack/guidance/boundary-discipline.md')));
  assert.equal(fs.existsSync(path.join(installed, 'references/pstack/principles')), false);
  assert.ok(fs.readdirSync(path.join(installed, 'references/pstack/guidance')).every(name => !name.startsWith('principle-')));
  const seen = new Set();
  const owned = new Set([...mapping.files.map(file => file.target), ...mapping.supplements]);
  for (const name of ['start-implementation', 'ensemble', 'code-exploration']) owned.add(`skills/${name}/SKILL.md`);
  owned.add('references/pstack/model-routing.md');
  function follow(relative) {
    const file = path.resolve(installed, relative);
    assert.ok(file.startsWith(installed + path.sep), `Reference escaped package: ${relative}`);
    assert.ok(fs.statSync(file).isFile(), relative);
    if (seen.has(file) || !file.endsWith('.md')) return;
    seen.add(file);
    if (!owned.has(path.relative(installed, file).replaceAll('\\', '/'))) return;
    const content = read(installed, relative);
    const prose = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
    for (const [, destination] of prose.matchAll(/\]\(([^\s)]+)\)/g)) {
      if (/^(?:https?:|#|mailto:)/.test(destination)) continue;
      if (!/\.(?:md|tsv|sh|js|json|yaml|txt)(?:#|$)/.test(destination)) continue;
      const target = path.resolve(path.dirname(file), destination.split('#')[0]);
      follow(path.relative(installed, target));
    }
    for (const [, destination] of content.matchAll(/`([^`\s]+\.(?:md|tsv|sh))`/g)) {
      const target = destination.startsWith('<plugin-root>/')
        ? path.resolve(installed, destination.slice('<plugin-root>/'.length))
        : path.resolve(path.dirname(file), destination);
      const resource = path.relative(installed, target).replaceAll('\\', '/');
      if (owned.has(resource)) follow(resource);
    }
  }
  for (const entry of ['start-implementation', 'ensemble', 'code-exploration']) follow(`skills/${entry}/SKILL.md`);
  for (const file of mapping.files.filter(file => file.target.endsWith('.md') && file.target !== 'THIRD_PARTY_NOTICES.md')) {
    assert.ok(seen.has(path.join(installed, file.target)), `Unreachable imported instruction: ${file.target}`);
  }
  function checkOwnership(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) checkOwnership(file);
      else if (file.endsWith('.md')) {
        const relative = path.relative(installed, file).replaceAll('\\', '/');
        assert.ok(owned.has(relative), `Unmapped instruction file: ${relative}`);
      }
    }
  }
  for (const relative of ['references/pstack', 'skills/start-implementation', 'skills/ensemble', 'skills/code-exploration']) {
    checkOwnership(path.join(installed, relative));
  }
  for (const name of ['blueprint', 'impact-analysis', 'regression-test', 'challenge']) {
    assert.equal(fs.existsSync(path.join(installed, 'skills', name, 'SKILL.md')), false, name);
  }
});

test('the complete original MIT notice remains intact', () => {
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const notice = read(plugin, 'THIRD_PARTY_NOTICES.md');
  const license = notice.slice(notice.search(/^MIT License\r?$/m)).replace(/\r\n/g, '\n').trim() + '\n';
  assert.equal(hash(license), mapping.license_text_sha256);
});

test('unchanged upstream reference text retains the pinned source content', () => {
  for (const file of mapping.files.filter(file => file.unchanged_text_sha256)) {
    const normalized = read(plugin, file.target).replace(/\r\n/g, '\n');
    assert.equal(createHash('sha256').update(normalized).digest('hex'), file.unchanged_text_sha256, file.target);
  }
});

test('imported role prompts retain their provenance and public invocation metadata', () => {
  const prompts = mapping.files.filter(file => /prompt\.md$/.test(file.target));
  assert.equal(prompts.length, 7);
  assert.ok(prompts.some(file => file.source === 'agents/poteto-agent.md'));
  for (const name of ['ensemble', 'code-exploration']) {
    assert.match(read(plugin, `skills/${name}/SKILL.md`), /^disable-model-invocation: true$/m);
    assert.match(read(plugin, `skills/${name}/agents/openai.yaml`), /allow_implicit_invocation: false/);
  }
});

test('the original shared document is kept together and redundant fragment files are absent', () => {
  const grouped = new Map();
  for (const row of mapping.files) {
    assert.equal(grouped.has(row.source), false, `Split upstream document: ${row.source}`);
    grouped.set(row.source, row.target);
  }
  assert.equal(grouped.get('skills/poteto-mode/SKILL.md'), 'skills/start-implementation/SKILL.md');
  const main = read(plugin, 'skills/start-implementation/SKILL.md');
  let previous = -1;
  for (const title of ['Principles', 'Subagents', 'Harness', 'Comments', 'Playbooks']) {
    const position = main.indexOf(`## ${title}\n`);
    assert.ok(position > previous, title);
    previous = position;
  }
  for (const name of ['execution', 'guidance', 'delegation', 'work-context']) {
    assert.equal(fs.existsSync(path.join(plugin, 'references/pstack', `${name}.md`)), false, name);
  }
});

test('implementation entry no longer exposes a launcher or a separate Emeth review tier', () => {
  for (const file of ['implement.md', 'review.md', 'scripts/prepare-launch.js', 'references/codex.md', 'references/claude-code.md', 'references/mixdog.md']) {
    assert.equal(fs.existsSync(path.join(plugin, 'skills/start-implementation', file)), false, file);
  }
  const resources = mapping.files.filter(file => file.target.endsWith('.md')).map(file => file.target);
  resources.push('skills/start-implementation/SKILL.md');
  for (const file of resources) {
    assert.doesNotMatch(read(plugin, file), /\b(?:create_thread|prepare-launch|unslop|poteto-mode|pstack-models)\b/, file);
    assert.doesNotMatch(read(plugin, file), /\b(?:gh|origin)\s+pr\s+create\b|Run \*\*Opening a PR\*\*/, file);
  }
});
