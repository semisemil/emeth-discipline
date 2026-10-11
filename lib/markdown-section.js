'use strict';

function readMarkdownSection(text, title) {
  const headings = [];
  let offset = 0;
  let fence = null;
  let comment = false;
  let rawHtml = null;
  let paragraph = [];
  for (const source of text.split('\n')) {
    const start = offset;
    offset += source.length + 1;
    const line = source.replace(/\r$/, '');
    if (fence) {
      const closing = /^ {0,3}(`+|~+)[ \t]*$/.exec(line);
      if (closing && closing[1][0] === fence[0] && closing[1].length >= fence.length) fence = null;
      continue;
    }
    if (rawHtml || comment || /^ {0,3}<!--/.test(line)) {
      if (rawHtml && new RegExp(`</${rawHtml}\\s*>`, 'i').test(line)) rawHtml = null;
      if (!rawHtml) comment = !line.includes('-->') && (comment || line.includes('<!--'));
      paragraph = [];
      continue;
    }
    const html = /^ {0,3}<(pre|script|style|textarea)(?:\s|>|$)/i.exec(line);
    if (html) {
      if (!new RegExp(`</${html[1]}\\s*>`, 'i').test(line)) rawHtml = html[1];
      paragraph = [];
      continue;
    }
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (opening && (opening[1][0] !== '`' || !opening[2].includes('`'))) {
      fence = opening[1];
      paragraph = [];
      continue;
    }
    if (!line.trim() || /^(?: {4}|\t| {0,3}(?:>|[-+*][ \t]|\d+[.)][ \t]))/.test(line)) {
      paragraph = [];
      continue;
    }
    const atx = /^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/.exec(line);
    if (atx) {
      headings.push({ start, level: atx[1].length, title: (atx[2] || '').replace(/[ \t]+#+[ \t]*$/, '').trim() });
      paragraph = [];
      continue;
    }
    const setext = /^ {0,3}(=+|-+)[ \t]*$/.exec(line);
    if (setext && paragraph.length) {
      headings.push({ start: paragraph[0].start, level: setext[1][0] === '=' ? 1 : 2, title: paragraph.map(item => item.line.trim()).join('\n') });
      paragraph = [];
      continue;
    }
    if (setext || /^ {0,3}(?:\*[ \t]*){3,}$|^ {0,3}(?:_[ \t]*){3,}$|^ {0,3}(?:-[ \t]*){3,}$/.test(line)) {
      paragraph = [];
      continue;
    }
    paragraph.push({ start, line });
  }
  const matches = headings.filter(heading => heading.title === title);
  if (matches.length !== 1) {
    const error = new Error(matches.length ? `절 제목이 중복되었습니다: ${title}` : `절 제목을 찾을 수 없습니다: ${title}`);
    error.code = matches.length ? 'document-section-ambiguous' : 'document-section-not-found';
    throw error;
  }
  const selected = matches[0];
  const next = headings.find(heading => heading.start > selected.start && heading.level <= selected.level);
  return text.slice(selected.start, next ? next.start : text.length);
}

module.exports = { readMarkdownSection };
