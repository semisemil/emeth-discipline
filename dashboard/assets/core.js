'use strict';

(function expose(factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.EmethDashboardCore = api;
  }
}(function createCore() {
  const ACTIVE_STATUSES = new Set(['open', 'doing']);
  const COMPLETE_STATUSES = new Set(['resolved', 'cancelled', 'superseded']);
  const RISK_ORDER = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3 });
  const ISSUE_TYPES = Object.freeze({
    bug: '버그',
    task: '구현',
    feature: '기능',
    research: '설계·조사',
    documentation: '문서',
    maintenance: '유지보수',
  });
  const STATUSES = Object.freeze({
    open: '정의됨',
    doing: '작업 중',
    blocked: '보류',
    resolved: '완료',
    cancelled: '취소',
    superseded: '대체됨',
    draft: '초안',
    ready: '준비됨',
    completed: '완료',
  });
  const RISKS = Object.freeze({ critical: '긴급', high: '높음', medium: '보통', low: '낮음' });
  const SIGNALS = Object.freeze({
    'work-definition-only': '작업 정의만 있음',
    'plan-draft': '설계 결정이 남음',
    'spec-needed': '설계 승계 검토',
    'implementation-not-ready': '구현 준비 안 됨',
    'implementation-ready': '구현 가능',
    'state-mismatch': '상태 불일치 가능성',
    'link-mismatch': '연결 확인 필요',
  });
  const SIGNAL_ORDER = Object.freeze({
    'link-mismatch': 0,
    'state-mismatch': 1,
    'implementation-not-ready': 2,
    'plan-draft': 3,
    'spec-needed': 4,
    'work-definition-only': 5,
    'implementation-ready': 6,
  });

  function normalize(value) {
    return String(value || '').normalize('NFKC').toLocaleLowerCase('ko-KR').trim();
  }

  function compareText(left, right) {
    return String(left || '').localeCompare(String(right || ''), 'ko-KR', {
      numeric: true,
      sensitivity: 'base',
    });
  }

  function projectOptions(projects, query = '') {
    const needle = normalize(query);
    return [...(projects || [])]
      .filter((project) => !needle || normalize(`${project.name} ${project.root}`).includes(needle))
      .sort((left, right) => Number(right.availability === 'available') - Number(left.availability === 'available')
        || Number((right.counts?.active || 0) > 0) - Number((left.counts?.active || 0) > 0)
        || (Date.parse(right.latest_issue?.created_at) || 0) - (Date.parse(left.latest_issue?.created_at) || 0)
        || compareText(left.name, right.name) || compareText(left.root, right.root) || compareText(left.id, right.id));
  }

  function projectRailCue(project, projects) {
    const peers = (projects || []).filter((candidate) => normalize(candidate.name) === normalize(project.name))
      .sort((left, right) => compareText(left.root, right.root)
        || String(left.root).localeCompare(String(right.root), 'en', { sensitivity: 'variant' })
        || compareText(left.id, right.id));
    const initials = Array.from(String(project.name || '?')).slice(0, 2).join('');
    if (peers.length < 2) return { primary: initials, secondary: '' };
    const position = peers.findIndex((candidate) => project.id ? candidate.id === project.id : candidate.root === project.root);
    return { primary: Array.from(initials)[0] + String(position + 1), secondary: '' };
  }

  function projectSelectionFocusKey(projectId, viewportWidth) {
    if (!projectId || !Number.isFinite(viewportWidth) || viewportWidth <= 680) return null;
    return `project:${projectId}`;
  }

  function documentOptionFocusKey(kind, id) {
    return kind && id ? `documents:item:${kind}:${id}` : null;
  }

  function restoreFocusByKey(root, focusKey, fallbackKey = null) {
    if (!root || !focusKey || typeof root.querySelectorAll !== 'function') return false;
    const candidates = [...root.querySelectorAll('[data-focus-key]')];
    const keys = [focusKey, fallbackKey].filter(Boolean);
    const target = keys
      .map((key) => candidates.find((candidate) => candidate.dataset?.focusKey === key && !candidate.disabled))
      .find(Boolean);
    if (!target || typeof target.focus !== 'function') return false;
    target.focus({ preventScroll: true });
    return true;
  }

  function initialProjectId(projects, savedId) {
    const available = projectOptions(projects).filter((project) => project.availability === 'available');
    if (available.some((project) => project.id === savedId)) {
      return savedId;
    }
    return available[0]?.id || projectOptions(projects)[0]?.id || null;
  }

  function documentLookup(index) {
    const result = new Map();
    for (const document of [...(index?.designs || []), ...(index?.plans || []), ...(index?.specs || [])]) {
      result.set(document.id, document);
    }
    return result;
  }

  function issueSearchText(issue, documents) {
    const linked = [...(issue.design_ids || []), ...(issue.plan_ids || []), ...(issue.spec_ids || [])]
      .flatMap((id) => [id, documents.get(id)?.title || '']);
    return normalize([
      issue.id,
      issue.title,
      issue.current_summary,
      issue.next_action,
      ...linked,
    ].join(' '));
  }

  function matchesQuickStatus(status, quick) {
    if (quick === 'all') return true;
    if (quick === 'active') return ACTIVE_STATUSES.has(status);
    if (quick === 'blocked') return status === 'blocked';
    if (quick === 'completed-group') return COMPLETE_STATUSES.has(status);
    return true;
  }

  function createLatestRequestGate() {
    let generation = 0;
    return Object.freeze({
      begin(key) {
        generation += 1;
        return Object.freeze({ generation, key });
      },
      invalidate() {
        generation += 1;
      },
      isCurrent(request, key) {
        return Boolean(request)
          && request.generation === generation
          && request.key === key;
      },
    });
  }

  function documentRequestDisposition(requestProjectId, requestKey, currentProjectId, currentKey) {
    const sameProject = requestProjectId === currentProjectId;
    return Object.freeze({
      cache: sameProject,
      render: sameProject && requestKey === currentKey,
    });
  }

  function createDocumentRequestGate() {
    let generation = 0;
    let sequence = 0;
    const latestByProject = new Map();
    return Object.freeze({
      begin(projectId, key) {
        sequence += 1;
        let latestByKey = latestByProject.get(projectId);
        if (!latestByKey) {
          latestByKey = new Map();
          latestByProject.set(projectId, latestByKey);
        }
        latestByKey.set(key, sequence);
        return Object.freeze({ generation, projectId, key, sequence });
      },
      invalidate() {
        generation += 1;
        latestByProject.clear();
      },
      disposition(request, currentProjectId, currentKey) {
        const latestSequence = request
          ? latestByProject.get(request.projectId)?.get(request.key)
          : null;
        if (!request
          || request.generation !== generation
          || request.sequence !== latestSequence) {
          return Object.freeze({ cache: false, render: false });
        }
        return documentRequestDisposition(
          request.projectId,
          request.key,
          currentProjectId,
          currentKey,
        );
      },
    });
  }

  function compareIssues(left, right, sort) {
    const [field, direction = 'asc'] = String(sort || 'id-asc').split('-');
    let result;
    if (field === 'date') {
      result = compareText(left.updated_at, right.updated_at);
    } else if (field === 'risk') {
      result = (RISK_ORDER[left.risk] ?? 99) - (RISK_ORDER[right.risk] ?? 99);
    } else if (field === 'title') {
      result = compareText(left.title, right.title);
    } else if (field === 'type') {
      result = compareText(ISSUE_TYPES[left.type] || left.type, ISSUE_TYPES[right.type] || right.type);
    } else if (field === 'status') {
      const order = ['doing', 'open', 'blocked', 'resolved', 'cancelled', 'superseded'];
      result = order.indexOf(left.status) - order.indexOf(right.status);
    } else {
      result = compareText(left.id, right.id);
    }
    return (direction === 'desc' ? -result : result) || compareText(left.id, right.id);
  }

  function selectIssues(index, filters = {}) {
    const documents = documentLookup(index);
    const needle = normalize(filters.search);
    return [...(index?.issues || [])]
      .filter((issue) => matchesQuickStatus(issue.status, filters.quick || 'active'))
      .filter((issue) => !filters.type || filters.type === 'all' || issue.type === filters.type)
      .filter((issue) => !filters.status || filters.status === 'all' || issue.status === filters.status)
      .filter((issue) => !filters.risk || filters.risk === 'all' || issue.risk === filters.risk)
      .filter((issue) => !needle || issueSearchText(issue, documents).includes(needle))
      .sort((left, right) => compareIssues(left, right, filters.sort || 'id-asc'));
  }

  function documentSearchText(document) {
    return normalize([
      document.id,
      document.title,
      ...(document.related_issues || []),
      ...(document.linked_issue_ids || []),
    ].join(' '));
  }

  function selectDocuments(index, filters = {}) {
    const needle = normalize(filters.search);
    const documents = [
      ...(index?.designs || []).map((item) => ({ ...item, document_kind: 'design' })),
      ...(index?.plans || []).map((item) => ({ ...item, document_kind: 'plan' })),
      ...(index?.specs || []).map((item) => ({ ...item, document_kind: 'spec' })),
    ];
    return documents
      .filter((item) => !filters.kind || filters.kind === 'all' || item.document_kind === filters.kind)
      .filter((item) => !filters.status || filters.status === 'all' || item.status === filters.status)
      .filter((item) => !needle || documentSearchText(item).includes(needle))
      .sort((left, right) => {
        const sort = filters.sort || 'id-asc';
        const result = sort.startsWith('date')
          ? compareText(left.updated_at, right.updated_at)
          : compareText(left.id, right.id);
        return (sort.endsWith('desc') ? -result : result) || compareText(left.id, right.id);
      });
  }

  function selectSignals(index, search = '') {
    const needle = normalize(search);
    return [...(index?.flow_signals || [])]
      .filter((item) => !needle || normalize([
        item.signal,
        SIGNALS[item.signal],
        item.target?.kind,
        item.target?.id,
        item.observed,
        item.next_action,
      ].join(' ')).includes(needle))
      .sort((left, right) => (SIGNAL_ORDER[left.signal] ?? 99) - (SIGNAL_ORDER[right.signal] ?? 99)
        || compareText(left.target?.id, right.target?.id));
  }

  function signalToken(signalId) {
    return String(signalId || '').split(':').at(-1) || '';
  }

  function signalLabels(signalIds) {
    return (signalIds || []).map((signalId) => SIGNALS[signalToken(signalId)] || '알 수 없는 흐름 상태');
  }

  function relatedState(document) {
    const declared = document.related_issues || [];
    const reciprocal = document.linked_issue_ids || [];
    if (declared.length === 0 && reciprocal.length === 0) {
      return { label: '연결 이슈 없음', mismatch: false };
    }
    const all = [...new Set([...declared, ...reciprocal])].sort(compareText);
    const mismatch = declared.length !== reciprocal.length
      || declared.some((id) => !reciprocal.includes(id));
    return {
      label: `${all.join(', ')}${mismatch ? ' · 연결 확인 필요' : ''}`,
      mismatch,
    };
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\uE000/g, '&#57344;')
      .replace(/\uE001/g, '&#57345;');
  }

  function safeHttpUrl(escapedUrl) {
    const candidate = escapedUrl.replace(/&amp;/g, '&');
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      return escapeHtml(parsed.href);
    } catch {
      return null;
    }
  }

  function safeInternalUrl(value) {
    try {
      const parsed = new URL(String(value || ''), 'http://emeth.local');
      if (parsed.origin !== 'http://emeth.local' || parsed.pathname !== '/architecture') return null;
      return escapeHtml(`${parsed.pathname}${parsed.search}${parsed.hash}`);
    } catch {
      return null;
    }
  }

  function renderInlineEscaped(escapedText, options = {}) {
    const tokens = [];
    const storeToken = (html) => {
      const token = `\uE000${tokens.length}\uE001`;
      tokens.push(html);
      return token;
    };
    let text = escapedText.replace(/`([^`\n]+)`/g, (_match, value) => {
      return storeToken(`<code>${value}</code>`);
    });
    text = text.replace(/(^|[^!])\[([^\]\n]+)\]\(([^)\s]+)\)/g, (match, prefix, label, href) => {
      const safe = safeHttpUrl(href);
      if (safe) {
        return `${prefix}${storeToken(`<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`)}`;
      }
      const rawHref = href.replace(/&amp;/g, '&');
      const resolved = typeof options.resolveLink === 'function' ? options.resolveLink(rawHref) : null;
      const internal = safeInternalUrl(resolved);
      if (!internal) {
        if (typeof options.onUnresolvedLink === 'function'
            && !rawHref.startsWith('#')
            && !rawHref.startsWith('/')
            && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawHref)) {
          options.onUnresolvedLink(rawHref);
        }
        return `${prefix}${label} (${href})`;
      }
      return `${prefix}${storeToken(`<a href="${internal}" data-architecture-link="true">${label}</a>`)}`;
    });
    text = text
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
    return text.replace(/\uE000(\d+)\uE001/g, (_match, index) => tokens[Number(index)] || '');
  }

  function splitTableRow(line) {
    return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((cell) => cell.trim());
  }

  function renderMarkdown(markdown, options = {}) {
    const escaped = escapeHtml(String(markdown ?? '').replace(/\r\n?/g, '\n'));
    const lines = escaped.split('\n');
    const output = [];
    let index = 0;
    const isTableDivider = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
    const isBlockStart = (line, next) => /^\s*```/.test(line)
      || /^(#{1,6})\s+/.test(line)
      || /^\s*([-*+]\s+|\d+[.)]\s+)/.test(line)
      || (line.includes('|') && isTableDivider(next || ''));

    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }
      const fence = line.match(/^\s*```([^`]*)$/);
      if (fence) {
        const body = [];
        index += 1;
        while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
          body.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        const language = fence[1].trim();
        const className = language ? ` class="language-${language.replace(/[^a-zA-Z0-9_-]/g, '')}"` : '';
        output.push(`<pre><code${className}>${body.join('\n')}</code></pre>`);
        continue;
      }
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        output.push(`<h${level}>${renderInlineEscaped(heading[2], options)}</h${level}>`);
        index += 1;
        continue;
      }
      if (line.includes('|') && isTableDivider(lines[index + 1] || '')) {
        const headers = splitTableRow(line);
        const rows = [];
        index += 2;
        while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
          rows.push(splitTableRow(lines[index]));
          index += 1;
        }
        output.push('<div class="markdown-table-wrap"><table><thead><tr>');
        output.push(headers.map((cell) => `<th>${renderInlineEscaped(cell, options)}</th>`).join(''));
        output.push('</tr></thead><tbody>');
        for (const row of rows) {
          output.push('<tr>');
          output.push(headers.map((_header, cellIndex) => `<td>${renderInlineEscaped(row[cellIndex] || '', options)}</td>`).join(''));
          output.push('</tr>');
        }
        output.push('</tbody></table></div>');
        continue;
      }
      const list = line.match(/^\s*([-*+]|\d+[.)])\s+(.+)$/);
      if (list) {
        const ordered = /^\d/.test(list[1]);
        const tag = ordered ? 'ol' : 'ul';
        const items = [];
        while (index < lines.length) {
          const item = lines[index].match(/^\s*([-*+]|\d+[.)])\s+(.+)$/);
          if (!item || /^\d/.test(item[1]) !== ordered) break;
          items.push(`<li>${renderInlineEscaped(item[2], options)}</li>`);
          index += 1;
        }
        output.push(`<${tag}>${items.join('')}</${tag}>`);
        continue;
      }
      const paragraph = [line.trim()];
      index += 1;
      while (index < lines.length && lines[index].trim()
        && !isBlockStart(lines[index], lines[index + 1])) {
        paragraph.push(lines[index].trim());
        index += 1;
      }
      output.push(`<p>${renderInlineEscaped(paragraph.join(' '), options)}</p>`);
    }
    return output.join('\n');
  }

  function architectureDocumentId(document) {
    return String(document?.id || document?.document_id || '').trim();
  }

  function architectureDocumentPath(document) {
    return String(document?.relative_path || document?.path || '').replace(/\\/g, '/').replace(/^\.\//, '');
  }

  function architectureDocuments(index) {
    const documents = Array.isArray(index?.documents) ? index.documents : [];
    return documents
      .filter((document) => architectureDocumentId(document) && architectureDocumentPath(document))
      .sort((left, right) => (Number(left.order) || 0) - (Number(right.order) || 0)
        || compareText(left.title, right.title)
        || compareText(architectureDocumentId(left), architectureDocumentId(right)));
  }

  function initialArchitectureDocumentId(documents, requestedId) {
    const requested = String(requestedId || '');
    if ((documents || []).some((document) => architectureDocumentId(document) === requested)) return requested;
    return architectureDocumentId(documents?.[0]) || null;
  }

  function normalizeArchitecturePath(value) {
    const output = [];
    for (const segment of String(value || '').replace(/\\/g, '/').split('/')) {
      if (!segment || segment === '.') continue;
      if (segment === '..') {
        if (output.length === 0) return null;
        output.pop();
      } else {
        output.push(segment);
      }
    }
    return output.join('/');
  }

  function resolveArchitectureDocumentId(documents, currentPath, href) {
    const candidate = String(href || '').trim();
    if (!candidate || candidate.startsWith('#') || candidate.startsWith('/')
        || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) return null;
    const withoutSuffix = candidate.split(/[?#]/, 1)[0];
    if (!withoutSuffix) return null;
    const current = normalizeArchitecturePath(currentPath);
    if (!current) return null;
    const directory = current.includes('/') ? current.slice(0, current.lastIndexOf('/') + 1) : '';
    const resolved = normalizeArchitecturePath(`${directory}${withoutSuffix}`);
    if (!resolved) return null;
    return architectureDocumentId((documents || []).find(
      (document) => normalizeArchitecturePath(architectureDocumentPath(document)) === resolved,
    )) || null;
  }

  return Object.freeze({
    ACTIVE_STATUSES,
    COMPLETE_STATUSES,
    ISSUE_TYPES,
    RISKS,
    SIGNALS,
    STATUSES,
    compareText,
    architectureDocumentId,
    architectureDocumentPath,
    architectureDocuments,
    createDocumentRequestGate,
    createLatestRequestGate,
    documentOptionFocusKey,
    documentRequestDisposition,
    escapeHtml,
    initialProjectId,
    initialArchitectureDocumentId,
    projectOptions,
    projectRailCue,
    projectSelectionFocusKey,
    relatedState,
    renderMarkdown,
    resolveArchitectureDocumentId,
    restoreFocusByKey,
    safeHttpUrl,
    signalLabels,
    signalToken,
    selectDocuments,
    selectIssues,
    selectSignals,
  });
}));
