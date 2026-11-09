import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

function loadRouter({ pathname = "/", activeAuditValue = "" } = {}) {
  const calls = [];
  const location = { pathname, origin: "https://atlas.example" };
  const history = {
    pushState: (_s, _t, path) => {
      calls.push(["push", path]);
      location.pathname = path;
    },
    replaceState: (_s, _t, path) => {
      calls.push(["replace", path]);
      location.pathname = path;
    },
  };
  const context = {
    location,
    history,
    state: { activeAuditValue },
    window: { addEventListener() {} },
    status() {},
  };
  vm.createContext(context);
  vm.runInContext(
    `${read("js/30-deep-links.js")}
     this.api = { atlasParseRoute, atlasRoutePathFor, atlasSyncRouteForPage, atlasOpenInitialRoute, atlasValidateAuditIdInput, atlasAuditLinkFor };`,
    context,
  );
  return { ...context.api, calls, context };
}

test("deep link paths parse into audit and page routes", () => {
  const { atlasParseRoute } = loadRouter();
  const plain = (value) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(atlasParseRoute("/")), { page: "my-audits" });
  assert.deepEqual(plain(atlasParseRoute("/inbox")), { page: "inbox" });
  assert.deepEqual(plain(atlasParseRoute("/audits/audit_1a2b3c4d")), {
    auditId: "audit_1a2b3c4d",
    page: "overview",
  });
  assert.deepEqual(plain(atlasParseRoute("/audits/audit_1a2b3c4d/steps/")), {
    auditId: "audit_1a2b3c4d",
    page: "steps",
  });
});

test("deep link parsing rejects unknown pages and unsafe audit ids", () => {
  const { atlasParseRoute } = loadRouter();
  assert.equal(atlasParseRoute("/audits/audit_1/not-a-page"), null);
  assert.equal(atlasParseRoute("/audits/a%2Fb/steps"), null);
  assert.equal(atlasParseRoute("/audits/%E0%A4%A/steps"), null);
  assert.equal(atlasParseRoute("/audits/a/steps/extra"), null);
  assert.equal(atlasParseRoute("/settings"), null);
});

test("only saved database audits get shareable audit paths", () => {
  assert.equal(
    loadRouter({ activeAuditValue: "database:audit_9" }).atlasRoutePathFor(
      "fields",
    ),
    "/audits/audit_9/fields",
  );
  assert.equal(
    loadRouter({ activeAuditValue: "workbook:0" }).atlasRoutePathFor("fields"),
    "/",
  );
  assert.equal(loadRouter().atlasRoutePathFor("my-audits"), "/");
  assert.equal(loadRouter().atlasRoutePathFor("inbox"), "/inbox");
});

test("navigation pushes history only after the initial route is opened", async () => {
  const router = loadRouter({ activeAuditValue: "database:audit_9" });
  router.atlasSyncRouteForPage("steps");
  assert.deepEqual(router.calls, []);
  await router.atlasOpenInitialRoute();
  router.atlasSyncRouteForPage("steps");
  router.atlasSyncRouteForPage("steps");
  assert.deepEqual(router.calls, [
    ["replace", "/"],
    ["push", "/audits/audit_9/steps"],
  ]);
});

