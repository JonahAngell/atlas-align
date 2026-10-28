/*
 * Shared app icons. Markup lives here once.
 * HTML references an icon by name: <span data-atlas-icon="inbox"></span>
 * Scripts call atlasIcon("inbox") when they need the SVG string.
 * Loaded with a plain script tag; this app has no module bundler.
 */
(function registerAtlasIcons() {
  const STROKE =
    'class="app-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';

  const icons = {
    menu: `<path d="M4 7h16M4 12h16M4 17h16"/>`,
    "my-audits": `<rect x="8" y="3" width="8" height="3.5" rx="1"/><path d="M8 5H6.5A1.5 1.5 0 0 0 5 6.5v13A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 17.5 5H16"/><path d="M8.5 11h7M8.5 15h5"/>`,
    inbox: `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>`,
    "deleted-publications": `<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6.5 7l.8 13h9.4l.8-13"/><path d="M10 11v5.5M14 11v5.5"/>`,
    history: `<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4.5V9h4.5"/><path d="M12 8v4.5l2.6 1.6"/>`,
    overview: `<rect x="3" y="3" width="7.5" height="8" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="5" rx="1.5"/><rect x="13.5" y="11" width="7.5" height="10" rx="1.5"/><rect x="3" y="14" width="7.5" height="7" rx="1.5"/>`,
    sources: `<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6"/><path d="M4.5 12v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6"/>`,
    "logic-builder": `<rect x="3" y="3.5" width="6" height="6" rx="1.25"/><rect x="15" y="3.5" width="6" height="6" rx="1.25"/><rect x="9" y="14.5" width="6" height="6" rx="1.25"/><path d="M6 9.5V12h12V9.5"/><path d="M12 12v2.5"/>`,
    "display-fields": `<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9h17M9.2 9v11M14.8 9v11"/>`,
    "requirements-preview": `<path d="m4.5 7 1.4 1.4L8.5 5.8"/><path d="M11 7.2h8.5"/><path d="m4.5 12.5 1.4 1.4 2.6-2.6"/><path d="M11 12.7h8.5"/><path d="m4.5 18 1.4 1.4 2.6-2.6"/><path d="M11 18.2h8.5"/>`,
    "readiness-review": `<circle cx="12" cy="12" r="8"/><path d="m8.4 12.2 2.5 2.5 4.8-5.4"/>`,
    "split-lines": `<path d="M4 6h16"/><path d="M8 12h12"/><path d="M8 18h12"/><path d="M4 9v6.5a1.5 1.5 0 0 0 1.5 1.5H6"/>`,
    "sort-asc": `<path d="M6 19.5V4.5M3 7.5l3-3 3 3"/><path d="M12 6h3.5M12 12h6M12 18h8.5"/>`,
    "sort-desc": `<path d="M6 4.5v15M3 16.5l3 3 3-3"/><path d="M12 6h8.5M12 12h6M12 18h3.5"/>`,
    export: `<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>`,
    lock: `<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14.5v2.5"/>`,
    "file-json": `<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M10 12c-1 0-1.5.5-1.5 1.5v.5c0 .5-.5 1-1 1 .5 0 1 .5 1 1v.5c0 1 .5 1.5 1.5 1.5M14 12c1 0 1.5.5 1.5 1.5v.5c0 .5.5 1 1 1-.5 0-1 .5-1 1v.5c0 1-.5 1.5-1.5 1.5"/>`,
    "file-table": `<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M8.5 12h7v6h-7zM8.5 15h7M12 12v6"/>`,
    "file-code": `<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="m10 12.5-2 2.5 2 2.5M14 12.5l2 2.5-2 2.5"/>`,
    "file-check": `<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="m9 15 2 2 4-4.5"/>`,
    "format-text": `<path d="M4 18 8.5 6h1L14 18M5.6 14h6.8"/><path d="M16 11.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM18.5 11v7"/>`,
    "format-number": `<path d="M9 4 7 20M17 4l-2 16M4.5 9h15M4 15h15"/>`,
    "format-decimal": `<rect x="3" y="7" width="6" height="10" rx="3"/><rect x="15" y="7" width="6" height="10" rx="3"/><path d="M12 16.5v.5"/>`,
    "format-date": `<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M14 14h2"/>`,
    "format-datetime": `<path d="M20.5 11V7a2 2 0 0 0-2-2h-13a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H11"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="17" cy="17" r="4"/><path d="M17 15.2V17l1.2.8"/>`,
    "format-boolean": `<rect x="2.5" y="7" width="19" height="10" rx="5"/><circle cx="16.5" cy="12" r="2.6"/>`,
    "format-currency": `<path d="M12 3v18"/><path d="M16.5 7.5c-.7-1.3-2.4-2-4.5-2-2.6 0-4.5 1.3-4.5 3.2 0 4.4 9.5 2.4 9.5 6.6 0 1.9-2 3.2-4.8 3.2-2.3 0-4-.8-4.8-2.2"/>`,
    add: `<path d="M12 5v14M5 12h14"/>`,
    "add-list": `<path d="M4 6h10M4 12h10M4 18h6"/><path d="M18 14v6M15 17h6"/>`,
    upload: `<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>`,
    close: `<path d="M6 6l12 12M18 6 6 18"/>`,
    warning: `<path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4.5"/><path d="M12 17.25h.01"/>`,
  };

  const filled = {
    feedback: `<path fill="currentColor" d="M9 3h6l1 2h3v3h2v2h-2v2h2v2h-2v3a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-3H3v-2h2v-2H3V8h2V5h3l1-2Zm0 4v10a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V7H9Zm2 2h2v5h-2V9Zm0 6h2v2h-2v-2Z"/>`,
  };

  function atlasIcon(name) {
    const key = String(name || "");
    if (filled[key]) {
      return `<svg class="app-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">${filled[key]}</svg>`;
    }
    const body = icons[key];
    if (!body) return "";
    return `<svg ${STROKE}>${body}</svg>`;
  }

  function atlasMountIcons(root) {
    const scope =
      root && typeof root.querySelectorAll === "function" ? root : document;
    scope.querySelectorAll("[data-atlas-icon]").forEach((node) => {
      const name = node.getAttribute("data-atlas-icon");
      if (!name || node.getAttribute("data-atlas-icon-mounted") === name)
        return;
      const markup = atlasIcon(name);
      if (!markup) return;
      node.innerHTML = markup;
      node.setAttribute("data-atlas-icon-mounted", name);
    });
  }

  window.atlasIcon = atlasIcon;
  window.atlasMountIcons = atlasMountIcons;
  atlasMountIcons(document);
})();
