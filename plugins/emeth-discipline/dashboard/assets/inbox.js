'use strict';

(() => {
  const board = document.querySelector('#inbox-template').content.firstElementChild;
  const scope = board.querySelector('select');
  const status = board.querySelector('[role="status"]');
  let snapshot, busy = false, items = [];
  let folder = 'open';
  const kindLabels = { question: '답변 요청', result: '결과 확인', active: '진행 중' };
  function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }
  function markdown(text) {
    const body = element('div','');
    body.className = 'markdown-body entry-body';
    body.innerHTML = globalThis.EmethDashboardCore.renderMarkdown(text);
    return body;
  }
  const readPrefix = 'emeth.inbox.read.';
  const sessionReads = new Map();
  function unread(item) {
    let version = sessionReads.get(item.key);
    try { version = localStorage.getItem(readPrefix + item.key) ?? version; } catch {}
    return version !== String(item.updated);
  }
  function updateIndicator() {
    const count = items.filter(unread).length;
    const badge = document.getElementById('unread-count');
    badge.hidden = count === 0;
    badge.textContent = String(count);
    const link = document.getElementById('inbox-link');
    link.title = count ? '작업 수신함, 읽지 않음 ' + count + '개' : '작업 수신함';
    link.setAttribute('aria-label', link.title);
  }
  function render() {
    updateIndicator();
    const counts = { open: 0, active: 0, later: 0, done: 0 };
    for (const section of board.querySelectorAll('[data-kind]')) {
      const kind = section.dataset.kind;
      const rows = items.filter(item => (scope.value === 'all' || item.project === scope.value) &&
        (item.state === 'open' ? item.kind : item.state) === kind);
      section.querySelector('.count').textContent = rows.length;
      const list = section.querySelector('.entries');
      const opened = new Set([...list.querySelectorAll('details[open]')].map(row => row.dataset.key));
      list.replaceChildren();
      const group = kind === 'question' || kind === 'result' ? 'open' : kind;
      counts[group] += rows.length;
      section.hidden = folder !== group || !rows.length;
      for (const item of rows) {
        const row = element('details','');
        row.dataset.key = item.key;
        row.open = opened.has(item.key);
        const summary = element('summary','');
        const body = markdown(item.text);
        const meta = element('div','');
        meta.className = 'entry-meta';
        const badge = element('span',kindLabels[item.kind]);
        badge.className = 'entry-kind ' + item.kind;
        meta.append(badge,element('small',item.projectName));
        if (unread(item)) {
          const marker = element('small','읽지 않음');
          marker.className = 'entry-unread';
          meta.append(marker);
          row.addEventListener('toggle', () => {
            if (!row.open || !row.isConnected) return;
            const version = String(item.updated);
            sessionReads.set(item.key, version);
            try { localStorage.setItem(readPrefix + item.key, version); } catch {}
            marker.remove();
            updateIndicator();
          });
        }
        const project = element('a','프로젝트 열기');
        project.href = '/dashboard?project=' + encodeURIComponent(item.project);
        const excerpt = element('p',body.firstElementChild?.textContent || '');
        excerpt.className = 'entry-preview';
        summary.append(meta,element('strong',markdown(item.title).textContent),excerpt);
        row.append(summary,body);
        const actions = element('div','');
        actions.className = 'entry-actions';
        actions.append(project);
        if (!/^(claude|mixdog):/.test(item.id)) {
          const chat = element('a','채팅 열기');
          chat.href = 'codex://threads/' + encodeURIComponent(item.id);
          actions.append(chat);
        }
        for (const [state,label] of [['later','나중에 하기'],['done','처리 완료'],['open','다시 열기']]) {
          if (item.state === state) continue;
          const button = element('button',label);
          button.dataset.action = state;
          button.onclick = async () => {
            button.disabled = true;
            try {
              const response = await fetch('/api/v1/inbox/'+item.key+'/'+state,{method:'POST'});
              if (!response.ok) throw Error();
              await refresh();
              if (!button.isConnected) {
                board.querySelector('[data-folder][aria-pressed=true]').focus({ preventScroll:true });
                status.textContent = { later:'나중에 할 일로 옮겼습니다.', done:'처리 완료로 옮겼습니다.', open:'작업을 다시 열었습니다.' }[state];
              }
            } catch { status.textContent = '처리 상태를 저장하지 못했습니다. 다시 시도하세요.'; }
            finally { button.disabled = false; }
          };
          actions.append(button);
        }
        row.append(actions);
        list.append(row);
      }
    }
    for (const button of board.querySelectorAll('[data-folder]')) {
      button.setAttribute('aria-pressed',String(folder === button.dataset.folder));
      button.querySelector('span').textContent = counts[button.dataset.folder];
    }
    const empty = board.querySelector('.queue-empty');
    board.querySelector('.inbox-list-heading h2').textContent = { open:'검토 대기', active:'진행 중', later:'나중에', done:'완료' }[folder];
    board.querySelector('.inbox-list-heading p').textContent = counts[folder] + '개 표시';
    empty.hidden = counts[folder] !== 0;
    empty.textContent = { open: '검토할 질문이나 결과가 없습니다.', active: '진행 중인 작업이 없습니다.', later: '나중에 하기로 한 작업이 없습니다.', done: '처리한 작업이 없습니다.' }[folder];
  }
  for (const button of board.querySelectorAll('[data-folder]')) {
    button.onclick = () => { folder = button.dataset.folder; render(); };
  }
  async function refresh() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const response = await fetch('/api/v1/inbox');
      if (!response.ok) throw Error();
      const data = await response.json();
      const value = JSON.stringify(data.items);
      if (value !== snapshot) { items = data.items; render(); snapshot = value; }
      status.textContent = '';
    } catch { status.textContent = '대시보드 작업 기록을 읽지 못했습니다.'; }
    finally { busy = false; }
  }
  window.addEventListener('storage', event => {
    if (!event.key || event.key.startsWith(readPrefix)) render();
  });
  window.setInterval(refresh, 10000);
  refresh();
  scope.onchange = render;
  globalThis.EmethInbox = {
    show(projects) {
      const selected = scope.value;
      scope.replaceChildren(new Option('전체 프로젝트', 'all'), ...projects.map(project => new Option(project.name, project.id)));
      scope.value = projects.some(project => project.id === selected) ? selected : 'all';
      render();
      if (!board.isConnected) refresh();
      return board;
    },

    refresh
  };
})();
