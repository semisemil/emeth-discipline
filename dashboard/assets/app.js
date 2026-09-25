'use strict';

(function startDashboard() {
  const core = globalThis.EmethDashboardCore;
  const motion = globalThis.EmethMotion;
  if (!core) return;

  const STORAGE = Object.freeze({
    accent: 'emeth.dashboard.accent',
    background: 'emeth.dashboard.background',
    project: 'emeth.dashboard.project',
    theme: 'emeth.dashboard.theme',
  });
  const state = {
    projects: [],
    selectedProjectId: null,
    index: null,
    view: 'work',
    globalSearch: '',
    projectSearch: '',
    issueQuick: 'active',
    issueType: 'all',
    issueStatus: 'all',
    issueRisk: 'all',
    issueSort: 'id-asc',
    workScrollLeft: 0,
    documentKind: 'all',
    documentStatus: 'all',
    documentSort: 'date-desc',
    workListCollapsed: false,
    documentListCollapsed: false,
    expandedIssues: new Set(),
    selectedDocument: null,
    documents: new Map(),
    documentErrors: new Map(),
    loading: false,
    notice: null,
    error: null,
    health: null,
    expectedVersion: new URLSearchParams(globalThis.location.search).get('expected_version'),
    requestedProjectId: new URLSearchParams(globalThis.location.search).get('project'),
    projectPanelCollapsed: document.documentElement.dataset.sidebar === 'collapsed',
    projectTransition: null,
    drawerOpen: false,
    drawerReturnFocus: null,
    backgroundUrl: null,
  };
  const indexRequestGate = core.createLatestRequestGate();
  const documentRequestGate = core.createDocumentRequestGate();

  const byId = (id) => document.getElementById(id);
  const elements = {
    shell: byId('app-shell'),
    workspace: document.querySelector('.workspace'),
    skipLink: document.querySelector('.skip-link'),
    panel: byId('project-panel'),
    projectList: byId('project-list'),
    projectSearch: byId('project-search'),
    currentProject: byId('current-project'),
    currentProjectPath: byId('current-project-path'),
    projectCount: byId('project-count'),
    viewTitle: byId('view-title'),
    globalSearch: byId('global-search'),
    refresh: byId('refresh-button'),
    tabs: byId('view-tabs'),
    viewPanel: byId('view-panel'),
    status: byId('status-stack'),
    menu: byId('menu-button'),
    panelToggle: byId('panel-toggle'),
    close: byId('drawer-close'),
    scrim: byId('drawer-scrim'),
    theme: byId('theme-button'),
    backgroundMode: byId('background-mode'),
    background: byId('background-button'),
    backgroundFile: byId('background-file'),
    accent: byId('accent-color'),
    architectureLink: byId('architecture-link'),
  };

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(text, className) {
    const node = make('button', className, text);
    node.type = 'button';
    return node;
  }

  function selectedProject() {
    return state.projects.find((project) => project.id === state.selectedProjectId) || null;
  }

  function updateProjectLocation(projectId) {
    const params = new URLSearchParams();
    if (state.expectedVersion) params.set('expected_version', state.expectedVersion);
    if (projectId) params.set('project', projectId);
    const suffix = params.size ? `?${params}` : '';
    globalThis.history.replaceState(null, '', `/dashboard${suffix}`);
    if (elements.architectureLink) {
      const architectureParams = new URLSearchParams();
      if (projectId) architectureParams.set('project', projectId);
      elements.architectureLink.href = `/architecture${architectureParams.size ? `?${architectureParams}` : ''}`;
    }
  }

  function readableError(error, fallback) {
    const messages = {
      'registry-invalid': '프로젝트 레지스트리를 읽을 수 없습니다. 설정 파일을 확인하세요.',
      'project-unavailable': '프로젝트를 읽을 수 없습니다. 등록된 경로를 확인하세요.',
      'record-not-found': '요청한 문서를 더 이상 찾을 수 없습니다. 다시 읽어 주세요.',
      'project-available': '사용 가능한 프로젝트는 목록에서 지울 수 없습니다.',
      'version-mismatch': '실행 서버 버전이 열려고 한 버전과 다릅니다. 서버를 재시작해야 합니다.',
    };
    return messages[error?.code] || error?.message || fallback;
  }

  function errorTitle(error) {
    if (error?.code === 'server-unreachable') return '서버 연결 끊김';
    if (error?.code?.startsWith('registry-')) return '프로젝트 레지스트리 오류';
    if (error?.code?.startsWith('project-')) return '프로젝트 오류';
    if (error?.code?.startsWith('record-')) return '문서 오류';
    return '오류';
  }

  async function api(path, options = {}) {
    let response;
    try {
      response = await fetch(path, {
        ...options,
        headers: { Accept: 'application/json', ...(options.headers || {}) },
      });
    } catch (cause) {
      const error = new Error('서버 연결이 끊겼습니다. Emeth Discipline 서버 상태를 확인하세요.', { cause });
      error.code = 'server-unreachable';
      throw error;
    }
    if (!response.ok) {
      let detail;
      try {
        detail = await response.json();
      } catch {
        detail = null;
      }
      const error = new Error(detail?.error?.message || '요청을 처리하지 못했습니다.');
      error.code = detail?.error?.code || `http-${response.status}`;
      error.status = response.status;
      throw error;
    }
    if (response.status === 204) return null;
    return response.json();
  }

  function setLoading(loading, notice) {
    state.loading = loading;
    state.notice = notice || null;
    updateContext();
    renderStatus();
  }

  function setError(error, fallback) {
    state.error = error ? { code: error.code, message: readableError(error, fallback) } : null;
    renderStatus();
  }

  function renderStatus() {
    elements.status.replaceChildren();
    if (state.expectedVersion && state.health && state.expectedVersion !== state.health.version) {
      const version = make('section', 'status-message status-warning');
      version.setAttribute('role', 'alert');
      version.append(
        make('strong', '', '서버 재시작 필요'),
        make('span', '', `요청 버전 ${state.expectedVersion}, 실행 버전 ${state.health.version}`),
      );
      elements.status.append(version);
    }
    if (state.error) {
      const error = make('section', 'status-message status-error');
      error.setAttribute('role', 'alert');
      error.append(make('strong', '', errorTitle(state.error)), make('span', '', state.error.message));
      elements.status.append(error);
    } else if (!state.projectTransition && (state.loading || state.notice)) {
      const info = make('section', 'status-message');
      info.setAttribute('role', 'status');
      info.append(make('strong', '', state.loading ? '읽는 중' : '상태'), make('span', '', state.notice || '최신 상태입니다.'));
      elements.status.append(info);
    }
  }

  async function loadProjects(options = {}) {
    setLoading(true, options.notice || '등록 프로젝트를 읽습니다.');
    setError(null);
    try {
      state.projects = (await api('/api/v1/projects')).projects || [];
      state.selectedProjectId = core.initialProjectId(
        state.projects,
        options.keepSelection
          ? state.selectedProjectId
          : state.requestedProjectId || localStorage.getItem(STORAGE.project),
      );
      renderProjects();
      const project = selectedProject();
      if (!project) {
        state.index = null;
        state.loading = false;
        state.notice = null;
        updateContext();
        renderStatus();
        renderView();
        return;
      }
      await selectProject(project.id, { focusReturn: false, save: false });
    } catch (error) {
      state.projects = [];
      state.index = null;
      state.loading = false;
      setError(error, '등록 프로젝트를 읽지 못했습니다.');
      renderProjects();
      updateContext();
      renderView();
    }
  }

  async function loadIndex(refresh = false, updateProjects = false) {
    if (updateProjects && state.projectTransition) return;
    const project = selectedProject();
    if (!project || project.availability !== 'available') {
      state.index = null;
      state.loading = false;
      state.notice = null;
      renderStatus();
      renderView();
      return;
    }
    const requestProjectId = project.id;
    const request = indexRequestGate.begin(requestProjectId);
    const previousReadAt = state.index?.read_at || null;
    let reloadDocument = null;
    if (!updateProjects || refresh) {
      setLoading(true, refresh ? '프로젝트 원본을 다시 읽습니다.' : '프로젝트 작업을 읽습니다.');
      setError(null);
    }
    try {
      const [index, projectList] = await Promise.all([
        api(`/api/v1/projects/${requestProjectId}/index${refresh ? '?refresh=1' : ''}`),
        refresh || updateProjects ? api('/api/v1/projects') : null,
      ]);
      if (!indexRequestGate.isCurrent(request, state.selectedProjectId)) return;
      if (projectList) state.projects = projectList.projects || [];
      const projectPosition = state.projects.findIndex((item) => item.id === requestProjectId);
      if (projectPosition >= 0) {
        state.projects[projectPosition] = { ...state.projects[projectPosition], ...index.project };
      }
      if (refresh || previousReadAt !== index.read_at) {
        documentRequestGate.invalidate();
        state.documents.clear();
        state.documentErrors.clear();
        reloadDocument = index.project.availability === 'available'
          ? state.selectedDocument
          : null;
      }
      state.index = index;
      state.error = null;
      state.loading = false;
      state.notice = refresh ? '프로젝트를 다시 읽었습니다.' : null;
    } catch (error) {
      if (!indexRequestGate.isCurrent(request, state.selectedProjectId)) return;
      state.index = null;
      state.loading = false;
      setError(error, '프로젝트 작업을 읽지 못했습니다.');
    }
    renderStatus();
    updateContext();
    renderProjects();
    renderView();
    if (reloadDocument && reloadDocument === state.selectedDocument) {
      const separator = reloadDocument.indexOf(':');
      await openDocument(
        reloadDocument.slice(0, separator),
        reloadDocument.slice(separator + 1),
        { force: true },
      );
    }
  }

  async function selectProject(projectId, options = {}) {
    const project = state.projects.find((item) => item.id === projectId);
    if (!project) return;
    if (state.selectedProjectId === projectId && state.index && !state.loading) {
      if (isMobile()) closeDrawer(options.focusReturn !== false);
      return;
    }
    const transition = motion.begin(elements.viewPanel);
    state.projectTransition = transition;
    const mobile = isMobile();
    const focusKey = core.projectSelectionFocusKey(project.id, globalThis.innerWidth);
    indexRequestGate.invalidate();
    state.selectedProjectId = project.id;
    state.index = null;
    state.expandedIssues.clear();
    state.selectedDocument = null;
    documentRequestGate.invalidate();
    state.documents.clear();
    state.documentErrors.clear();
    if (options.save !== false) localStorage.setItem(STORAGE.project, project.id);
    state.requestedProjectId = project.id;
    updateProjectLocation(project.id);
    if (mobile) closeDrawer(options.focusReturn !== false);
    renderProjects(focusKey);
    updateContext();
    try {
      if (project.availability === 'available') {
        await loadIndex(false);
      } else {
        state.loading = false;
        state.notice = null;
        setError(null);
        renderStatus();
        renderView();
      }
    } finally {
      if (state.projectTransition === transition) state.projectTransition = null;
      motion.finish(transition);
    }
  }

  async function forgetUnavailable() {
    const project = selectedProject();
    if (!project || project.availability !== 'unavailable') return;
    const confirmed = globalThis.confirm(`“${project.name}”을 등록 목록에서 지울까요?\n프로젝트 파일은 삭제하지 않습니다.`);
    if (!confirmed) return;
    setLoading(true, '사용할 수 없는 프로젝트를 목록에서 지웁니다.');
    try {
      await api(`/api/v1/projects/${project.id}`, { method: 'DELETE' });
      state.selectedProjectId = null;
      localStorage.removeItem(STORAGE.project);
      await loadProjects({ notice: '프로젝트를 목록에서 지웠습니다.' });
    } catch (error) {
      state.loading = false;
      setError(error, '프로젝트를 목록에서 지우지 못했습니다.');
    }
  }

  function updateContext() {
    const project = selectedProject();
    elements.currentProject.textContent = project ? project.name : '선택 안 됨';
    elements.currentProject.title = project?.root || '';
    elements.currentProjectPath.textContent = project?.root || '';
    elements.currentProjectPath.title = project?.root || '';
    elements.projectCount.textContent = String(state.projects.length);
    elements.viewTitle.textContent = { work: '작업 현황', documents: '프로젝트 문서', flow: '흐름 점검' }[state.view];
    document.title = `${elements.viewTitle.textContent} · Emeth Discipline`;
    const available = project?.availability === 'available';
    elements.globalSearch.disabled = !available;
    elements.refresh.disabled = !available || state.loading;
  }

  function renderProjects(focusKey = document.activeElement?.dataset?.focusKey || null) {
    const projects = core.projectOptions(state.projects, state.projectSearch);
    elements.projectList.replaceChildren();
    if (projects.length === 0) {
      elements.projectList.append(make('p', 'project-list-empty', state.projects.length ? '검색 결과 없음' : '등록 프로젝트 없음'));
      updateContext();
      return;
    }
    for (const project of projects) {
      const option = button('', 'project-option');
      option.dataset.activity = project.availability !== 'available' ? 'unavailable'
        : project.counts?.active > 0 ? 'active' : project.counts?.blocked > 0 ? 'blocked' : 'idle';
      option.dataset.projectId = project.id;
      option.dataset.focusKey = `project:${project.id}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(project.id === state.selectedProjectId));
      if (project.id === state.selectedProjectId) option.setAttribute('aria-current', 'true');
      const name = make('span', 'project-name', project.name);
      const availability = project.availability === 'available' ? '사용 가능' : '사용 불가';
      const counts = project.availability === 'available'
        ? `활성 ${project.counts?.active ?? 0} · 보류 ${project.counts?.blocked ?? 0}`
        : '경로 확인 필요';
      const cueValue = core.projectRailCue(project, state.projects);
      const cue = make('span', 'project-rail-cue');
      cue.setAttribute('aria-hidden', 'true');
      cue.append(make('span', 'rail-cue-primary', cueValue.primary));
      if (cueValue.secondary) cue.append(make('span', 'rail-cue-secondary', cueValue.secondary));
      const indicator = make('span', 'project-indicator');
      indicator.setAttribute('aria-hidden', 'true');
      if (project.availability !== 'available') indicator.textContent = '!';
      cue.append(indicator);
      option.setAttribute('aria-label', `${project.name}, ${availability}, ${counts}${project.latest_issue ? `, 최근 작업 ${project.latest_issue.title}` : ''}, 경로 ${project.root}`);
      const copy = make('span', 'project-copy');
      const heading = make('span', 'project-option-heading');
      heading.append(name);
      if (project.counts?.active) {
        const activeCount = make('span', 'project-active-count', String(project.counts.active));
        activeCount.title = `활성 작업 ${project.counts.active}개`;
        heading.append(activeCount);
      }
      copy.append(heading);
      if (project.availability !== 'available') {
        copy.append(make('span', 'project-latest availability-unavailable', '경로 확인 필요'));
      } else {
        const latest = make('span', 'project-latest', project.latest_issue?.title || '등록된 작업 없음');
        latest.title = project.latest_issue ? `${project.latest_issue.id} · ${formatDate(project.latest_issue.created_at)} 등록` : '';
        copy.append(latest);
      }
      if (project.counts?.blocked) copy.append(make('span', 'project-blocked', `보류 ${project.counts.blocked}`));
      if (state.projects.some((peer) => peer.id !== project.id && peer.name === project.name)) {
        copy.append(make('span', 'project-root', project.root));
      }
      option.append(cue, copy);
      option.title = `${project.name}\n${project.root}\n${availability}, ${counts}`;
      option.addEventListener('click', () => selectProject(project.id));
      elements.projectList.append(option);
    }
    updateContext();
    core.restoreFocusByKey(elements.projectList, focusKey);
  }

  function controlGroup(title, className) {
    const fieldset = make('fieldset', `filter-group ${className || ''}`.trim());
    fieldset.append(make('legend', '', title));
    return fieldset;
  }

  function selectControl(label, value, options, onChange, focusKey) {
    const wrapper = make('label', 'select-control');
    wrapper.append(make('span', '', label));
    const select = document.createElement('select');
    select.dataset.focusKey = focusKey;
    for (const [optionValue, optionLabel] of options) {
      const option = make('option', '', optionLabel);
      option.value = optionValue;
      option.selected = optionValue === value;
      select.append(option);
    }
    select.addEventListener('change', () => onChange(select.value));
    wrapper.append(select);
    return wrapper;
  }

  function renderWork() {
    const fragment = document.createDocumentFragment();
    const controls = make('section', 'filters', '');
    controls.setAttribute('aria-label', '작업 필터');
    const quick = controlGroup('프로젝트 전체 작업 · 상태별 보기', 'quick-filter');
    for (const [value, label] of [['active', '활성'], ['blocked', '보류'], ['completed-group', '완료'], ['all', '전체']]) {
      const count = core.selectIssues(state.index, { quick: value }).length;
      const item = button('', 'segmented-button');
      item.dataset.quick = value;
      item.dataset.empty = String(count === 0);
      item.append(make('span', 'metric-label', label), make('strong', 'metric-value', String(count)));
      item.setAttribute('aria-label', `${label} ${count}개 · 프로젝트 전체`);
      item.dataset.focusKey = `work:quick:${value}`;
      item.setAttribute('aria-pressed', String(state.issueQuick === value));
      item.addEventListener('click', () => { state.issueQuick = value; renderView(); });
      quick.append(item);
    }
    const category = controlGroup('유형', 'axis-filter');
    category.append(selectControl('유형', state.issueType, [
      ['all', '전체 유형'],
      ...Object.entries(core.ISSUE_TYPES),
    ], (value) => { state.issueType = value; renderView(); }, 'work:type'));
    const status = controlGroup('상태', 'axis-filter');
    status.append(selectControl('상태', state.issueStatus, [
      ['all', '전체 상태'],
      ...['open', 'doing', 'blocked', 'resolved', 'cancelled', 'superseded'].map((value) => [value, core.STATUSES[value]]),
    ], (value) => { state.issueStatus = value; renderView(); }, 'work:status'));
    const risk = controlGroup('위험도', 'axis-filter');
    risk.append(selectControl('위험도', state.issueRisk, [
      ['all', '전체 위험도'],
      ...Object.entries(core.RISKS),
    ], (value) => { state.issueRisk = value; renderView(); }, 'work:risk'));
    controls.append(category, status, risk);
    const toolbar = make('div', 'work-toolbar');
    toolbar.append(quick, controls);
    fragment.append(toolbar);

    const issues = core.selectIssues(state.index, {
      search: state.globalSearch,
      quick: state.issueQuick,
      type: state.issueType,
      status: state.issueStatus,
      risk: state.issueRisk,
      sort: state.issueSort,
    });
    const heading = make('div', 'section-heading');
    const headingText = make('div', 'section-heading-text');
    headingText.append(make('h2', '', '작업 목록'), make('p', '', `${issues.length}개 표시`));
    const listToggle = button(state.workListCollapsed ? '›' : '‹', 'icon-button list-toggle');
    const toggleLabel = state.workListCollapsed ? '작업 목록 펼치기' : '작업 목록 접기';
    listToggle.dataset.focusKey = 'work:list-toggle';
    listToggle.dataset.tooltip = toggleLabel;
    listToggle.setAttribute('aria-label', toggleLabel);
    listToggle.setAttribute('aria-controls', 'work-list');
    listToggle.setAttribute('aria-expanded', String(!state.workListCollapsed));
    listToggle.addEventListener('click', () => {
      state.workListCollapsed = !state.workListCollapsed;
      renderView('work:list-toggle');
    });
    heading.append(headingText, listToggle);
    fragment.append(heading);
    const listContent = make('div', 'collapsible-list-content');
    listContent.id = 'work-list';
    listContent.hidden = state.workListCollapsed;
    if (issues.length === 0) {
      listContent.append(emptyState(state.index.issues?.length ? '검색 결과 없음' : '등록된 작업 없음'));
    } else {
      const wrap = make('div', 'issue-table-wrap');
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', '작업 목록 표');
      const table = make('table', 'issue-table');
      table.append(make('caption', 'visually-hidden', '열 제목을 눌러 정렬할 수 있는 작업 목록'));
      const head = make('thead');
      const header = make('tr');
      for (const [field, label] of [['id', 'ID'], ['title', '작업'], ['type', '유형'], ['status', '상태'], ['risk', '위험도'], ['date', '변경일']]) {
        const cell = make('th', `issue-column-${field}`);
        cell.scope = 'col';
        const [currentField, direction] = state.issueSort.split('-');
        const selected = currentField === field;
        cell.setAttribute('aria-sort', selected ? (direction === 'asc' ? 'ascending' : 'descending') : 'none');
        const sort = button('', 'column-sort');
        sort.dataset.focusKey = `work:sort:${field}`;
        const next = selected ? (direction === 'asc' ? 'desc' : 'asc') : (field === 'date' ? 'desc' : 'asc');
        const orderLabel = field === 'risk' ? (next === 'asc' ? '높은순' : '낮은순')
          : (next === 'asc' ? '오름차순' : '내림차순');
        sort.setAttribute('aria-label', `${label}, ${orderLabel} 정렬`);
        sort.title = sort.getAttribute('aria-label');
        const arrow = make('span', 'sort-indicator', selected ? (direction === 'asc' ? '↑' : '↓') : '↕');
        arrow.setAttribute('aria-hidden', 'true');
        sort.append(make('span', '', label), arrow);
        sort.addEventListener('click', () => { state.issueSort = `${field}-${next}`; renderView(); });
        cell.append(sort);
        header.append(cell);
      }
      head.append(header);
      const body = make('tbody');
      for (const issue of issues) body.append(renderIssue(issue));
      table.append(head, body);
      wrap.append(table);
      listContent.append(wrap);
    }
    fragment.append(listContent);
    fragment.append(renderDiagnostics());
    return fragment;
  }

  function renderIssue(issue) {
    const expanded = state.expandedIssues.has(issue.id);
    const fragment = document.createDocumentFragment();
    const row = make('tr', expanded ? 'issue-row is-expanded' : 'issue-row');
    row.dataset.issueId = issue.id;
    const toggle = button('', 'issue-toggle');
    toggle.dataset.focusKey = `work:issue:${issue.id}`;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-controls', `issue-detail-${issue.id}`);
    const chevron = make('span', 'issue-chevron', '›');
    chevron.setAttribute('aria-hidden', 'true');
    toggle.append(chevron, make('span', 'issue-title', issue.title));
    function toggleIssue() {
      if (expanded) state.expandedIssues.delete(issue.id);
      else state.expandedIssues.add(issue.id);
      renderView(`work:issue:${issue.id}`);
      if (!expanded) animateEntrance(byId(`issue-detail-${issue.id}`)?.firstElementChild);
    }
    toggle.addEventListener('click', toggleIssue);
    row.addEventListener('click', (event) => { if (!event.target.closest('button')) toggleIssue(); });
    const title = make('td', 'issue-column-title');
    title.append(toggle);
    row.append(make('td', 'issue-id', issue.id), title);
    const fields = [
      ['type', '유형', core.ISSUE_TYPES[issue.type] || issue.type, 'issue-type'],
      ['status', '상태', core.STATUSES[issue.status] || issue.status, `issue-status status-${issue.status}`],
      ['risk', '위험도', core.RISKS[issue.risk] || issue.risk, `issue-risk risk-${issue.risk}`],
    ];
    for (const [field, , value, className] of fields) {
      const cell = make('td', `issue-cell-${field}`);
      cell.append(make('span', className, value));
      row.append(cell);
    }
    const date = make('td', 'issue-date');
    const time = make('time', '', formatDate(issue.updated_at));
    if (issue.updated_at) time.dateTime = issue.updated_at;
    date.append(time);
    row.append(date);
    const detailRow = make('tr', 'issue-detail-row');
    detailRow.hidden = !expanded;
    const detailCell = make('td');
    detailCell.colSpan = 6;
    detailCell.id = `issue-detail-${issue.id}`;
    if (expanded) {
      const detail = make('div', 'issue-detail');
      const metadata = make('dl', 'issue-compact-metadata');
      for (const [field, label, value, className] of fields) {
        if (field === 'status') continue;
        const pair = make('div');
        const description = make('dd');
        description.append(make('span', className, value));
        pair.append(make('dt', '', label), description);
        metadata.append(pair);
      }
      const updated = make('div');
      const updatedValue = make('dd');
      updatedValue.append(time.cloneNode(true));
      updated.append(make('dt', '', '변경일'), updatedValue);
      metadata.append(updated);
      detail.append(metadata, detailField('현재 상태', issue.current_summary || '기록 없음'),
        detailField('다음 행동', issue.next_action || '기록 없음'), renderIssueFlow(issue));
      detailCell.append(detail);
    }
    detailRow.append(detailCell);
    fragment.append(row, detailRow);
    return fragment;
  }

  function detailField(label, value) {
    const item = make('section', 'detail-field');
    item.append(make('h3', '', label), make('p', '', value));
    return item;
  }

  function renderIssueFlow(issue) {
    const section = make('section', 'issue-flow');
    section.append(make('h3', '', '연결 문서'));
    const chain = make('dl', 'linked-documents');
    for (const [kind, ids] of [['design', issue.design_ids || []], ['plan', issue.plan_ids || []], ['spec', issue.spec_ids || []]]) {
      chain.append(make('dt', '', ({ design: '설계', plan: '기존 플랜', spec: '기존 스펙' })[kind]));
      const group = make('dd');
      if (ids.length === 0) {
        group.append(make('span', 'linked-document-empty', '연결 없음'));
      } else {
        for (const id of ids) {
          const record = state.index[({ design: 'designs', plan: 'plans', spec: 'specs' })[kind]]?.find((item) => item.id === id);
          const link = button('', 'text-link linked-document');
          link.append(make('span', 'linked-document-id', id), make('span', '', record?.title || '문서를 찾을 수 없음'));
          link.addEventListener('click', () => openDocument(kind, id));
          group.append(link);
        }
      }
      chain.append(group);
    }
    section.append(chain);
    const signals = core.signalLabels(issue.flow_signal_ids);
    if (signals.length) section.append(make('p', 'flow-state-text', `흐름 상태: ${signals.join(', ')}`));
    return section;
  }

  function renderDocuments() {
    const fragment = document.createDocumentFragment();
    const controls = make('section', 'filters document-filters');
    controls.setAttribute('aria-label', '문서 필터와 정렬');
    const kind = controlGroup('종류', 'axis-filter');
    kind.append(selectControl('종류', state.documentKind, [['all', '전체 문서'], ['design', '설계'], ['plan', '기존 플랜'], ['spec', '기존 스펙']], (value) => {
      state.documentKind = value; renderView();
    }, 'documents:kind'));
    const status = controlGroup('상태', 'axis-filter');
    status.append(selectControl('원본 상태', state.documentStatus, [
      ['all', '전체 상태'], ['draft', '초안'], ['ready', '준비됨'], ['blocked', '보류'],
      ['completed', '완료'], ['cancelled', '취소'], ['superseded', '대체됨'],
    ], (value) => { state.documentStatus = value; renderView(); }, 'documents:status'));
    const sorting = controlGroup('정렬', 'sort-filter');
    sorting.append(selectControl('정렬 기준', state.documentSort, [
      ['date-desc', '최근 변경순'], ['date-asc', '오래된 변경순'], ['id-asc', 'ID 오름차순'], ['id-desc', 'ID 내림차순'],
    ], (value) => { state.documentSort = value; renderView(); }, 'documents:sort'));
    controls.append(kind, status, sorting);
    fragment.append(controls);
    const documents = core.selectDocuments(state.index, {
      search: state.globalSearch,
      kind: state.documentKind,
      status: state.documentStatus,
      sort: state.documentSort,
    });
    const layout = make('div', state.documentListCollapsed ? 'document-layout is-list-collapsed' : 'document-layout');
    const listRegion = make('section', state.documentListCollapsed ? 'document-list-region is-collapsed' : 'document-list-region');
    const heading = make('div', 'section-heading');
    const headingText = make('div', 'section-heading-text');
    headingText.append(make('h2', '', '문서'), make('p', '', `${documents.length}개 표시`));
    const listToggle = button(state.documentListCollapsed ? '›' : '‹', 'icon-button list-toggle');
    const toggleLabel = state.documentListCollapsed ? '문서 목록 펼치기' : '문서 목록 접기';
    listToggle.dataset.focusKey = 'documents:list-toggle';
    listToggle.dataset.tooltip = toggleLabel;
    listToggle.setAttribute('aria-label', toggleLabel);
    listToggle.setAttribute('aria-controls', 'document-list');
    listToggle.setAttribute('aria-expanded', String(!state.documentListCollapsed));
    listToggle.addEventListener('click', () => {
      state.documentListCollapsed = !state.documentListCollapsed;
      renderView('documents:list-toggle');
    });
    heading.append(headingText, listToggle);
    listRegion.append(heading);
    const list = make('div', 'document-list');
    list.id = 'document-list';
    list.hidden = state.documentListCollapsed;
    if (documents.length === 0) {
      list.append(emptyState((state.index.designs?.length || state.index.plans?.length || state.index.specs?.length) ? '검색 결과 없음' : '등록된 문서 없음'));
    } else {
      for (const item of documents) list.append(renderDocumentOption(item));
    }
    listRegion.append(list);
    layout.append(listRegion, renderDocumentDetail());
    fragment.append(layout, renderDiagnostics());
    return fragment;
  }

  function renderDocumentOption(item) {
    const key = `${item.document_kind}:${item.id}`;
    const selected = state.selectedDocument === key;
    const option = button('', 'document-option');
    option.dataset.focusKey = core.documentOptionFocusKey(item.document_kind, item.id);
    option.setAttribute('aria-pressed', String(selected));
    const identity = make('span', 'document-identity');
    option.dataset.kind = item.document_kind;
    const kind = make('span', `document-kind kind-${item.document_kind}`, ({ design: '설계', plan: '기존 플랜', spec: '기존 스펙' })[item.document_kind]);
    const kindIcon = make('span', `nav-symbol ${item.document_kind === 'plan' ? 'icon-plan' : 'icon-document'}`);
    kindIcon.setAttribute('aria-hidden', 'true');
    kind.prepend(kindIcon);
    identity.append(kind, make('strong', '', item.id));
    const related = core.relatedState(item);
    option.append(
      identity,
      make('span', 'document-title', item.title),
      make('span', `document-state status-${item.status}`, core.STATUSES[item.status] || item.status),
    );
    if (item.revision) option.append(make('span', 'document-revision', `v${item.revision}`));
    if (item.superseded_by) option.append(make('span', 'document-related', `승계: ${item.superseded_by}`));
    if ((item.related_issues?.length || item.linked_issue_ids?.length)) {
      option.append(make('span', related.mismatch ? 'document-related mismatch' : 'document-related', related.label));
    }
    option.addEventListener('click', () => openDocument(item.document_kind, item.id));
    return option;
  }

  function renderDocumentDetail() {
    const region = make('article', 'document-detail');
    region.setAttribute('aria-label', '문서 본문');
    if (!state.selectedDocument) {
      region.append(emptyState('문서를 선택하세요'));
      return region;
    }
    const documentError = state.documentErrors.get(state.selectedDocument);
    if (documentError) {
      region.append(emptyState('문서를 읽을 수 없음', documentError.message));
      return region;
    }
    const detail = state.documents.get(state.selectedDocument);
    if (!detail) {
      region.append(emptyState('불러오는 중'));
      return region;
    }
    const header = make('header', 'document-detail-header');
    header.append(
      make('p', `eyebrow kind-${detail.kind}`, ({ design: '설계', plan: '기존 플랜', spec: '기존 스펙' })[detail.kind]),
      make('h2', '', detail.title),
      make('p', 'document-path', detail.relative_path),
    );
    const metadata = make('dl', 'metadata-list');
    const entries = [
      ['ID', detail.id],
      ['상태', core.STATUSES[detail.status] || detail.status],
      ['최근 변경', formatDate(detail.updated_at)],
    ];
    if (detail.metadata?.revision) entries.push(['Revision', String(detail.metadata.revision)]);
    for (const [term, value] of entries) {
      metadata.append(make('dt', '', term), make('dd', '', value || '없음'));
    }
    const body = make('div', 'markdown-body');
    body.innerHTML = core.renderMarkdown(typeof detail.body === 'string' ? detail.body : '');
    region.append(header, metadata, body);
    return region;
  }

  async function renderMermaid(root = elements.viewPanel) {
    const mermaid = globalThis.mermaid;
    const codeBlocks = [...root.querySelectorAll('pre > code.language-mermaid')];
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
      state.notice = '일부 Mermaid 다이어그램을 코드로 표시합니다.';
      renderStatus();
    }
  }

  async function openDocument(kind, id, options = {}) {
    const project = selectedProject();
    if (!project) return;
    const requestProjectId = project.id;
    const requestKey = `${kind}:${id}`;
    const focusKey = core.documentOptionFocusKey(kind, id);
    state.view = 'documents';
    state.selectedDocument = requestKey;
    state.documentErrors.delete(requestKey);
    updateTabs();
    renderView(focusKey, 'documents:kind');
    if (!options.force && state.documents.has(requestKey)) return;
    state.documents.delete(requestKey);
    const documentRequest = documentRequestGate.begin(requestProjectId, requestKey);
    try {
      const detail = await api(`/api/v1/projects/${requestProjectId}/documents/${kind}/${id}`);
      const disposition = documentRequestGate.disposition(
        documentRequest,
        state.selectedProjectId,
        state.selectedDocument,
      );
      if (!disposition.cache) return;
      state.documents.set(requestKey, detail);
      state.documentErrors.delete(requestKey);
      if (!disposition.render) return;
      setError(null);
    } catch (error) {
      const disposition = documentRequestGate.disposition(
        documentRequest,
        state.selectedProjectId,
        state.selectedDocument,
      );
      if (!disposition.render) return;
      state.documentErrors.set(requestKey, {
        code: error.code,
        message: readableError(error, '문서 본문을 읽지 못했습니다.'),
      });
      setError(error, '문서 본문을 읽지 못했습니다.');
    }
    renderView(focusKey, 'documents:kind');
  }

  function renderFlow() {
    const fragment = document.createDocumentFragment();
    const signals = core.selectSignals(state.index, state.globalSearch);
    const heading = make('div', 'section-heading');
    heading.append(make('h2', '', '점검 항목'), make('p', '', `${signals.length}개`));
    fragment.append(heading);
    if (signals.length === 0) {
      fragment.append(emptyState('확인할 항목 없음'));
    } else {
      const list = make('div', 'signal-list');
      for (const signal of signals) {
        const article = make('article', `signal-card signal-${signal.signal}`);
        article.append(
          make('p', 'signal-name', core.SIGNALS[signal.signal] || signal.signal),
          make('h3', '', `${({ issue: '이슈', design: '설계', plan: '플랜', spec: '스펙' })[signal.target?.kind] || signal.target?.kind || '기록'} · ${signal.target?.id || '알 수 없음'}`),
          detailField('관찰된 상태', signal.observed),
          detailField('기본 다음 행동', signal.next_action),
        );
        list.append(article);
      }
      fragment.append(list);
    }
    fragment.append(renderDiagnostics());
    return fragment;
  }

  function renderDiagnostics() {
    const diagnostics = state.index?.diagnostics || [];
    const section = make('details', 'diagnostics');
    if (diagnostics.length === 0) {
      section.hidden = true;
      return section;
    }
    section.append(make('summary', '', `일부 기록 읽기 실패 · ${diagnostics.length}개`));
    const list = make('ul', '');
    for (const diagnostic of diagnostics) {
      const item = make('li', '');
      item.append(make('strong', '', diagnostic.relative_path), make('span', '', diagnostic.message || diagnostic.code));
      list.append(item);
    }
    section.append(list);
    return section;
  }

  function emptyState(title, message) {
    const empty = make('section', 'empty-state');
    empty.append(make('h2', '', title));
    if (message) empty.append(make('p', '', message));
    return empty;
  }

  function renderUnavailable(project) {
    const section = emptyState('프로젝트를 열 수 없습니다');
    section.classList.add('empty-unavailable');
    const path = make('details', 'unavailable-path');
    path.append(make('summary', '', '경로 확인'), make('p', 'unavailable-root', project.root));
    const forget = button('목록에서 지우기', 'danger-button');
    forget.addEventListener('click', forgetUnavailable);
    section.append(path, forget, make('p', 'consequence-text', '프로젝트 파일은 유지됩니다.'));
    return section;
  }

  function commitView(content, focusKey, fallbackFocusKey) {
    elements.viewPanel.append(content);
    const table = elements.viewPanel.querySelector('.issue-table-wrap');
    if (table) table.scrollLeft = state.workScrollLeft;
    core.restoreFocusByKey(elements.viewPanel, focusKey, fallbackFocusKey);
    renderMermaid();
  }

  function renderView(
    focusKey = document.activeElement?.closest('[data-focus-key]')?.dataset?.focusKey || null,
    fallbackFocusKey = null,
  ) {
    updateContext();
    if (state.projectTransition && state.loading) return;
    state.workScrollLeft = elements.viewPanel.querySelector('.issue-table-wrap')?.scrollLeft || 0;
    elements.viewPanel.replaceChildren();
    const project = selectedProject();
    if (!project) {
      commitView(emptyState('등록 프로젝트 없음', '이슈, 플랜 또는 스펙 추가 시 프로젝트가 등록됩니다.'), focusKey, fallbackFocusKey);
      return;
    }
    if (project.availability !== 'available') {
      commitView(renderUnavailable(project), focusKey, fallbackFocusKey);
      return;
    }
    if (state.loading && !state.index) {
      commitView(byId('loading-template').content.cloneNode(true), focusKey, fallbackFocusKey);
      return;
    }
    if (!state.index) {
      commitView(emptyState('프로젝트를 표시할 수 없음', '오류 상태를 확인한 뒤 다시 읽어 주세요.'), focusKey, fallbackFocusKey);
      return;
    }
    if (state.view === 'documents') commitView(renderDocuments(), focusKey, fallbackFocusKey);
    else if (state.view === 'flow') commitView(renderFlow(), focusKey, fallbackFocusKey);
    else commitView(renderWork(), focusKey, fallbackFocusKey);
  }

  function updateTabs() {
    const tabs = [...elements.tabs.querySelectorAll('[role="tab"]')];
    for (const tab of tabs) {
      const selected = tab.dataset.view === state.view;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected) elements.viewPanel.setAttribute('aria-labelledby', tab.id);
    }
  }

  function activateTab(view, focus = false) {
    state.view = view;
    updateTabs();
    renderView();
    animateEntrance(elements.viewPanel);
    if (focus) elements.tabs.querySelector(`[data-view="${view}"]`)?.focus();
  }

  function animateEntrance(node) {
    motion.enter(node);
  }

  function formatDate(value) {
    if (!value) return '날짜 없음';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) return String(value);
    return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(parsed);
  }

  function isMobile() {
    return globalThis.matchMedia('(max-width: 680px)').matches;
  }

  function setWorkspaceInert(inert) {
    elements.workspace.inert = inert;
    elements.skipLink.inert = inert;
    if (inert) elements.workspace.setAttribute('aria-hidden', 'true');
    else elements.workspace.removeAttribute('aria-hidden');
  }

  function drawerFocusables() {
    return [...elements.panel.querySelectorAll('button, input, select, textarea, summary, a[href], [tabindex]')]
      .filter((node) => !node.disabled
        && node.tabIndex >= 0
        && !node.hidden
        && node.getAttribute('aria-hidden') !== 'true'
        && node.getClientRects().length > 0);
  }

  function containDrawerFocus(event) {
    const focusables = drawerFocusables();
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables.at(-1);
    const active = document.activeElement;
    if (!elements.panel.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function setProjectPanelCollapsed(collapsed) {
    state.projectPanelCollapsed = Boolean(collapsed);
    motion.sidebar(state.projectPanelCollapsed);
    elements.shell.classList.toggle('project-panel-collapsed', state.projectPanelCollapsed);
    elements.panel.inert = false;
    elements.panel.removeAttribute('aria-hidden');
    elements.menu.setAttribute('aria-expanded', String(!state.projectPanelCollapsed));
    const label = state.projectPanelCollapsed ? '프로젝트 목록 펼치기' : '프로젝트 목록 접기';
    elements.menu.setAttribute('aria-label', label);
    elements.menu.dataset.tooltip = label;
    elements.panelToggle.setAttribute('aria-expanded', String(!state.projectPanelCollapsed));
    elements.panelToggle.setAttribute('aria-label', label);
    elements.panelToggle.title = label;
    elements.panelToggle.querySelector('.nav-label').textContent = state.projectPanelCollapsed ? '메뉴 펼치기' : '메뉴 접기';
  }

  function openDrawer() {
    if (!isMobile()) return;
    state.drawerReturnFocus = document.activeElement;
    state.drawerOpen = true;
    document.body.classList.add('drawer-open');
    elements.menu.setAttribute('aria-expanded', 'true');
    elements.menu.setAttribute('aria-label', '프로젝트 목록 닫기');
    elements.menu.dataset.tooltip = '프로젝트 목록 닫기';
    elements.panel.setAttribute('aria-hidden', 'false');
    elements.panel.inert = false;
    setWorkspaceInert(true);
    globalThis.requestAnimationFrame(() => {
      if (!state.drawerOpen || !isMobile()) return;
    globalThis.requestAnimationFrame(() => {
      if (!state.drawerOpen || !isMobile()) return;
      const firstProject = elements.projectList.querySelector('.project-option');
      (firstProject || elements.projectSearch).focus();
    });
    });
  }

  function closeDrawer(returnFocus = true) {
    state.drawerOpen = false;
    document.body.classList.remove('drawer-open');
    elements.menu.setAttribute('aria-expanded', 'false');
    elements.menu.setAttribute('aria-label', '프로젝트 목록 열기');
    elements.menu.dataset.tooltip = '프로젝트 목록 열기';
    setWorkspaceInert(false);
    if (isMobile()) {
      elements.panel.setAttribute('aria-hidden', 'true');
      elements.panel.inert = true;
    }
    const focusTarget = state.drawerReturnFocus?.isConnected ? state.drawerReturnFocus : elements.menu;
    state.drawerReturnFocus = null;
    if (returnFocus && isMobile()) focusTarget.focus();
  }

  function syncResponsiveState() {
    if (isMobile()) {
      elements.shell.classList.remove('project-panel-collapsed');
      elements.panel.inert = !state.drawerOpen;
      elements.panel.setAttribute('aria-hidden', String(!state.drawerOpen));
      elements.menu.setAttribute('aria-expanded', String(state.drawerOpen));
      const label = state.drawerOpen ? '프로젝트 목록 닫기' : '프로젝트 목록 열기';
      elements.menu.setAttribute('aria-label', label);
      elements.menu.dataset.tooltip = label;
    } else {
      state.drawerOpen = false;
      document.body.classList.remove('drawer-open');
      elements.panel.inert = false;
      setWorkspaceInert(false);
      setProjectPanelCollapsed(state.projectPanelCollapsed);
    }
  }

  function applyTheme(theme) {
    const resolved = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = resolved;
    localStorage.setItem(STORAGE.theme, resolved);
    const next = resolved === 'dark' ? '라이트' : '다크';
    elements.theme.setAttribute('aria-label', `${next} 테마로 전환`);
    elements.theme.dataset.tooltip = `${next} 테마로 전환`;
  }

  function applyAccent(value) {
    if (!/^#[0-9a-f]{6}$/i.test(value || '')) return;
    document.documentElement.style.setProperty('--accent', value);
    elements.accent.value = value;
    localStorage.setItem(STORAGE.accent, value);
  }

  function setBackgroundMode(mode) {
    const image = mode === 'image' && state.backgroundUrl;
    document.documentElement.dataset.background = image ? 'image' : 'color';
    localStorage.setItem(STORAGE.background, image ? 'image' : 'color');
    elements.backgroundMode.value = image ? 'image' : 'color';
    const label = state.backgroundUrl ? '배경 이미지 변경' : '배경 이미지 선택';
    elements.background.setAttribute('aria-label', label);
    elements.background.dataset.tooltip = label;
  }

  function openPreferenceDatabase() {
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(new Error('IndexedDB를 사용할 수 없습니다.'));
        return;
      }
      const request = indexedDB.open('emeth-dashboard', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('preferences');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function storeBackground(blob) {
    const database = await openPreferenceDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('preferences', 'readwrite');
      transaction.objectStore('preferences').put(blob, 'background-image');
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }

  async function readBackground() {
    const database = await openPreferenceDatabase();
    const blob = await new Promise((resolve, reject) => {
      const transaction = database.transaction('preferences', 'readonly');
      const request = transaction.objectStore('preferences').get('background-image');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return blob;
  }

  function applyBackgroundBlob(blob, activate = true) {
    if (!(blob instanceof Blob)) return;
    if (state.backgroundUrl) URL.revokeObjectURL(state.backgroundUrl);
    state.backgroundUrl = URL.createObjectURL(blob);
    document.documentElement.style.setProperty('--background-image', `url("${state.backgroundUrl}")`);
    if (activate) setBackgroundMode('image');
  }

  async function loadPreferences() {
    applyTheme(localStorage.getItem(STORAGE.theme) || 'light');
    applyAccent((localStorage.getItem(STORAGE.accent) || '').replace(/^#3459e6$/i, '#c93686') || '#c93686');
    const backgroundMode = localStorage.getItem(STORAGE.background) || 'color';
    try {
      const blob = await readBackground();
      if (blob) applyBackgroundBlob(blob, false);
    } catch {
      // Color background remains fully usable when IndexedDB is unavailable.
    }
    setBackgroundMode(backgroundMode);
  }

  function bindEvents() {
    elements.projectSearch.addEventListener('input', () => {
      state.projectSearch = elements.projectSearch.value;
      renderProjects();
    });
    elements.globalSearch.addEventListener('input', () => {
      state.globalSearch = elements.globalSearch.value;
      renderView();
    });
    elements.refresh.addEventListener('click', () => loadIndex(true));
    elements.menu.addEventListener('click', () => {
      if (isMobile()) openDrawer();
      else setProjectPanelCollapsed(!state.projectPanelCollapsed);
    });
    elements.panelToggle.addEventListener('click', () => setProjectPanelCollapsed(!state.projectPanelCollapsed));
    document.querySelector('.appearance-settings summary').addEventListener('click', () => {
      if (!isMobile() && state.projectPanelCollapsed) setProjectPanelCollapsed(false);
    });
    elements.close.addEventListener('click', () => closeDrawer(true));
    elements.scrim.addEventListener('click', () => closeDrawer(true));
    elements.tabs.addEventListener('click', (event) => {
      const tab = event.target.closest('[role="tab"]');
      if (tab) activateTab(tab.dataset.view);
    });
    elements.tabs.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = [...elements.tabs.querySelectorAll('[role="tab"]')];
      const current = tabs.indexOf(document.activeElement);
      let next = current;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else next = (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault();
      activateTab(tabs[next].dataset.view, true);
    });
    elements.projectList.addEventListener('keydown', (event) => {
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      const options = [...elements.projectList.querySelectorAll('.project-option')];
      const current = options.indexOf(document.activeElement);
      let next = current;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = options.length - 1;
      else next = Math.max(0, Math.min(options.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
      if (options[next]) {
        event.preventDefault();
        options[next].focus();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Tab' && state.drawerOpen && isMobile()) {
        containDrawerFocus(event);
        return;
      }
      if (event.key === 'Escape' && state.drawerOpen && event.target.tagName !== 'OPTION') closeDrawer(true);
    });
    elements.theme.addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
    elements.backgroundMode.addEventListener('change', () => {
      if (elements.backgroundMode.value === 'image' && !state.backgroundUrl) {
        elements.backgroundFile.click();
        elements.backgroundMode.value = document.documentElement.dataset.background;
        return;
      }
      setBackgroundMode(elements.backgroundMode.value);
    });
    elements.background.addEventListener('click', () => elements.backgroundFile.click());
    elements.backgroundFile.addEventListener('change', async () => {
      const file = elements.backgroundFile.files?.[0];
      if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return;
      try {
        await storeBackground(file);
        applyBackgroundBlob(file);
        state.notice = '배경 이미지를 이 브라우저에 저장했습니다.';
        renderStatus();
      } catch (error) {
        setError(error, '배경 이미지를 저장하지 못했습니다.');
      }
      elements.backgroundFile.value = '';
    });
    elements.accent.addEventListener('input', () => applyAccent(elements.accent.value));
    globalThis.addEventListener('resize', syncResponsiveState);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && selectedProject()?.availability === 'available') loadIndex(false, true);
    });
  }

  async function boot() {
    bindEvents();
    syncResponsiveState();
    renderProjects();
    renderView();
    await loadPreferences();
    try {
      state.health = await api('/api/v1/health');
    } catch (error) {
      setError(error, '서버 상태를 확인하지 못했습니다.');
      renderView();
      return;
    }
    renderStatus();
    await loadProjects();
    globalThis.setInterval(() => {
      if (document.visibilityState === 'visible' && selectedProject()?.availability === 'available') loadIndex(false, true);
    }, 30000);
  }

  boot();
}());