test("the server serves the app shell for deep link paths", () => {
  const source = read("server.js");
  assert.match(source, /app\.get\(ATLAS_SPA_WORKSPACE_PATHS/);
  assert.match(source, /app\.get\("\/audits\/:auditId\/:page\?"/);
  assert.match(source, /ATLAS_SPA_AUDIT_ID\.test\(auditId\)\) return next\(\)/);
});

test("index.html resolves assets from the root and loads the router before bootstrap", () => {
  const html = read("index.html");
  assert.match(html, /<base href="\/" \/>/);
  const router = html.indexOf("./js/30-deep-links.js");
  const bootstrap = html.indexOf("./js/06-events-bootstrap.js");
  assert.ok(router > 0 && router < bootstrap);
});

test("audit ID input accepts letters and numbers", () => {
  const validate = (...args) => ({
    ...loadRouter().atlasValidateAuditIdInput(...args),
  });
  assert.deepEqual(validate(" Q3Audit2026 ", "audit_x1"), {
    id: "Q3Audit2026",
  });
  assert.deepEqual(validate("", "audit_x1"), { id: "audit_x1" });
  assert.deepEqual(validate("audit_x1", "audit_x1"), { id: "audit_x1" });
  assert.match(validate("q3-audit", "audit_x1").error, /letters and numbers/);
  assert.match(validate("my_audit", "audit_x1").error, /letters and numbers/);
  assert.match(validate("a".repeat(65), "audit_x1").error, /64 or fewer/);
});

test("copy link builds an absolute URL only for saved audits", () => {
  assert.equal(
    loadRouter({ activeAuditValue: "database:Q3Audit" }).atlasAuditLinkFor(
      "fields",
    ),
    "https://atlas.example/audits/Q3Audit/fields",
  );
  assert.equal(
    loadRouter({ activeAuditValue: "draft:Q3Audit" }).atlasAuditLinkFor(
      "fields",
    ),
    "",
  );
});

function loadRenameHarness({
  confirmed = true,
  apiError = null,
  locked = false,
} = {}) {
  const calls = [];
  const attrs = new Map();
  const element = () => ({
    value: "",
    textContent: "",
    hidden: true,
    readOnly: false,
    disabled: false,
    setAttribute: (name, value) => attrs.set(name, value),
    removeAttribute: (name) => attrs.delete(name),
    getAttribute: (name) => attrs.get(name) ?? null,
    addEventListener() {},
  });
  const location = {
    pathname: "/audits/OldAudit/overview",
    origin: "https://atlas.example",
  };
  const context = {
    location,
    history: {
      pushState() {},
      replaceState: (_s, _t, path) => {
        calls.push(["replace", path]);
        location.pathname = path;
      },
    },
    document: { activeElement: null },
    e: {
      auditIdInput: element(),
      auditIdError: element(),
      auditIdHint: element(),
    },
    state: {
      activeAuditValue: "database:OldAudit",
      audit: { id: "OldAudit", name: "Q3" },
      auditPersistence: {
        auditId: "OldAudit",
        revisionId: 7,
        revisionNumber: 3,
      },
      databaseAudits: [
        { id: "OldAudit", name: "Q3" },
        { id: "Other", name: "Other" },
      ],
    },
    window: {
      addEventListener() {},
      confirm: (message) => {
        calls.push(["confirm", message]);
        return confirmed;
      },
      ATLASWorkflow: { refresh: () => calls.push(["refresh"]) },
    },
    status: (message, kind) => calls.push(["status", kind, message]),
    atlasAuditIsWorkflowLocked: () => locked,
    atlasIsReviewerMode: () => false,
    atlasActivePage: () => "overview",
    atlasSaveIfDirty: async () => true,
    updateActiveAuditBaseline: () => calls.push(["baseline"]),
    atlasPatchDatabaseAuditListEntry: (payload) =>
      context.state.databaseAudits.push({ id: payload.audit.id }),
    atlasAuditApi: async (path, options) => {
      calls.push(["api", path, JSON.parse(options.body)]);
      if (apiError) throw apiError;
      return { audit: { id: "NewAudit" }, revision: { id: 8, number: 4 } };
    },
  };
  vm.createContext(context);
  vm.runInContext(
    `${read("js/30-deep-links.js")}
     this.api = { atlasHandleAuditIdChange, atlasRenderAuditIdentity };`,
    context,
  );
  return { ...context.api, calls, context, attrs };
}

test("changing a saved audit's ID renames it on the server and moves the URL", async () => {
  const { atlasHandleAuditIdChange, calls, context } = loadRenameHarness();
  context.e.auditIdInput.value = "NewAudit";
  assert.equal(await atlasHandleAuditIdChange(), true);
  assert.match(
    calls.find((c) => c[0] === "confirm")[1],
    /Links shared with the old ID will stop working/,
  );
  const api = calls.find((c) => c[0] === "api");
  assert.equal(api[1], "/api/audits/OldAudit/rename");
  assert.deepEqual({ ...api[2] }, { newId: "NewAudit", expectedRevisionId: 7 });
  assert.equal(context.state.audit.id, "NewAudit");
  assert.equal(context.state.activeAuditValue, "database:NewAudit");
  assert.equal(context.state.auditPersistence.auditId, "NewAudit");
  assert.equal(context.state.auditPersistence.revisionId, 8);
  assert.deepEqual(
    context.state.databaseAudits.map((a) => a.id),
    ["Other", "NewAudit"],
  );
  assert.equal(context.location.pathname, "/audits/NewAudit/overview");
  assert.equal(context.e.auditIdInput.value, "NewAudit");
});

test("cancelling the rename confirmation keeps the old ID without calling the server", async () => {
  const { atlasHandleAuditIdChange, calls, context } = loadRenameHarness({
    confirmed: false,
  });
  context.e.auditIdInput.value = "NewAudit";
  assert.equal(await atlasHandleAuditIdChange(), false);
  assert.ok(!calls.some((c) => c[0] === "api"));
  assert.equal(context.e.auditIdInput.value, "OldAudit");
  assert.equal(context.state.audit.id, "OldAudit");
});

test("a refused rename shows the server's message under the field", async () => {
  const apiError = Object.assign(
    new Error(
      "An audit with ID NewAudit already exists. Choose a different audit ID and try again.",
    ),
    {
      status: 409,
      code: "AUDIT_ID_TAKEN",
    },
  );
  const { atlasHandleAuditIdChange, context, attrs } = loadRenameHarness({
    apiError,
  });
  context.e.auditIdInput.value = "NewAudit";
  assert.equal(await atlasHandleAuditIdChange(), false);
  assert.match(context.e.auditIdError.textContent, /already exists/);
  assert.equal(attrs.get("aria-invalid"), "true");
  assert.equal(context.e.auditIdInput.value, "OldAudit");
  assert.equal(context.state.activeAuditValue, "database:OldAudit");
});

test("the audit ID field is read-only while the workflow locks the audit", () => {
  const { atlasRenderAuditIdentity, context } = loadRenameHarness({
    locked: true,
  });
  atlasRenderAuditIdentity(context.state.audit);
  assert.equal(context.e.auditIdInput.readOnly, true);
  assert.match(context.e.auditIdHint.textContent, /pending approval/);
  const open = loadRenameHarness();
  open.atlasRenderAuditIdentity(open.context.state.audit);
  assert.equal(open.context.e.auditIdInput.readOnly, false);
  assert.match(
    open.context.e.auditIdHint.textContent,
    /breaks links shared with the old ID/,
  );
});
