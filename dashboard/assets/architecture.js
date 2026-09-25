'use strict';

(function startArchitecture() {
  const core = globalThis.EmethDashboardCore;
  const motion = globalThis.EmethMotion;
  if (!core) return;

  const STORAGE_PROJECT = 'emeth.dashboard.project';
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
    projects: [],
    projectId: null,
    index: null,
    documents: [],
    documentId: null,
  };
  const indexGate = core.createLatestRequestGate();
  const documentGate = core.createDocumentRequestGate();
  const query = new URLSearchParams(globalThis.location.search);
  const elements = {
    project: document.getElementById('architecture-project'),
    documents: document.getElementById('architecture-documents'),
    detail: document.getElementById('architecture-document'),
    status: document.getElementById('architecture-status'),
    refresh: document.getElementById('architecture-refresh'),
    dashboardLink: document.getElementById('dashboard-link'),
  };

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function savedProjectId() {
    try {
      return localStorage.getItem(STORAGE_PROJECT);
    } catch {
      return null;
    }
  }

  function applySavedAppearance() {
    try {
      const theme = localStorage.getItem('emeth.dashboard.theme');
      const accent = (localStorage.getItem('emeth.dashboard.accent') || '').replace(/^#3459e6$/i, '#c93686');
      if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
      if (/^#[0-9a-fA-F]{6}$/.test(accent || '')) {
        document.documentElement.style.setProperty('--accent', accent);
      }
    } catch {
      // Appearance preferences are optional.
    }
  }

  function saveProjectId(projectId) {
    try {
      localStorage.setItem(STORAGE_PROJECT, projectId);
    } catch {
      // The URL still carries the selection when storage is unavailable.
    }
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

  function selectedProject() {
    return state.projects.find((project) => project.id === state.projectId) || null;
  }

  function updateLocation() {
    const params = new URLSearchParams();
    if (state.projectId) params.set('project', state.projectId);
    if (state.documentId) params.set('document', state.documentId);
    const suffix = params.size ? `?${params}` : '';
    globalThis.history.replaceState(null, '', `/architecture${suffix}`);
    const dashboardParams = new URLSearchParams();
    if (state.projectId) dashboardParams.set('project', state.projectId);
    elements.dashboardLink.href = `/dashboard${dashboardParams.size ? `?${dashboardParams}` : ''}`;
  }

  function renderProjects() {
    const current = state.projects.find((project) => project.id === state.projectId);
    const shortcut = document.getElementById('architecture-project-shortcut');
    shortcut.textContent = Array.from(current?.name || 'P').slice(0, 2).join('');
    shortcut.title = current ? `${current.name}\n${current.root}\n프로젝트 선택` : '프로젝트 선택';
    shortcut.setAttribute('aria-label', current ? `${current.name}, 프로젝트 선택` : '프로젝트 선택');
    shortcut.dataset.activity = current?.counts?.active > 0 ? 'active' : 'idle';
    elements.project.replaceChildren();
    if (state.projects.length === 0) {
      const option = make('option', '', '등록 프로젝트 없음');
      option.value = '';
      elements.project.append(option);
      elements.project.disabled = true;
      return;
    }
    elements.project.disabled = false;
    for (const project of core.projectOptions(state.projects)) {
      const option = make('option', '', project.name);
      option.value = project.id;
      option.disabled = project.availability !== 'available';
      option.selected = project.id === state.projectId;
      option.setAttribute('aria-label', `${project.name}, ${project.root}, ${option.disabled ? '사용 불가' : '사용 가능'}`);
      elements.project.append(option);
    }
  }

  function renderDocumentNavigation() {
    elements.documents.replaceChildren();
    if (state.documents.length === 0) {
      elements.documents.append(make('p', 'architecture-navigation-empty', '문서 없음'));
      return;
    }
    const list = make('ol', 'architecture-document-list');
    for (const item of state.documents) {
      const row = make('li');
      const link = make('a', 'architecture-document-link');
      const id = core.architectureDocumentId(item);
      const params = new URLSearchParams({ project: state.projectId, document: id });
      link.href = `/architecture?${params}`;
      link.dataset.documentId = id;
      link.dataset.railLabel = String(list.children.length + 1).padStart(2, '0');
      link.title = `${item.title || DOCUMENT_KIND_LABELS[item.kind] || id}\n${core.architectureDocumentPath(item)}`;
      link.setAttribute('aria-label', item.title || DOCUMENT_KIND_LABELS[item.kind] || id);
      link.setAttribute('aria-current', id === state.documentId ? 'page' : 'false');
      link.append(
        make('strong', '', item.title || DOCUMENT_KIND_LABELS[item.kind] || id),
        make('span', '', [DOCUMENT_KIND_LABELS[item.kind] || core.architectureDocumentPath(item), core.STATUSES[item.status] || item.status].filter(Boolean).join(' · ')),
      );
      row.append(link);
      list.append(row);
    }
    elements.documents.append(list);
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

  async function renderMermaid() {
    const mermaid = globalThis.mermaid;
    const codeBlocks = [...elements.detail.querySelectorAll('pre > code.language-mermaid')];
    if (codeBlocks.length === 0 || !mermaid) return;
    const replacements = codeBlocks.map((code) => {
      const original = code.parentElement;
      const diagram = make('div', 'mermaid');
      diagram.textContent = code.textContent;
      original.replaceWith(diagram);
      return { diagram, original };
    });
    try {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
      await mermaid.run({ nodes: replacements.map(({ diagram }) => diagram) });
    } catch {
      for (const { diagram, original } of replacements) {
        if (diagram.isConnected) diagram.replaceWith(original);
      }
      setStatus('일부 Mermaid 다이어그램을 코드로 표시합니다.', true);
    }
  }

  function renderDocument(detail) {
    const item = state.documents.find(
      (documentItem) => core.architectureDocumentId(documentItem) === state.documentId,
    ) || {};
    const relativePath = detail.relative_path || detail.path || core.architectureDocumentPath(item);
    const header = make('header', 'architecture-document-header');
    header.append(
      make('p', 'document-kind', DOCUMENT_KIND_LABELS[item.kind] || '아키텍처'),
      make('h2', '', detail.title || item.title || DOCUMENT_KIND_LABELS[item.kind] || state.documentId),
      make('p', 'document-path', relativePath),
    );
    const markdown = detail.body || detail.content || '';
    const metadata = make('dl', 'architecture-metadata');
    const checkpoint = state.index?.git_checkpoint || {};
    const fields = [
      ['ADR 상태', decisionStatus(item, markdown)],
      ['Git 브랜치', checkpoint.branch_at_check],
      ['Git 커밋', checkpoint.revision],
      ['Git 동기화', checkpoint.checked_at],
      ['문서 전체 검증', detail.verified_at || item.verified_at],
      ['문서 검증 revision', detail.source_revision || item.source_revision],
    ].filter(([, value]) => value);
    for (const [label, value] of fields) {
      metadata.append(make('dt', '', label), make('dd', '', value));
    }
    const body = make('article', 'markdown-body architecture-markdown');
    const unresolvedLinks = [];
    body.innerHTML = core.renderMarkdown(markdown, {
      resolveLink: (href) => architectureLink(relativePath, href),
      onUnresolvedLink: (href) => unresolvedLinks.push(href),
    });
    elements.detail.replaceChildren(header);
    if (fields.length) elements.detail.append(metadata);
    elements.detail.append(body);
    if (unresolvedLinks.length) {
      setStatus(`등록 문서로 연결되지 않는 상대 링크 ${unresolvedLinks.length}개가 있습니다.`, true);
    }
    renderMermaid();
  }

  async function loadDocument(documentId, options = {}) {
    if (!documentId || !state.projectId) return;
    const transition = options.silent ? null : motion.begin(elements.detail);
    state.documentId = documentId;
    renderDocumentNavigation();
    updateLocation();
    const request = documentGate.begin(state.projectId, documentId);
    try {
      const detail = await api(`/api/v1/projects/${encodeURIComponent(state.projectId)}/architecture/documents/${encodeURIComponent(documentId)}`);
      const disposition = documentGate.disposition(request, state.projectId, state.documentId);
      if (!disposition.render) return;
      setStatus('');
      renderDocument(detail);
    } catch (error) {
      const disposition = documentGate.disposition(request, state.projectId, state.documentId);
      if (!disposition.render) return;
      setStatus('');
      emptyDetail('문서를 읽을 수 없음', error.message);
    } finally {
      motion.finish(transition);
    }
  }

  async function loadArchitecture(projectId, requestedDocumentId = null) {
    const project = state.projects.find((item) => item.id === projectId && item.availability === 'available');
    if (!project) return;
    const transition = motion.begin(elements.detail);
    state.projectId = project.id;
    state.index = null;
    state.documents = [];
    state.documentId = null;
    documentGate.invalidate();
    saveProjectId(project.id);
    renderProjects();
    renderDocumentNavigation();
    updateLocation();
    setStatus('');
    const request = indexGate.begin(project.id);
    try {
      const index = await api(`/api/v1/projects/${encodeURIComponent(project.id)}/architecture/index`);
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
      await loadDocument(state.documentId, { silent: true });
    } catch (error) {
      if (!indexGate.isCurrent(request, state.projectId)) return;
      setStatus('');
      if (error.code === 'architecture-not-found') emptyDetail('아키텍처 문서 없음');
      else emptyDetail('아키텍처를 읽을 수 없음', error.message);
    } finally {
      motion.finish(transition);
    }
  }

  async function loadProjects() {
    setStatus('등록 프로젝트를 읽는 중입니다.');
    try {
      state.projects = (await api('/api/v1/projects')).projects || [];
      const requestedProjectId = query.get('project') || savedProjectId();
      state.projectId = core.initialProjectId(state.projects, requestedProjectId);
      renderProjects();
      if (!state.projectId || selectedProject()?.availability !== 'available') {
        setStatus('');
        emptyDetail('사용 가능한 프로젝트 없음');
        return;
      }
      await loadArchitecture(state.projectId, query.get('document'));
    } catch (error) {
      state.projects = [];
      renderProjects();
      setStatus('');
      emptyDetail('프로젝트를 읽을 수 없음', error.message);
    }
  }

  const navigationToggle = document.getElementById('architecture-panel-toggle');
  function collapseNavigation(collapsed, remember = true) {
    if (remember) motion.sidebar(collapsed);
    document.querySelector('.architecture-layout').classList.toggle('navigation-collapsed', collapsed);
    navigationToggle.setAttribute('aria-expanded', String(!collapsed));
    navigationToggle.setAttribute('aria-label', collapsed ? '탐색 메뉴 펼치기' : '탐색 메뉴 접기');
    navigationToggle.title = navigationToggle.getAttribute('aria-label');
    navigationToggle.querySelector('.nav-label').textContent = collapsed ? '메뉴 펼치기' : '메뉴 접기';
  }
  navigationToggle.addEventListener('click', () => collapseNavigation(navigationToggle.getAttribute('aria-expanded') === 'true'));
  document.getElementById('architecture-project-shortcut').addEventListener('click', () => {
    collapseNavigation(false);
    elements.project.focus();
  });
  globalThis.addEventListener('resize', () => {
    collapseNavigation(!globalThis.matchMedia('(max-width: 760px)').matches
      && document.documentElement.dataset.sidebar === 'collapsed', false);
  });
  elements.project.addEventListener('change', () => loadArchitecture(elements.project.value));
  elements.refresh.addEventListener('click', () => loadArchitecture(state.projectId, state.documentId));
  elements.documents.addEventListener('click', (event) => {
    const link = event.target.closest('[data-document-id]');
    if (!link) return;
    event.preventDefault();
    loadDocument(link.dataset.documentId);
  });
  elements.detail.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-architecture-link="true"]');
    if (!link) return;
    const target = new URL(link.href).searchParams.get('document');
    if (!target) return;
    event.preventDefault();
    loadDocument(target);
  });
  globalThis.addEventListener('popstate', () => {
    const params = new URLSearchParams(globalThis.location.search);
    const projectId = params.get('project');
    const documentId = params.get('document');
    if (projectId && projectId !== state.projectId) {
      loadArchitecture(projectId, documentId);
    } else if (documentId && documentId !== state.documentId) {
      loadDocument(documentId);
    }
  });

  applySavedAppearance();
  collapseNavigation(!globalThis.matchMedia('(max-width: 760px)').matches
    && document.documentElement.dataset.sidebar === 'collapsed', false);
  loadProjects();
}());
