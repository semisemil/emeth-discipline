'use strict';

(function startArchitecture() {
  const core = globalThis.EmethDashboardCore;
  const motion = globalThis.EmethMotion;
  if (!core) return;

  const DOCUMENT_KIND_LABELS = Object.freeze({
    index: '아키텍처 안내',
    'system-context': '시스템 맥락',
    containers: '컨테이너',
    'component-index': '컴포넌트',
    component: '컴포넌트',
    context: '아키텍처 맥락',
    'decision-index': '아키텍처 결정',
    decision: '결정 기록',
  });
  const state = {
    projectId: null,
    index: null,
    documents: [],
    documentId: null,
  };
  const indexGate = core.createLatestRequestGate();
  const documentGate = core.createLatestRequestGate();
  const reader = document.querySelector('#architecture-template').content.firstElementChild;
  const elements = {
    documents: reader.querySelector('#architecture-documents'),
    detail: reader.querySelector('#architecture-document'),
    status: reader.querySelector('#architecture-status'),
  };

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  async function api(path) {
    let response;
    try {
      response = await fetch(path, { headers: { Accept: 'application/json' } });
    } catch (cause) {
      throw new Error('Emeth Discipline 서버에 연결할 수 없습니다.', { cause });
    }
    if (!response.ok) {
      let detail = null;
      try {
        detail = await response.json();
      } catch {
        // A non-JSON failure still receives the generic message below.
      }
      const error = new Error(detail?.error?.message || '아키텍처 문서를 읽을 수 없습니다.');
      error.code = detail?.error?.code;
      throw error;
    }
    return response.json();
  }

  function setStatus(message, error = false) {
    elements.status.textContent = message || '';
    elements.status.classList.toggle('architecture-status-error', error);
    elements.status.setAttribute('role', error ? 'alert' : 'status');
  }

  function updateLocation() {
    const params = new URLSearchParams();
    if (state.projectId) params.set('project', state.projectId);
    if (state.documentId) params.set('document', state.documentId);
    const suffix = params.size ? `?${params}` : '';
    globalThis.history.replaceState(null, '', `/architecture${suffix}`);
  }

  const search = reader.querySelector('.architecture-search');
  const mobileToggle = reader.querySelector('.mobile-toc-toggle');
  const expandedGroups = new Set(['개요', '시스템 구조']);
  const groups = [
    ['개요', 'index', ['context']],
    ['시스템 구조', null, ['system-context', 'containers']],
    ['컴포넌트', 'component-index', ['component']],
    ['설계 결정', 'decision-index', ['decision']],
  ];

  function showMobileContents(open) {
    mobileToggle.setAttribute('aria-expanded', String(open));
    mobileToggle.textContent = open ? '목차 접기' : '목차 펼치기';
  }
  mobileToggle.onclick = () => showMobileContents(mobileToggle.getAttribute('aria-expanded') !== 'true');
  search.oninput = () => {
    showMobileContents(true);
    renderDocumentNavigation();
  };

  function documentLink(item, label) {
    const link = make('a', 'architecture-document-link', label);
    link.href = '/architecture?' + new URLSearchParams({ project: state.projectId, document: item.id });
    link.dataset.documentId = item.id;
    link.title = item.path;
    if (item.id === state.documentId) link.setAttribute('aria-current', 'page');
    return link;
  }

  // Index the same visible blocks the reader uses, including individual list entries and table rows.
  function readingBody(detail, options) {
    const body = make('article', 'markdown-body architecture-markdown');
    const copy = detail.body.replace(/^<!--\s*am:\s*\{[^\r\n]*\}\s*-->\s*$/gm, '');
    body.innerHTML = core.renderMarkdown(copy, options);
    return body;
  }

  const blockSelector = 'h1,h2,h3,h4,h5,h6,p,li,tr,pre';
  const blockText = node => node.textContent.replace(/\s+/g, ' ').trim();
  let paragraphs = new Map();
  let indexing = false;
  let searchFailures = 0;

  async function indexParagraphs() {
    if (indexing) return;
    indexing = true;
    const cache = paragraphs;
    for (const item of state.documents) {
      if (cache !== paragraphs || !search.value.trim()) break;
      if (cache.has(item.id)) continue;
      try {
        const detail = await api('/api/v1/projects/' + encodeURIComponent(state.projectId) + '/architecture/documents/' + encodeURIComponent(item.id));
        const body = readingBody(detail, { resolveLink: href => architectureLink(detail.path, href) });
        cache.set(item.id, Array.from(body.querySelectorAll(blockSelector), blockText));
      } catch {
        cache.set(item.id, []);
        if (cache === paragraphs) searchFailures++;
      }
    }
    if (cache !== paragraphs) return;
    indexing = false;
    if (search.value.trim()) renderDocumentNavigation();
  }

  function renderSearch(query) {
    let count = 0;
    for (const item of state.documents) {
      const title = item.title || DOCUMENT_KIND_LABELS[item.kind] || item.id;
      const group = groups.find(([, index, kinds]) => index === item.kind || kinds.includes(item.kind));
      const metadataMatch = [title, item.path, group?.[0]].some(value => value?.toLocaleLowerCase().includes(query));
      const result = make('section', 'architecture-result');
      const heading = documentLink(item, title);
      result.append(heading);
      let hits = 0;
      (paragraphs.get(item.id) || []).forEach((text, index) => {
        const offset = text.toLocaleLowerCase().indexOf(query);
        if (offset < 0) return;
        const link = documentLink(item, '');
        link.className = 'passage-link';
        link.dataset.block = index;
        link.href += '#passage-' + index;
        const start = Math.max(0, offset - 30);
        const end = Math.min(text.length, offset + query.length + 50);
        link.append((start ? '…' : '') + text.slice(start, offset), make('mark', '', text.slice(offset, offset + query.length)),
          text.slice(offset + query.length, end) + (end < text.length ? '…' : ''));
        result.append(link);
        hits++;
      });
      if (metadataMatch || hits) {
        elements.documents.append(result);
        count++;
      }
    }
    reader.querySelector('#architecture-count').textContent = count + '개';
    if (state.documents.some(item => !paragraphs.has(item.id))) {
      elements.documents.append(make('p', 'architecture-search-empty', '본문 검색 중…'));
      indexParagraphs();
    } else if (!count) elements.documents.append(make('p', 'architecture-search-empty', '검색 결과 없음'));
    if (searchFailures) elements.documents.append(make('p', 'architecture-search-empty', '읽을 수 없는 문서 ' + searchFailures + '개'));
  }

  function renderDocumentNavigation() {
    const query = search.value.trim().toLocaleLowerCase();
    let count = 0;
    elements.documents.replaceChildren();
    if (query) return renderSearch(query);
    for (const [name, indexKind, childKinds] of groups) {
      const indexes = state.documents.filter(item => item.kind === indexKind);
      const landing = indexes[0];
      const children = [...indexes.slice(1), ...childKinds.flatMap(kind => state.documents.filter(item => item.kind === kind))];
      const showLanding = landing;
      if (!showLanding && !children.length) continue;
      count += children.length + Number(Boolean(showLanding));
      const group = make('section', 'architecture-group');
      const heading = make('div', 'architecture-group-heading');
      group.append(heading);
      if (showLanding) heading.append(documentLink(landing, name));
      if (children.length) {
        const list = make('ul', 'architecture-document-list');
        const toggle = make('button', 'group-toggle', landing ? '' : name);
        toggle.type = 'button';
        const expanded = expandedGroups.has(name);
        const setExpanded = open => {
          list.hidden = !open;
          toggle.setAttribute('aria-expanded', String(open));
          toggle.setAttribute('aria-label', name + (open ? ' 목록 접기' : ' 목록 펼치기'));
        };
        setExpanded(expanded);
        toggle.onclick = () => {
          const open = list.hidden;
          if (open) expandedGroups.add(name);
          else expandedGroups.delete(name);
          setExpanded(open);
        };
        heading.prepend(toggle);
        for (const item of children) {
          const label = item.title || (['component', 'decision'].includes(item.kind)
            ? item.path.split('/').pop().replace(/\.md$/i, '') : DOCUMENT_KIND_LABELS[item.kind]);
          const row = make('li');
          row.append(documentLink(item, label));
          list.append(row);
        }
        group.append(list);
      }
      elements.documents.append(group);
    }
    reader.querySelector('#architecture-count').textContent = count + '개';
    if (!count) elements.documents.append(make('p', 'architecture-search-empty', '문서 없음'));
  }

  function emptyDetail(title, message) {
    elements.detail.replaceChildren();
    const empty = make('div', 'empty-state');
    empty.append(make('h2', '', title));
    if (message) empty.append(make('p', '', message));
    elements.detail.append(empty);
  }

  function architectureLink(currentPath, href) {
    const documentId = core.resolveArchitectureDocumentId(state.documents, currentPath, href);
    if (!documentId) return null;
    const params = new URLSearchParams({ project: state.projectId, document: documentId });
    return `/architecture?${params}`;
  }

  function decisionStatus(item, markdown) {
    if (item.kind !== 'decision') return null;
    const header = String(markdown || '').split(/\r?\n/, 16).join('\n');
    return header.match(/^\s*[-*]\s+[^:\n]+:\s*(proposed|accepted|deprecated|superseded)\s*$/im)?.[1] || null;
  }

  async function renderDiagrams() {
    const projectId = state.projectId;
    const documentId = state.documentId;
    const failed = await globalThis.EmethDashboardDiagrams.render(elements.detail);
    if (failed && projectId === state.projectId && documentId === state.documentId) {
      setStatus('일부 다이어그램을 코드로 표시합니다.', true);
    }
  }

  function renderDocument(detail, block) {
    const relativePath = detail.path;
    const header = make('header', 'architecture-document-header');
    header.append(
      make('p', 'document-kind', DOCUMENT_KIND_LABELS[detail.kind] || '아키텍처'),
      make('h2', '', DOCUMENT_KIND_LABELS[detail.kind] || detail.id),
      make('p', 'document-path', relativePath),
    );
    const markdown = detail.body;
    const metadata = make('dl', 'architecture-metadata');
    const checkpoint = state.index?.git_checkpoint || {};
    const fields = [
      ['ADR 상태', decisionStatus(detail, markdown)],
      ['Git 브랜치', checkpoint.branch_at_check],
      ['Git 커밋', checkpoint.revision],
      ['Git 동기화', checkpoint.checked_at],
      ['문서 전체 검증', detail.verified_at],
      ['문서 검증 revision', detail.source_revision],
    ].filter(([, value]) => value);
    for (const [label, value] of fields) {
      metadata.append(make('dt', '', label), make('dd', '', value));
    }
    const unresolvedLinks = [];
    const body = readingBody(detail, {
      resolveLink: (href) => architectureLink(relativePath, href),
      onUnresolvedLink: (href) => unresolvedLinks.push(href),
    });
    const blocks = [...body.querySelectorAll(blockSelector)];
    blocks.forEach((node, index) => { node.dataset.passage = index; });
    paragraphs.set(detail.id, blocks.map(blockText));
    const title = body.firstElementChild;
    if (title?.tagName === 'H1') {
      header.querySelector('h2').textContent = title.textContent;
      header.dataset.passage = title.dataset.passage;
      title.remove();
    }
    elements.detail.replaceChildren(header);
    const headings = [...body.querySelectorAll('h2')];
    if (headings.length > 1) {
      const outline = make('details', 'reader-outline');
      outline.append(make('summary', '', '이 문서의 목차'));
      const nav = make('nav');
      nav.setAttribute('aria-label', '문서 목차');
      headings.forEach((heading, index) => {
        heading.id = 'reader-heading-' + index;
        const link = make('a', '', heading.textContent);
        link.href = '#' + heading.id;
        nav.append(link);
      });
      outline.append(nav);
      elements.detail.append(outline);
    }
    if (fields.length) {
      const revisions = make('details', 'reader-revisions');
      revisions.append(make('summary', '', '문서 검증 정보'), metadata);
      elements.detail.append(revisions);
    }
    elements.detail.append(body);
    if (unresolvedLinks.length) {
      const references = make('details', 'reader-revisions');
      references.append(make('summary', '', '등록 문서 밖의 참조 ' + unresolvedLinks.length + '개'));
      const list = make('ul');
      for (const href of unresolvedLinks) list.append(make('li', '', href));
      references.append(list);
      elements.detail.append(references);
    }
    let target = block == null ? null : elements.detail.querySelector('[data-passage="' + block + '"]');
    if (target?.matches('pre:has(.language-mermaid)')) {
      const wrapper = make('div');
      target.replaceWith(wrapper);
      wrapper.append(target);
      target = wrapper;
    }
    if (target) {
      target.tabIndex = -1;
      target.classList.add('passage-target');
      requestAnimationFrame(() => {
        if (!target.isConnected) return;
        target.focus({ preventScroll:true });
        target.scrollIntoView?.({block:'center'});
      });
    }
    renderDiagrams();
  }

  async function loadDocument(documentId, options = {}) {
    if (!documentId || !state.projectId) return;
    const transition = options.silent ? null : motion.begin(elements.detail);
    state.documentId = documentId;
    const selected = state.documents.find(item => item.id === documentId);
    const group = groups.find(([, index, children]) => selected && (index === selected.kind || children.includes(selected.kind)));
    if (group) expandedGroups.add(group[0]);
    renderDocumentNavigation();
    updateLocation();
    if (options.block != null) globalThis.history.replaceState(null, '', globalThis.location.pathname + globalThis.location.search + '#passage-' + options.block);
    const request = documentGate.begin(documentId);
    try {
      const detail = await api(`/api/v1/projects/${encodeURIComponent(state.projectId)}/architecture/documents/${encodeURIComponent(documentId)}`);
      if (!documentGate.isCurrent(request, state.documentId)) return;
      setStatus('');
      renderDocument(detail, options.block);
    } catch (error) {
      if (!documentGate.isCurrent(request, state.documentId)) return;
      setStatus('');
      emptyDetail('문서를 읽을 수 없음', error.message);
    } finally {
      motion.finish(transition);
    }
  }

  async function loadArchitecture(projectId, requestedDocumentId = null) {
    const initialBlock = /^#passage-(\d+)$/.exec(globalThis.location.hash)?.[1];
    paragraphs = new Map();
    indexing = false;
    searchFailures = 0;
    const transition = motion.begin(elements.detail);
    if (state.projectId !== projectId) {
      search.value = '';
      showMobileContents(false);
      expandedGroups.clear();
      expandedGroups.add('개요');
      expandedGroups.add('시스템 구조');
    }
    state.projectId = projectId;
    state.index = null;
    state.documents = [];
    state.documentId = null;
    documentGate.invalidate();
    elements.detail.replaceChildren();
    renderDocumentNavigation();
    updateLocation();
    setStatus('');
    const request = indexGate.begin(projectId);
    try {
      const index = await api(`/api/v1/projects/${encodeURIComponent(projectId)}/architecture/index`);
      if (!indexGate.isCurrent(request, state.projectId)) return;
      state.index = index;
      state.documents = core.architectureDocuments(index);
      state.documentId = core.initialArchitectureDocumentId(state.documents, requestedDocumentId);
      renderDocumentNavigation();
      updateLocation();
      if (!state.documentId) {
        emptyDetail('아키텍처 문서 없음');
        return;
      }
      await loadDocument(state.documentId, { silent: true, block: initialBlock });
    } catch (error) {
      if (!indexGate.isCurrent(request, state.projectId)) return;
      setStatus('');
      if (error.code === 'architecture-not-found') emptyDetail('아키텍처 문서 없음');
      else emptyDetail('아키텍처를 읽을 수 없음', error.message);
    } finally {
      motion.finish(transition);
    }
  }

  elements.documents.addEventListener('click', (event) => {
    const link = event.target.closest('[data-document-id]');
    if (!link) return;
    event.preventDefault();
    loadDocument(link.dataset.documentId, { block:link.dataset.block });
    showMobileContents(false);
    const focusTarget = globalThis.matchMedia('(max-width: 760px)').matches ? mobileToggle : elements.documents.querySelector('[aria-current="page"]');
    focusTarget?.focus({ preventScroll:true });
  });
  elements.detail.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-architecture-link="true"]');
    if (!link) return;
    const target = new URL(link.href).searchParams.get('document');
    if (!target) return;
    event.preventDefault();
    loadDocument(target);
  });
  globalThis.EmethArchitecture = {
    reader,
    load: loadArchitecture,
    refresh() { return loadArchitecture(state.projectId, state.documentId); },
    leave() { indexGate.invalidate(); documentGate.invalidate(); }
  };
}());
