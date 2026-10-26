'use strict';

(function exposeDiagrams() {
  let nextId = 0;

  // Apply Pele's filtered SVG styles through CSSOM: style attributes inserted as
  // markup are blocked by the dashboard's style-src 'self' policy.
  function insertSvg(diagram, markup) {
    const template = document.createElement('template');
    // Avoid parsing style attributes even in an inert template: Chromium checks
    // CSP during parsing. Data attributes also preserve HTML-escaped font names.
    template.innerHTML = markup.replace(/\sstyle="/g, ' data-pele-style="');
    for (const element of template.content.querySelectorAll('[data-pele-style]')) {
      element.style.cssText = element.getAttribute('data-pele-style');
      element.removeAttribute('data-pele-style');
    }
    diagram.replaceChildren(template.content);
  }

  async function render(root) {
    const blocks = [...root.querySelectorAll('pre > code.language-mermaid')];
    if (blocks.length === 0 || !globalThis.pele) return false;
    await document.fonts.ready;
    let failed = false;
    for (const code of blocks) {
      if (!code.isConnected) continue;
      const original = code.parentElement;
      const diagram = document.createElement('div');
      diagram.className = 'diagram';
      diagram.tabIndex = 0;
      diagram.setAttribute('role', 'region');
      diagram.setAttribute('aria-label', '다이어그램');
      original.replaceWith(diagram);
      try {
        const style = getComputedStyle(diagram);
        await document.fonts.load(`16px ${style.fontFamily}`, code.textContent);
        if (!diagram.isConnected) continue;
        const { svg } = globalThis.pele.render(code.textContent, {
          idPrefix: `emeth-diagram-${++nextId}`,
          fontFamily: style.fontFamily,
          fontSize: 16,
          responsive: false,
          links: false,
          images: false,
        });
        insertSvg(diagram, svg);
      } catch {
        if (diagram.isConnected) {
          diagram.replaceWith(original);
          failed = true;
        }
      }
    }
    return failed;
  }

  globalThis.EmethDashboardDiagrams = Object.freeze({ render });
}());
