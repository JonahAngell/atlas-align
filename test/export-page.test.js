import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("sections/export.html");
const dashboard = read("js/29-export-dashboard.js");
const index = read("index.html");

/**
 * Runs the Export page module with stubbed app globals. `options` sets the
 * audit, lock state, edit access, and save result for the scenario.
 */
function exportContext(options = {}) {
  const calls = { saves: 0, loads: 0, refreshes: 0, downloads: [], statuses: [] };
  const audit = options.audit || {
    id: "audit-1",
    name: "Management Chain (NAA)",
    steps: [
      { id: "s1", enabled: true },
      { id: "s2", enabled: false },
    ],
  };
  const locked = Boolean(options.locked);
  const context = vm.createContext({
    Blob,
    TextDecoder,
    Map,
    Set,
    JSON,
    Number,
    String,
    Object,
    Error,
    CSS: { escape: (value) => String(value) },
    document: {
      addEventListener() {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      activeElement: null,
    },
    navigator: {},
    window: {
      ATLASWorkflow: {
        feature: () => true,
        refresh: async () => {
          calls.refreshes += 1;
        },
        isPublishedLocked: () => locked,
        summary: { currentRevisionId: options.lockedRevisionId ?? 7 },
      },
    },
    state: {
      audit,
      auditPersistence: {
        auditId: audit.id,
        revisionId: 7,
        access: { canEdit: options.canEdit !== false },
      },
      currentUser: { access: { canCreate: true } },
    },
    esc: (value) => String(value ?? ""),
    atlasInvalidatePages() {},
    atlasActivePage: () => "my-audits",
    atlasRenderPage() {},
    today: () => "2026-10-28",
    safeFileName: (name) =>
      String(name || "audit_logic").replace(/[^A-Za-z0-9_-]+/g, "_"),
    hasSelectedAudit: () => true,
    atlasSaveIfDirty: async () => {
      calls.saves += 1;
      return options.saveResult ?? true;
    },
    atlasLoadDatabaseAudit: async () => {
      calls.loads += 1;
    },
    downloadBlob: (name, content, type) =>
      calls.downloads.push({ name, content, type }),
    status: (message, kind) => calls.statuses.push([message, kind]),
    auditHtmlDocument: () => "<!doctype html><h1>Audit</h1>",
    auditCsvDocument: () => "Step\n1",
    markdown: () => "| Step |",
    buildAuditExcelWorkbook: async () => ({
      worksheets: [],
      xlsx: { writeBuffer: async () => new ArrayBuffer(4) },
    }),
    buildQtestExportFile: async () => ({
      content: new ArrayBuffer(8),
      message: "Qtest Excel exported with 2 scenarios.",
      kind: "ok",
    }),
  });
  vm.runInContext(dashboard, context, { filename: "29-export-dashboard.js" });
  return { context, calls };
}

test("Export page replaces the publication and Save / Export panels", () => {
  assert.match(page, /data-page="export"/);
  assert.match(page, /id="page-export"/);
  assert.match(page, /<h1>Export<\/h1>/);
  assert.match(page, /id="atlasAuditLockToggle"/);
  assert.match(page, /role="switch"/);
  for (const removed of [
    /Formal Publication/,
    /Publication Preview/,
    /Save \/ Export/,
    /savePanel/,
    /importAllFile/,
    /exportAllBtn/,
    /atlasPublicationForm/,
  ])
    assert.doesNotMatch(page, removed);
  assert.match(index, /data-section="export"[\s\S]*?<span class="navtext">Export<\/span>/);
  assert.match(index, /29-export-dashboard\.js/);
  assert.doesNotMatch(index, /tutorial-save-export/);
});

test("registry offers JSON, Excel, Qtest, and HTML, keeping CSV and Markdown hidden", () => {
  const { context } = exportContext();
  const formats = vm.runInContext("window.ATLASExportFormats.list()", context);
  const visible = vm.runInContext(
    "window.ATLASExportFormats.visible().map((format) => format.id)",
    context,
  );
  assert.deepEqual([...visible], ["json", "excel", "qtest", "html"]);
  assert.deepEqual(
    [...formats].filter((format) => format.hidden).map((format) => format.id),
    ["csv", "markdown"],
  );
  const byId = Object.fromEntries(formats.map((format) => [format.id, format]));
  assert.deepEqual([...byId.html.actions], ["download", "copy"]);
  assert.ok(byId.html.tags.includes("Can be added directly to Confluence"));
  assert.ok(byId.json.tags.includes("Includes disabled steps"));
  assert.equal(byId.qtest.mimeType, byId.excel.mimeType);
});

test("new formats register through the registry and duplicate ids are rejected", () => {
  const { context } = exportContext();
  vm.runInContext(
    `window.ATLASExportFormats.register({ id: "pdf", label: "PDF", description: "Printable", extension: "pdf", fileName: () => "audit", build: () => "%PDF" });`,
    context,
  );
  const pdf = vm.runInContext('window.ATLASExportFormats.get("pdf")', context);
  assert.equal(pdf.mimeType, "application/octet-stream");
  assert.deepEqual([...pdf.actions], ["download"]);
  assert.throws(
    () =>
      vm.runInContext(
        `window.ATLASExportFormats.register({ id: "json", build: () => "" })`,
        context,
      ),
    /already registered/,
  );
});

test("file names keep the typed name but drop unsafe characters and a repeated extension", () => {
  const { context } = exportContext();
  const sanitize = (value, extension) =>
    vm.runInContext(
      `atlasSanitizeExportFileName(${JSON.stringify(value)}, ${JSON.stringify(extension)})`,
      context,
    );
  assert.equal(sanitize("Quarterly report", "json"), "Quarterly report");
  assert.equal(sanitize("a/b:c*?.xlsx", "xlsx"), "a_b_c_");
  assert.equal(sanitize("  .hidden.  ", "html"), "hidden");
  assert.equal(sanitize("", "json"), "");
  assert.equal(
    vm.runInContext(
      'atlasExportFileName(window.ATLASExportFormats.get("qtest"))',
      context,
    ),
    "Management_Chain_NAA__qtest_template_2026-10-28.xlsx",
  );
  vm.runInContext(
    'atlasExportView.fileNames.set("json", "Custom name.json")',
    context,
  );
  assert.equal(
    vm.runInContext('atlasExportFileName(window.ATLASExportFormats.get("json"))', context),
    "Custom name.json",
  );
});

test("an unlocked audit is saved before it is downloaded, and JSON keeps disabled steps", async () => {
  const { context, calls } = exportContext();
  assert.equal(
    await vm.runInContext('window.ATLASExportFormats.run("json", "download")', context),
    true,
  );
  assert.equal(calls.saves, 1);
  assert.equal(calls.downloads.length, 1);
  const { name, content, type } = calls.downloads[0];
  assert.equal(name, "Management_Chain_NAA_.json");
  assert.equal(type, "application/json");
  assert.deepEqual(
    JSON.parse(content).steps.map((step) => step.enabled),
    [true, false],
  );
});

test("a failed save stops the export", async () => {
  const { context, calls } = exportContext({ saveResult: false });
  assert.equal(
    await vm.runInContext('window.ATLASExportFormats.run("excel", "download")', context),
    false,
  );
  assert.equal(calls.downloads.length, 0);
  assert.match(calls.statuses.at(-1)[0], /could not be saved/);
  assert.equal(calls.statuses.at(-1)[1], "bad");
});

test("a locked audit is never saved and reloads a newer locked revision", async () => {
  const current = exportContext({ locked: true });
  await vm.runInContext('window.ATLASExportFormats.run("html", "download")', current.context);
  assert.equal(current.calls.saves, 0);
  assert.equal(current.calls.loads, 0);
  assert.equal(current.calls.downloads.length, 1);

  const stale = exportContext({ locked: true, lockedRevisionId: 9 });
  await vm.runInContext('window.ATLASExportFormats.run("html", "download")', stale.context);
  assert.equal(stale.calls.saves, 0);
  assert.equal(stale.calls.loads, 1);
});

test("read-only users export without attempting a save", async () => {
  const { context, calls } = exportContext({ canEdit: false });
  await vm.runInContext('window.ATLASExportFormats.run("qtest", "download")', context);
  assert.equal(calls.saves, 0);
  assert.equal(calls.downloads.length, 1);
  assert.deepEqual(calls.statuses.at(-1), [
    "Qtest Excel exported with 2 scenarios.",
    "ok",
  ]);
});

test("copying HTML writes the document text to the clipboard", async () => {
  const { context, calls } = exportContext();
  const written = [];
  context.navigator.clipboard = { writeText: async (text) => written.push(text) };
  await vm.runInContext('window.ATLASExportFormats.run("html", "copy")', context);
  assert.deepEqual(written, ["<!doctype html><h1>Audit</h1>"]);
  assert.equal(calls.downloads.length, 0);
  assert.deepEqual(calls.statuses.at(-1), ["HTML copied to the clipboard.", "ok"]);
  assert.equal(
    await vm.runInContext('window.ATLASExportFormats.run("json", "copy")', context),
    false,
    "formats without a copy action ignore copy requests",
  );
});

test("HTML preview runs in an empty sandbox", () => {
  assert.match(dashboard, /setAttribute\("sandbox", ""\)/);
  assert.match(dashboard, /frame\.srcdoc =/);
});
