'use strict';

(function preserveViewerContext() {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const source = new URLSearchParams(globalThis.location.search);
  const dashboard = new URLSearchParams();
  const architecture = new URLSearchParams();
  const expectedVersion = source.get('expected_version');
  let projectId = null;
  try {
    projectId = localStorage.getItem('emeth.dashboard.project');
    const theme = localStorage.getItem('emeth.dashboard.theme');
    const accent = (localStorage.getItem('emeth.dashboard.accent') || '').replace(/^#3459e6$/i, '#c93686');
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
    if (/^#[0-9a-f]{6}$/i.test(accent || '')) document.documentElement.style.setProperty('--accent', accent);
  } catch {
    // Both destinations remain usable without stored selection.
  }
  if (expectedVersion) dashboard.set('expected_version', expectedVersion);
  if (UUID.test(projectId || '')) {
    dashboard.set('project', projectId);
    architecture.set('project', projectId);
  }
  const dashboardLink = document.getElementById('intro-dashboard-link');
  const architectureLink = document.getElementById('intro-architecture-link');
  if (dashboard.size) dashboardLink.href = `/dashboard?${dashboard}`;
  if (architecture.size) architectureLink.href = `/architecture?${architecture}`;
}());
