'use strict';

const path = require('node:path');

function validateDocumentPaths(paths) {
  if (!Array.isArray(paths) || paths.some(value => typeof value !== 'string'
      || !value.endsWith('.md') || /[\x00-\x1f<>:"\\|?*]/.test(value)
      || value.split('/').some(part => !part || part === '.' || part === '..'
        || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
      || path.posix.normalize(value) !== value || path.posix.isAbsolute(value)
      || value.toLowerCase() === 'design.md' || value.split('/')[0].toLowerCase() === 'revisions')
      || new Set(paths.map(value => value.toLowerCase())).size !== paths.length) {
    throw Object.assign(new Error('Supply unique Markdown paths inside the Design directory, excluding DESIGN.md and revisions'), { code: 'design-document-path-invalid' });
  }
  return paths;
}

function readDesignDocuments(root, record) {
  const { readSecureRecord, parseFrontmatter, parseDesignMetadata } = require('../dashboard/records/record-parser.js');
  const directory = path.dirname(record.source.filePath);
  assertDocumentSetAvailable(record.source.filePath);
  const readOverview = () => readSecureRecord(record.source.filePath, { root, directory }).content;
  const overview = readOverview();
  const current = parseFrontmatter(overview);
  if (current.body !== record.body || JSON.stringify(parseDesignMetadata(current.metadataText)) !== JSON.stringify(record.metadata)) {
    throw Object.assign(new Error('Design changed while reading its document set'), { code: 'document-changed' });
  }
  const documents = (record.metadata.documents || []).map(name => {
    const file = path.join(directory, ...name.split('/'));
    const { content } = readSecureRecord(file, { root, directory });
    return { path: path.relative(root, file).split(path.sep).join('/'), body: content };
  });
  assertDocumentSetAvailable(record.source.filePath);
  if (readOverview() !== overview) {
    throw Object.assign(new Error('Design changed while reading its document set'), { code: 'document-changed' });
  }
  return documents;
}

function assertDocumentSetAvailable(file) {
  const fs = require('node:fs');
  if (fs.existsSync(path.join(path.dirname(file), '.design-set-pending.json'))) {
    throw Object.assign(new Error('Design document-set publication needs recovery'), { code: 'design-document-set-pending' });
  }
}

module.exports = { validateDocumentPaths, readDesignDocuments, assertDocumentSetAvailable };
