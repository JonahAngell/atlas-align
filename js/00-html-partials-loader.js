/*
 * Loads the page HTML partials before the application scripts that cache DOM
 * references. 01-state-dom.js fills `e` at evaluation time, and
 * 06-events-bootstrap.js invokes init() when it is evaluated. Scripts after
 * this file stay inert (data-atlas-boot) until the partials are in the page.
 */
(function loadHtmlPartialsBeforeApplicationBootstrap() {
  const sectionRoot = document.getElementById("page-sections-root");
  const sectionFiles = [
    "./sections/my-audits.html",
    "./sections/inbox.html",
    "./sections/audit-history.html",
    "./sections/recently-deleted-publications.html",
    "./sections/audit-overview.html",
    "./sections/sources.html",
    "./sections/logic-builder.html",
    "./sections/display-fields.html",
    "./sections/visual-picker.html",
    "./sections/requirements-preview.html",
    "./sections/readiness-review.html",
    "./sections/audit-issues.html",
    "./sections/publication-preview.html",
  ];

  if (!sectionRoot)
    throw new Error("HTML partial root #page-sections-root was not found.");

  void boot();

  async function boot() {
    const html = await Promise.all(sectionFiles.map(loadPartial));
    sectionRoot.insertAdjacentHTML("beforebegin", html.join(""));
    sectionRoot.remove();
    const bootScripts = [
      ...document.querySelectorAll("script[data-atlas-boot]"),
    ];
    for (const node of bootScripts) await executeBootScript(node);
  }

  async function loadPartial(file) {
    const response = await fetch(file, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(
        `Could not load HTML partial ${file}. HTTP ${response.status}.`,
      );
    }
    const contentType = String(response.headers.get("content-type") || "");
    if (contentType && !contentType.includes("text/html")) {
      throw new Error(
        `Could not load HTML partial ${file}. Unexpected content type ${contentType}.`,
      );
    }
    const responseText = await response.text();
    if (!responseText.trim().startsWith("<")) {
      throw new Error(
        `Could not load HTML partial ${file}. Invalid HTML response.`,
      );
    }
    return responseText;
  }

  function executeBootScript(node) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = node.getAttribute("src");
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error(`Could not load application script ${script.src}.`));
      document.body.appendChild(script);
    });
  }
})();
