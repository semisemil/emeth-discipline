#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const packageRoot = path.join(repoRoot, 'plugins', 'emeth-discipline');
const directories = ['assets', 'dashboard', 'hooks', 'lib', 'skills', 'writers'];
const files = ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json', 'LICENSE', 'README.md'];
const instructionFile = /^(AGENTS|CLAUDE|CONTEXT)\.md$/i;

function walk(root, prefix = '') {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Plugin files must not be symlinks: ${relative}`);
      return entry.isDirectory() ? walk(path.join(root, entry.name), relative) : [relative];
    });
}

function expectedFiles() {
  const selected = [...files, ...directories.flatMap(directory =>
    walk(path.join(repoRoot, directory), directory))];
  return new Map(selected.filter(relative => !instructionFile.test(path.posix.basename(relative)))
    .map(relative => {
      let content = fs.readFileSync(path.join(repoRoot, relative));
      if (relative === 'README.md') {
        content = Buffer.from(content.toString('utf8').replace(/\]\((docs\/[^)]+)\)/g,
          '](' + 'https://github.com/semisemil/emeth-discipline/blob/main/$1)'));
      }
      return [relative, content];
    }));
}

function assertPackageRoot() {
  // Check the absolute output and its existing parents before removing stale files.
  if (path.relative(repoRoot, packageRoot) !== path.join('plugins', 'emeth-discipline')) {
    throw new Error('Unexpected plugin output directory.');
  }
  for (const directory of [repoRoot, path.dirname(packageRoot), packageRoot]) {
    if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) {
      throw new Error(`Plugin output must not use symlinks: ${directory}`);
    }
  }
}

function build(checkOnly = false) {
  assertPackageRoot();
  const expected = expectedFiles();
  const actual = walk(packageRoot);
  const stale = actual.filter(relative => !expected.has(relative));
  const changed = [...expected].filter(([relative, content]) => {
    const target = path.join(packageRoot, relative);
    return !fs.existsSync(target) || !fs.readFileSync(target).equals(content);
  });
  if (checkOnly) {
    if (stale.length || changed.length) {
      throw new Error(`Plugin package is out of date. Run npm run build:plugin.\n${[
        ...stale.map(relative => `Unexpected: ${relative}`),
        ...changed.map(([relative]) => `Missing or changed: ${relative}`),
      ].join('\n')}`);
    }
  } else {
    for (const relative of stale) fs.unlinkSync(path.join(packageRoot, relative));
    // Remove empty stale directories so development directory names do not survive rebuilds.
    function pruneEmpty(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const child = path.join(directory, entry.name);
        pruneEmpty(child);
        if (fs.readdirSync(child).length === 0) fs.rmdirSync(child);
      }
    }
    if (fs.existsSync(packageRoot)) pruneEmpty(packageRoot);
    for (const [relative, content] of changed) {
      const target = path.join(packageRoot, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
  }
  return expected.size;
}

if (require.main === module) {
  try {
    if (process.argv.slice(2).some(argument => argument !== '--check')) throw new Error('Usage: build-plugin.js [--check]');
    const checkOnly = process.argv.includes('--check');
    console.log(`Plugin package ${checkOnly ? 'matches source' : 'built'}: ${build(checkOnly)} files`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
