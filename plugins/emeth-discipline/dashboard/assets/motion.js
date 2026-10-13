'use strict';

(function exposeMotion() {
  const root = document.documentElement;
  const sidebarKey = 'emeth.dashboard.sidebar';
  try {
    const theme = localStorage.getItem('emeth.dashboard.theme');
    const accent = (localStorage.getItem('emeth.dashboard.accent') || '').replace(/^#3459e6$/i, '#c93686');
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    if (/^#[0-9a-f]{6}$/i.test(accent || '')) root.style.setProperty('--accent', accent);
    root.dataset.sidebar = localStorage.getItem(sidebarKey) === 'collapsed' ? 'collapsed' : 'expanded';
  } catch {
    // Keep the default appearance when storage is disabled.
  }
  const pending = new WeakMap();
  const entrances = new WeakMap();

  function enter(node, subtle = false) {
    if (!node || pending.has(node)) return;
    entrances.get(node)?.cancel();
    if (globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    entrances.set(node, node.animate([
      { opacity: subtle ? .8 : 0, transform: 'translateY(6px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' }));
  }

  function begin(node) {
    const transition = { node };
    entrances.get(node)?.cancel();
    pending.set(node, transition);
    node.classList.add('is-changing');
    node.setAttribute('aria-busy', 'true');
    node.inert = true;
    return transition;
  }

  function finish(transition) {
    if (!transition || pending.get(transition.node) !== transition) return;
    const { node } = transition;
    pending.delete(node);
    node.classList.remove('is-changing');
    node.removeAttribute('aria-busy');
    node.inert = false;
    enter(node, true);
  }

  function sidebar(collapsed) {
    root.dataset.sidebar = collapsed ? 'collapsed' : 'expanded';
    try { localStorage.setItem(sidebarKey, root.dataset.sidebar); } catch { /* Optional preference. */ }
  }

  globalThis.EmethMotion = Object.freeze({ enter, begin, finish, sidebar });
}());
