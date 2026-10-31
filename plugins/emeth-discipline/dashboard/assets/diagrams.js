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

  function c4Relationships(source) {
    const model = globalThis.pele.parse(source);
    if (!model.rels.length) return null;
    const names = new Map([...model.shapes, ...model.boundaries].map(node => [node.alias, node.label]));
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = `연결 관계 ${model.rels.length}개`;
    const table = document.createElement('table');
    const headings = table.createTHead().insertRow();
    for (const label of ['출발', '도착', '관계']) {
      const heading = document.createElement('th');
      heading.textContent = label;
      headings.append(heading);
    }
    const body = table.createTBody();
    for (const rel of model.rels) {
      const row = body.insertRow();
      for (const value of [names.get(rel.from) || rel.from, names.get(rel.to) || rel.to, [rel.label, rel.techn, rel.descr].filter(Boolean).join(' / ')]) {
        row.insertCell().textContent = value;
      }
    }
    details.className = 'c4-relationships';
    details.append(summary, table);
    return details;
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
        const { svg, type } = globalThis.pele.render(code.textContent, {
          idPrefix: `emeth-diagram-${++nextId}`,
          fontFamily: style.fontFamily,
          fontSize: 16,
          responsive: false,
          links: false,
          images: false,
        });
        insertSvg(diagram, svg);
        if (type === 'c4') {
          diagram.classList.add('c4-overview');
          diagram.setAttribute('aria-label', 'C4 구조도');
          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'diagram-scale';
          toggle.textContent = '원래 크기로 보기';
          toggle.addEventListener('click', () => {
            const fit = diagram.classList.toggle('c4-overview');
            toggle.textContent = fit ? '원래 크기로 보기' : '전체 구조 보기';
          });
          const toolbar = document.createElement('div');
          toolbar.className = 'diagram-toolbar';
          const caption = document.createElement('strong');
          caption.textContent = 'C4 구조도';
          toolbar.append(caption, toggle);
          diagram.before(toolbar);
          const relationships = c4Relationships(code.textContent);
          if (relationships) diagram.after(relationships);
        }
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
