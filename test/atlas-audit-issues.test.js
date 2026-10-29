import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const engineSource = readFileSync(
  new URL("../js/22-audit-issue-engine.js", import.meta.url),
  "utf8",
);
const adapterSource = readFileSync(
  new URL("../js/23-atlas-audit-issues.js", import.meta.url),
  "utf8",
);
const catalog = JSON.parse(
  readFileSync(
    new URL("../catalogs/audit-issue-rules.json", import.meta.url),
    "utf8",
  ),
);

async function runtime(audit, extras = {}) {
  const sandbox = {
    console,
    atlasDisplayDocument: undefined,
    __auditInput: audit,
    __auditSelected: extras.auditSelected ?? true,
    repoLibraryState: { sourceFiles: extras.sourceFiles || [] },
    workbookState: { warnings: extras.workbookWarnings || [] },
    parseStepConditions(step) {
      if (step.params?.conditions_json)
        return JSON.parse(step.params.conditions_json);
      return step.conditions || [];
    },
    atlasValidateMathOperations:
      extras.atlasValidateMathOperations || (() => []),
    atlasValidateStringTransform:
      extras.atlasValidateStringTransform || (() => []),
    ATLAS_STRING_TRANSFORM_VALUE_MODE: "String transformation",
    fetch:
      extras.fetch ||
      (async () => ({
        ok: true,
        json: async () => structuredClone(catalog),
      })),
    renderValidationPanel() {},
  };
  if (extras.atlasResolveSourceIdentity)
    sandbox.atlasResolveSourceIdentity = extras.atlasResolveSourceIdentity;
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(
    `const state = { audit: __auditInput, auditSelected: __auditSelected };
     function hasSelectedAudit() { return state.auditSelected === true; }`,
    context,
  );
  vm.runInContext(engineSource, context);
  vm.runInContext(adapterSource, context);
  await context.ATLASAuditIssues.catalogReady;
  return context;
}

const completeAudit = () => ({
  name: "Complete audit",
  purpose: "Test purpose",
  assignments: {
    assigned: [{ id: "a" }],
    backup: [{ id: "b" }],
    developer: [{ id: "d" }],
  },
  sources: [{ sourceKey: "source.one", sourceFile: "Source One" }],
  fields: [{ sourceKey: "source.one", rawFieldName: "Status", name: "Status" }],
  displayFields: [{ sourceKey: "source.one", rawFieldName: "Status" }],
  steps: [
    {
      id: "step-1",
      enabled: true,
      parentId: null,
      branchType: "root",
      step_type: "if_then",
      params: {
        then_action_type: "do_not_display",
        conditions_json: JSON.stringify([
          {
            id: "condition-1",
            fieldName: "Status",
            operator: "is equal to",
            valueMode: "values",
            compareValue: "Inactive",
          },
        ]),
      },
    },
  ],
});

test("buildContext does not mutate the supplied audit", async () => {
  const audit = completeAudit();
  const before = structuredClone(audit);
  const context = await runtime(audit);
  context.ATLASAuditIssues.buildContext(audit);
  assert.deepEqual(audit, before);
});

test("complete audit produces one canonical result without setup or logic issues", async () => {
  const context = await runtime(completeAudit());
  const result = context.ATLASAuditIssues.current();
  assert.equal(result.status, "ok");
  assert.equal(result.issues.length, 0);
  assert.deepEqual([...context.atlasLogicIssues()], []);
  assert.deepEqual([...context.ATLASAuditIssues.legacyIssues()], []);
});

test("missing setup values use requested warning severities", async () => {
  const audit = completeAudit();
  audit.name = "";
  audit.purpose = "";
  audit.assignments = { assigned: [], backup: [], developer: [] };
  audit.sources = [];
  const context = await runtime(audit);
  const result = context.ATLASAuditIssues.current();
  const rules = new Set(result.issues.map((entry) => entry.ruleId));
  assert.ok(rules.has("audit.identity.name-missing"));
  assert.ok(rules.has("audit.assignments.assigned-missing"));
  assert.ok(rules.has("audit.sources.none"));
  assert.ok(result.issues.every((entry) => entry.severity === "warning"));
});

test("missing condition field and operator are critical", async () => {
  const audit = completeAudit();
  audit.steps[0].params.conditions_json = JSON.stringify([
    {
      id: "condition-1",
      fieldName: "",
      operator: "",
      valueMode: "field",
      compareSourceFile: "",
      compareFieldName: "",
    },
  ]);
  const context = await runtime(audit);
  const result = context.ATLASAuditIssues.current();
  const conditionIssues = result.issues.filter(
    (entry) => entry.ruleId === "audit.logic.condition-integrity",
  );
  assert.ok(conditionIssues.length >= 4);
  assert.ok(conditionIssues.every((entry) => entry.severity === "critical"));
  assert.equal(result.status, "critical");
});

test("valid descendant action suppresses parent missing-action warning", async () => {
  const audit = completeAudit();
  audit.steps[0].params.then_action_type = "freeform";
  audit.steps[0].params.then_action = "";
  audit.steps.push({
    id: "step-2",
    enabled: true,
    parentId: "step-1",
    branchType: "then",
    step_type: "if_then",
    params: {
      then_action_type: "do_not_display",
      conditions_json: JSON.stringify([
        {
          id: "c2",
          fieldName: "Status",
          operator: "is equal to",
          valueMode: "values",
          compareValue: "X",
        },
      ]),
    },
  });
  const context = await runtime(audit);
  const issues = context.ATLASAuditIssues.current().issues;
  assert.equal(
    issues.some(
      (entry) =>
        entry.ruleId === "audit.logic.action-missing" &&
        entry.target.stepId === "step-1",
    ),
    false,
  );
});

test("disabled descendant does not suppress parent missing-action warning", async () => {
  const audit = completeAudit();
  audit.steps[0].params.then_action_type = "freeform";
  audit.steps[0].params.then_action = "";
  audit.steps.push({
    id: "step-2",
    enabled: false,
    parentId: "step-1",
    branchType: "then",
    step_type: "if_then",
    params: { then_action_type: "do_not_display", conditions_json: "[]" },
  });
  const context = await runtime(audit);
  const issues = context.ATLASAuditIssues.current().issues;
  assert.equal(
    issues.some(
      (entry) =>
        entry.ruleId === "audit.logic.action-missing" &&
        entry.target.stepId === "step-1",
    ),
    true,
  );
});

test("field relationship rule validates direct, indirect, reverse, same-source, alternate, cyclic, and duplicate paths", async () => {
  const sourceFiles = ["A", "B", "C", "D"].map((sourceKey) => ({
    sourceKey,
    sourceFile: `${sourceKey}.csv`,
    alias: `Source ${sourceKey}`,
    fields: [{ rawFieldName: "id" }, { rawFieldName: "value" }],
  }));
  const audit = completeAudit();
  audit.sources = sourceFiles.map(({ sourceKey, sourceFile, alias }) => ({
    sourceKey,
    sourceFile,
    alias,
  }));
  audit.fields = sourceFiles.flatMap(({ sourceKey, sourceFile }) =>
    ["id", "value"].map((rawFieldName) => ({
      sourceKey,
      sourceFile,
      rawFieldName,
      name: rawFieldName,
    })),
  );
  audit.displayFields = [{ sourceKey: "A", rawFieldName: "value" }];
  const joins = [
    ["A", "B"],
    ["B", "C"],
    ["A", "D"],
    ["C", "A"],
    ["A", "B"],
  ];
  audit.steps = [
    ...joins.map(([left, right], index) => ({
      id: `join-${index}`,
      enabled: true,
      step_type: "join",
      params: {
        join_type: "INNER JOIN",
        left_source: left,
        right_source: right,
        left_field: "id",
        right_field: "id",
      },
    })),
    {
      id: "compare",
      enabled: true,
      step_type: "if_then",
      params: {
        then_action_type: "do_not_display",
        conditions_json: JSON.stringify(
          [
            ["A", "B"],
            ["A", "C"],
            ["C", "A"],
            ["A", "A"],
            ["C", "D"],
          ].map(([left, right], index) => ({
            id: `condition-${index}`,
            sourceFile: left,
            fieldName: "value",
            operator: "is equal to",
            valueMode: "field",
            compareSourceFile: right,
            compareFieldName: "value",
          })),
        ),
      },
    },
  ];
  const result = (
    await runtime(audit, { sourceFiles })
  ).ATLASAuditIssues.current();
  assert.equal(
    result.issues.filter(
      (entry) => entry.ruleId === "audit.logic.field-relationship-invalid",
    ).length,
    0,
  );
});
test("field relationship rule reports disconnected, disabled, incomplete, and UNION paths", async () => {
  for (const join of [
    null,
    {
      enabled: false,
      join_type: "INNER JOIN",
      left_field: "id",
      right_field: "id",
    },
    {
      enabled: true,
      join_type: "INNER JOIN",
      left_field: "",
      right_field: "id",
    },
    { enabled: true, join_type: "UNION", left_field: "", right_field: "" },
  ]) {
    const audit = completeAudit();
    audit.sources = ["A", "B"].map((sourceKey) => ({ sourceKey }));
    audit.fields = ["A", "B"].flatMap((sourceKey) =>
      ["id", "value"].map((rawFieldName) => ({
        sourceKey,
        rawFieldName,
        name: rawFieldName,
      })),
    );
    audit.displayFields = [{ sourceKey: "A", rawFieldName: "value" }];
    audit.steps = [
      ...(join
        ? [
            {
              id: "join",
              enabled: join.enabled,
              step_type: "join",
              params: {
                join_type: join.join_type,
                left_source: "A",
                right_source: "B",
                left_field: join.left_field,
                right_field: join.right_field,
              },
            },
          ]
        : []),
      {
        id: "compare",
        enabled: true,
        step_type: "if_then",
        params: {
          then_action_type: "do_not_display",
          conditions_json: JSON.stringify([
            {
              id: "condition-1",
              sourceFile: "A",
              fieldName: "value",
              operator: "is equal to",
              valueMode: "field",
              compareSourceFile: "B",
              compareFieldName: "value",
            },
          ]),
        },
      },
    ];
    const issues = (
      await runtime(audit)
    ).ATLASAuditIssues.current().issues.filter(
      (entry) => entry.ruleId === "audit.logic.field-relationship-invalid",
    );
    assert.equal(issues.length, 1);
    assert.equal(issues[0].severity, "critical");
    assert.equal(issues[0].target.stepId, "compare");
    assert.equal(issues[0].target.conditionId, "condition-1");
  }
});
test("field relationship rule resolves unique aliases and ignores ambiguous identities", async () => {
  const sourceFiles = [
    { sourceKey: "A", sourceFile: "A.csv", alias: "Alpha" },
    { sourceKey: "B", sourceFile: "B.csv", alias: "Beta" },
  ].map((source) => ({
    ...source,
    fields: [{ rawFieldName: "id" }, { rawFieldName: "value" }],
  }));
  const resolver = (sourceLike, catalogSources) => {
    const raw = String(
      typeof sourceLike === "string"
        ? sourceLike
        : sourceLike.sourceKey ||
            sourceLike.sourceFile ||
            sourceLike.alias ||
            "",
    ).trim();
    const matches = catalogSources.filter((source) =>
      [source.sourceKey, source.sourceFile, source.alias].includes(raw),
    );
    return matches.length === 1
      ? { ...matches[0], ambiguous: false }
      : { sourceKey: "", sourceFile: "", ambiguous: matches.length > 1 };
  };
  const audit = completeAudit();
  audit.sources = sourceFiles;
  audit.fields = sourceFiles.flatMap(({ sourceKey, sourceFile }) =>
    ["id", "value"].map((rawFieldName) => ({
      sourceKey,
      sourceFile,
      rawFieldName,
      name: rawFieldName,
    })),
  );
  audit.displayFields = [{ sourceKey: "A", rawFieldName: "value" }];
  audit.steps = [
    {
      id: "join",
      enabled: true,
      step_type: "join",
      params: {
        join_type: "LEFT JOIN",
        left_source: "Alpha",
        right_source: "Beta",
        left_field: "id",
        right_field: "id",
      },
    },
    {
      id: "compare",
      enabled: true,
      step_type: "if_then",
      params: {
        then_action_type: "do_not_display",
        conditions_json: JSON.stringify([
          {
            id: "condition-1",
            sourceFile: "A",
            fieldName: "value",
            operator: "is equal to",
            valueMode: "field",
            compareSourceFile: "B",
            compareFieldName: "value",
          },
          {
            id: "condition-2",
            sourceFile: "Unknown",
            fieldName: "value",
            operator: "is equal to",
            valueMode: "field",
            compareSourceFile: "B",
            compareFieldName: "value",
          },
        ]),
      },
    },
  ];
  const issues = (
    await runtime(audit, { sourceFiles, atlasResolveSourceIdentity: resolver })
  ).ATLASAuditIssues.current().issues.filter(
    (entry) => entry.ruleId === "audit.logic.field-relationship-invalid",
  );
  assert.equal(issues.length, 0);
});
test("field relationship issues are deterministic per condition and evaluation does not mutate the audit", async () => {
  const audit = completeAudit();
  audit.sources = ["A", "B", "C"].map((sourceKey) => ({ sourceKey }));
  audit.fields = ["A", "B", "C"].map((sourceKey) => ({
    sourceKey,
    rawFieldName: "value",
    name: "value",
  }));
  audit.displayFields = [{ sourceKey: "A", rawFieldName: "value" }];
  audit.steps = [
    {
      id: "compare",
      enabled: true,
      step_type: "if_then",
      params: {
        then_action_type: "do_not_display",
        conditions_json: JSON.stringify([
          {
            id: "condition-1",
            sourceFile: "A",
            fieldName: "value",
            operator: "is equal to",
            valueMode: "field",
            compareSourceFile: "B",
            compareFieldName: "value",
          },
          {
            id: "condition-2",
            sourceFile: "A",
            fieldName: "value",
            operator: "is equal to",
            valueMode: "field",
            compareSourceFile: "C",
            compareFieldName: "value",
          },
        ]),
      },
    },
  ];
  const before = structuredClone(audit);
  const issues = (
    await runtime(audit)
  ).ATLASAuditIssues.current().issues.filter(
    (entry) => entry.ruleId === "audit.logic.field-relationship-invalid",
  );
  assert.equal(issues.length, 2);
  assert.equal(new Set(issues.map((entry) => entry.stableKey)).size, 2);
  assert.deepEqual(audit, before);
});
test("incomplete and disabled field comparisons do not add relationship issues", async () => {
  const audit = completeAudit();
  audit.sources = ["A", "B"].map((sourceKey) => ({ sourceKey }));
  audit.steps = [
    {
      id: "disabled",
      enabled: false,
      step_type: "if_then",
      params: {
        then_action_type: "do_not_display",
        conditions_json: JSON.stringify([
          {
            id: "condition-1",
            sourceFile: "A",
            fieldName: "value",
            operator: "is equal to",
            valueMode: "field",
            compareSourceFile: "B",
            compareFieldName: "value",
          },
        ]),
      },
    },
    {
      id: "incomplete",
      enabled: true,
      step_type: "if_then",
      params: {
        then_action_type: "do_not_display",
        conditions_json: JSON.stringify([
          {
            id: "condition-2",
            sourceFile: "A",
            fieldName: "",
            operator: "is equal to",
            valueMode: "field",
            compareSourceFile: "B",
            compareFieldName: "value",
          },
        ]),
      },
    },
  ];
  const result = (await runtime(audit)).ATLASAuditIssues.current();
  assert.equal(
    result.issues.some(
      (entry) => entry.ruleId === "audit.logic.field-relationship-invalid",
    ),
    false,
  );
});

test("invalidation refreshes cached issue results without persistence", async () => {
  const audit = completeAudit();
  const context = await runtime(audit);
  const first = context.ATLASAuditIssues.current();
  audit.name = "";
  context.ATLASAuditIssues.invalidate();
  const second = context.ATLASAuditIssues.current();
  assert.notEqual(first, second);
  assert.ok(
    second.issues.some(
      (entry) => entry.ruleId === "audit.identity.name-missing",
    ),
  );
});

test("adapter uses lexical state without creating window.state", async () => {
  const context = await runtime(completeAudit());
  assert.equal(context.state, undefined);
  assert.equal(context.ATLASAuditIssues.current().issues.length, 0);
});

test("no selected audit returns no catalog-generated audit warnings", async () => {
  const context = await runtime(completeAudit(), { auditSelected: false });
  const result = context.ATLASAuditIssues.current();
  assert.equal(result.status, "ok");
  assert.equal(result.issues.length, 0);
});

test("current evaluates the selected lexical audit after refresh", async () => {
  const audit = completeAudit();
  const context = await runtime(audit);
  audit.name = "";
  context.ATLASAuditIssues.invalidate();
  const result = context.ATLASAuditIssues.current();
  assert.ok(
    result.issues.some(
      (entry) => entry.ruleId === "audit.identity.name-missing",
    ),
  );
  assert.equal(context.state, undefined);
});

test("audit switching isolates cached results by selected audit context", async () => {
  const context = await runtime(completeAudit());
  const first = context.ATLASAuditIssues.current();
  vm.runInContext(
    `state.audit = { ...state.audit, id: "audit-2", name: "" };`,
    context,
  );
  const second = context.ATLASAuditIssues.current();
  assert.notEqual(first, second);
  assert.ok(
    second.issues.some(
      (entry) => entry.ruleId === "audit.identity.name-missing",
    ),
  );
});

test("clearing selection removes stale selected-audit issues", async () => {
  const audit = completeAudit();
  audit.name = "";
  const context = await runtime(audit);
  assert.ok(context.ATLASAuditIssues.current().issues.length > 0);
  vm.runInContext("state.auditSelected = false;", context);
  context.ATLASAuditIssues.invalidate();
  assert.equal(context.ATLASAuditIssues.current().issues.length, 0);
});

test("workflow prerequisites show only no-sources when sources are absent", async () => {
  const audit = completeAudit();
  audit.sources = [];
  audit.steps = [];
  audit.displayFields = [];
  const result = (await runtime(audit)).ATLASAuditIssues.current();
  const rules = new Set(result.issues.map((entry) => entry.ruleId));
  assert.equal(rules.has("audit.sources.none"), true);
  assert.equal(rules.has("audit.logic.steps-none"), false);
  assert.equal(rules.has("audit.display.none"), false);
});

test("workflow prerequisites show no-logic only after sources exist", async () => {
  const audit = completeAudit();
  audit.steps = [];
  audit.displayFields = [];
  const result = (await runtime(audit)).ATLASAuditIssues.current();
  const rules = new Set(result.issues.map((entry) => entry.ruleId));
  assert.equal(rules.has("audit.sources.none"), false);
  assert.equal(rules.has("audit.logic.steps-none"), true);
  assert.equal(rules.has("audit.display.none"), false);
});

test("workflow prerequisites show no-display-fields after sources and logic exist", async () => {
  const audit = completeAudit();
  audit.displayFields = [];
  const result = (await runtime(audit)).ATLASAuditIssues.current();
  const rules = new Set(result.issues.map((entry) => entry.ruleId));
  assert.equal(rules.has("audit.sources.none"), false);
  assert.equal(rules.has("audit.logic.steps-none"), false);
  assert.equal(rules.has("audit.display.none"), true);
});

test("logic-referenced Display Field rows satisfy no-display-fields without manual additions", async () => {
  const audit = completeAudit();
  audit.displayFields = [];
  const context = await runtime(audit);
  context.requirementsFieldRows = () => [
    { key: "source.one::status", displayed: true, usedInLogic: true },
  ];
  const rules = new Set(
    context.ATLASAuditIssues.current().issues.map((entry) => entry.ruleId),
  );
  assert.equal(rules.has("audit.display.none"), false);
});

test("no-display-fields returns when every Display Field row is hidden", async () => {
  const context = await runtime(completeAudit());
  context.requirementsFieldRows = () => [];
  const rules = new Set(
    context.ATLASAuditIssues.current().issues.map((entry) => entry.ruleId),
  );
  assert.equal(rules.has("audit.display.none"), true);
});

test("hidden or removed Display Field preferences do not count as displayed", async () => {
  const audit = completeAudit();
  audit.displayFields = [
    { sourceKey: "source.one", rawFieldName: "Status", displayed: false },
    { sourceKey: "source.one", rawFieldName: "Other", removed: true },
  ];
  const rules = new Set(
    (await runtime(audit)).ATLASAuditIssues.current().issues.map(
      (entry) => entry.ruleId,
    ),
  );
  assert.equal(rules.has("audit.display.none"), true);
});

test("Audit Issues partial contains one complete root and one severity set", () => {
  const html = readFileSync(
    new URL("../sections/audit-issues.html", import.meta.url),
    "utf8",
  );
  assert.equal((html.match(/id="atlas-audit-issues-root"/g) || []).length, 1);
  assert.equal((html.match(/id="atlas-audit-issues-panel"/g) || []).length, 1);
  assert.equal(
    (html.match(/data-atlas-issue-severity="warning"/g) || []).length,
    1,
  );
});

function mountIssueTrigger(context) {
  const root = indicatorElement("div", { id: "atlas-audit-issues-root" });
  root.isConnected = true;
  const trigger = indicatorElement("button", {
    id: "atlas-audit-issues-trigger",
  });
  trigger.addEventListener = () => {};
  const count = indicatorElement("span", { id: "atlas-audit-issues-count" });
  count.hidden = true;
  count.textContent = "";
  const list = indicatorElement("div", { id: "atlas-audit-issues-list" });
  const page = indicatorElement("section", { className: "page active" });
  page.dataset.page = "overview";
  context.document = {
    body: indicatorElement("body"),
    documentElement: indicatorElement("html"),
    createElement: (tag) => indicatorElement(tag),
    getElementById(id) {
      if (id === "atlas-audit-issues-root") return root;
      if (id === "atlas-audit-issues-trigger") return trigger;
      if (id === "atlas-audit-issues-count") return count;
      if (id === "atlas-audit-issues-list") return list;
      return null;
    },
    querySelector(selector) {
      return selector === ".page.active" ? page : null;
    },
    querySelectorAll: () => [],
    addEventListener() {},
  };
  context.requestAnimationFrame = (callback) => {
    callback(0);
    return 0;
  };
  context.ATLASAuditIssues.render();
  return { trigger, count };
}

test("Issues circle keeps a count badge only when issues exist", async () => {
  const html = readFileSync(
    new URL("../sections/audit-issues.html", import.meta.url),
    "utf8",
  );
  assert.equal(html.includes("atlas-audit-issues__trigger-text"), false);
  assert.equal(html.includes("Audit status"), false);
  assert.match(
    html,
    /id="atlas-audit-issues-trigger"[\s\S]*aria-label="Issues"/,
  );
  assert.match(
    html,
    /id="atlas-audit-issues-count"[\s\S]*class="atlas-audit-issues__count"[\s\S]*hidden/,
  );
  const css = readFileSync(
    new URL("../css/audit-issues.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /\.atlas-audit-issues__count\[hidden\]\s*\{[^}]*display:\s*none/,
  );

  const clear = mountIssueTrigger(await runtime(completeAudit()));
  assert.equal(clear.count.hidden, true);
  assert.equal(clear.count.textContent, "");
  assert.equal(clear.trigger.getAttribute("aria-label"), "Issues");

  const audit = completeAudit();
  audit.name = "";
  const context = await runtime(audit);
  const open = mountIssueTrigger(context);
  const result = context.ATLASAuditIssues.current();
  const total =
    Number(result.counts?.critical || 0) + Number(result.counts?.warning || 0);
  assert.ok(total > 0);
  assert.equal(open.count.hidden, false);
  assert.equal(open.count.textContent, String(total));
  assert.equal(open.trigger.getAttribute("aria-label"), `Issues, ${total}`);
  assert.equal(/\b(?:issues|open)\b/i.test(open.count.textContent), false);
});

test("Readiness defines one canonical severity filter set", () => {
  const html = readFileSync(
    new URL("../sections/readiness-review.html", import.meta.url),
    "utf8",
  );
  assert.equal(
    (html.match(/data-atlas-issue-surface="readiness"/g) || []).length,
    3,
  );
  assert.equal((html.match(/id="validationPanel"/g) || []).length, 1);
});

test("server exposes the split CSS directory before application APIs", () => {
  const source = readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.ok(source.includes('"/css"'));
  assert.ok(source.includes('path.join(__dirname, "css")'));
  assert.ok(source.indexOf('"/css"') < source.indexOf('"/api/'));
});

test("Audit Issues visibility is synchronized at the central navigation boundary", () => {
  const source = readFileSync(
    new URL("../js/01-state-dom.js", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("globalThis.ATLASAuditIssues?.render?.()"));
  assert.ok(
    source.indexOf("globalThis.ATLASAuditIssues?.render?.()") >
      source.indexOf("atlasRenderPage?.(page)"),
  );
});

test("floating Audit Issues visibility is limited to Current Audit pages", () => {
  const expectedPages = [
    "overview",
    "fields",
    "steps",
    "display-fields",
    "preview",
    "review",
    "export",
  ];
  assert.ok(adapterSource.includes("const floatingSurfaceEligible"));
  expectedPages.forEach((page) =>
    assert.ok(adapterSource.includes(`"${page}"`), `expected ${page}`),
  );
  assert.ok(
    adapterSource.includes("elements.root.hidden = !floatingSurfaceEligible"),
  );
  assert.ok(
    adapterSource.includes(
      "if (!floatingSurfaceEligible) closeIssuePanel(false)",
    ),
  );
});

test("assignment fixes delegate to the shared assignment Visual Picker workflow", () => {
  assert.ok(adapterSource.includes('typeof api?.open !== "function"'));
  assert.ok(adapterSource.includes("return api.open(role"));
  assert.equal(adapterSource.includes("data-fix-directory"), false);
});
test("Audit Overview exposes one shared-picker trigger for each assignment role", () => {
  const html = readFileSync(
    new URL("../sections/audit-overview.html", import.meta.url),
    "utf8",
  );
  ["assigned", "backup", "developer"].forEach((role) =>
    assert.equal(
      (
        html.match(new RegExp(`data-open-assignment-picker="${role}"`, "g")) ||
        []
      ).length,
      1,
    ),
  );
  assert.equal(html.includes("assignmentAssignedSearch"), false);
  assert.equal(html.includes("assignmentBackupSearch"), false);
  assert.equal(html.includes("assignmentDeveloperSearch"), false);
});

test("every configured fix action has one registered implementation", () => {
  const catalog = JSON.parse(
    readFileSync(
      new URL("../catalogs/audit-issue-rules.json", import.meta.url),
      "utf8",
    ),
  );
  const configured = [
    ...new Set(catalog.rules.map((rule) => rule.fixAction).filter(Boolean)),
  ].sort();
  assert.deepEqual(configured, [
    "addAssignment",
    "addDisplayField",
    "addLogicStep",
    "addSource",
    "editAuditName",
    "editAuditPurpose",
    "repairIssue",
    "repairSourceReplacement",
  ]);
  configured.forEach((name) =>
    assert.equal(
      (adapterSource.match(new RegExp(`\\n    ${name}\\(`, "g")) || []).length,
      1,
    ),
  );
  assert.equal(adapterSource.includes("editJoin(entry"), false);
});

test("remediation shell contains focus, Escape, cancel, stale, and restoration guards", () => {
  assert.ok(adapterSource.includes('if (event.key === "Escape")'));
  assert.ok(adapterSource.includes('if (event.key !== "Tab") return'));
  assert.ok(
    adapterSource.includes(
      'event.target === root || event.target.closest("[data-fix-cancel]")',
    ),
  );
  assert.ok(adapterSource.includes("prior?.trigger?.isConnected"));
  assert.ok(adapterSource.includes("freshIssue(fix.key, fix.auditKey)"));
});

test("missing workflow adapters fail with actionable owning-workflow guidance", () => {
  assert.ok(
    adapterSource.includes(
      "The assignment selector is unavailable. Open Audit Overview",
    ),
  );
  assert.ok(
    adapterSource.includes("The source selector is unavailable. Open Sources"),
  );
  assert.ok(adapterSource.includes("error?.userMessage"));
});

test("every enabled rule can jump and fix", () => {
  const rules = JSON.parse(
    readFileSync(
      new URL("../catalogs/audit-issue-rules.json", import.meta.url),
      "utf8",
    ),
  ).rules.filter((rule) => rule.enabled);
  rules.forEach((rule) => {
    assert.ok(rule.jumpAction, `${rule.id} jump`);
    assert.ok(rule.fixAction, `${rule.id} fix`);
  });
  const joinRule = rules.find(
    (rule) => rule.id === "audit.logic.join-integrity",
  );
  assert.equal(joinRule.jumpAction, "openLogicTarget");
  assert.equal(joinRule.fixAction, "repairIssue");
});

test("issue findings name the control and fix kind", async () => {
  const nameAudit = completeAudit();
  nameAudit.name = "";
  const nameIssue = (
    await runtime(nameAudit)
  ).ATLASAuditIssues.current().issues.find(
    (entry) => entry.ruleId === "audit.identity.name-missing",
  );
  assert.equal(nameIssue.target.control, "audit-name");
  assert.equal(nameIssue.actionData.fixKind, "text");
  assert.equal(nameIssue.canJump, true);
  assert.equal(nameIssue.canFix, true);

  const conditionAudit = completeAudit();
  conditionAudit.steps[0].params.conditions_json = JSON.stringify([
    { id: "condition-1", fieldName: "", operator: "", valueMode: "values" },
  ]);
  const conditionIssue = (
    await runtime(conditionAudit)
  ).ATLASAuditIssues.current().issues.find((entry) =>
    entry.instanceId.endsWith("-field"),
  );
  assert.equal(conditionIssue.target.control, "condition-fieldName");
  assert.equal(conditionIssue.actionData.fixKind, "picker");

  const joinAudit = completeAudit();
  joinAudit.steps = [
    {
      id: "join-1",
      enabled: true,
      parentId: null,
      branchType: "root",
      step_type: "join",
      params: {
        join_type: "INNER JOIN",
        left_source: "Source One",
        right_source: "Source Two",
        left_field: "Status",
        right_field: "",
      },
    },
  ];
  const joinIssue = (
    await runtime(joinAudit)
  ).ATLASAuditIssues.current().issues.find(
    (entry) => entry.ruleId === "audit.logic.join-integrity",
  );
  assert.equal(joinIssue.target.control, "param:right_field");
  assert.equal(joinIssue.severity, "critical");
  assert.equal(joinIssue.actionData.fixKind, "picker");

  const displayAudit = completeAudit();
  displayAudit.displayFields = [
    { sourceKey: "source.one", rawFieldName: "Status" },
    { sourceKey: "source.one", rawFieldName: "Status" },
  ];
  const displayIssue = (
    await runtime(displayAudit)
  ).ATLASAuditIssues.current().issues.find(
    (entry) => entry.ruleId === "audit.display.integrity",
  );
  assert.equal(displayIssue.target.control, "display-row");
  assert.equal(displayIssue.actionData.repair, "remove-display");
  assert.equal(displayIssue.severity, "warning");
});

function mountIssueSurface(context, match) {
  const node = () => ({
    isConnected: true,
    hidden: false,
    dataset: {},
    className: "",
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {},
    appendChild() {},
    replaceChildren() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    remove() {},
    focus() {},
    textContent: "",
    innerHTML: "",
    append(child) {
      this.lastChild = child;
    },
  });
  const validation = node();
  context.document = {
    body: node(),
    getElementById(id) {
      return id === "validationPanel" ? validation : null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      return match(selector);
    },
    createElement(tag) {
      const element = node();
      element.tagName = String(tag || "").toUpperCase();
      element.querySelector = (selector) => {
        if (selector === "[data-fix-name]" || selector === "[data-fix-text]")
          return { value: "", focus() {} };
        if (selector === "[data-fix-save]") return {};
        if (selector === "[data-fix-error]") return { textContent: "" };
        if (selector.includes("textarea,input,button")) return { focus() {} };
        return null;
      };
      return element;
    },
    addEventListener() {},
  };
  context.requestAnimationFrame = (callback) => {
    callback(0);
    return 0;
  };
  context.ATLASAuditIssues.render();
}

test("jump highlights the control with the issue severity color", async () => {
  const audit = completeAudit();
  audit.id = "audit-1";
  audit.name = "";
  const context = await runtime(audit);
  const highlighted = [];
  const name = {
    id: "auditName",
    tagName: "INPUT",
    classList: {
      add(...names) {
        names.forEach((item) => highlighted.push(item));
      },
      remove() {},
    },
    hasAttribute() {
      return false;
    },
    setAttribute() {},
    focus() {
      name.focused = true;
    },
    scrollIntoView() {
      name.scrolled = true;
    },
  };
  mountIssueSurface(context, (selector) =>
    selector.includes("#auditName") ? [name] : [],
  );
  context.showSection = () => {};
  const opened = await context.ATLASAuditIssues.jumpToIssue(
    context.ATLASAuditIssues.current().issues.find(
      (entry) => entry.ruleId === "audit.identity.name-missing",
    ).stableKey,
  );
  assert.equal(opened, true);
  assert.equal(name.focused, true);
  assert.ok(highlighted.includes("atlas-issue-target--warning"));

  const criticalAudit = completeAudit();
  criticalAudit.id = "audit-2";
  criticalAudit.steps = [
    {
      id: "join-1",
      enabled: true,
      parentId: null,
      branchType: "root",
      step_type: "join",
      params: {
        join_type: "INNER JOIN",
        left_source: "Source One",
        right_source: "Source Two",
        left_field: "Status",
        right_field: "",
      },
    },
  ];
  const critical = await runtime(criticalAudit);
  const field = {
    tagName: "INPUT",
    classNames: new Set(),
    classList: {
      add(...names) {
        names.forEach((item) => field.classNames.add(item));
      },
      remove() {},
    },
    hasAttribute() {
      return true;
    },
    setAttribute() {},
    focus() {},
    scrollIntoView() {},
  };
  mountIssueSurface(critical, (selector) =>
    selector.includes("right_field") ? [field] : [],
  );
  critical.showSection = () => {};
  critical.atlasRevealLogicStep = () => true;
  await critical.ATLASAuditIssues.jumpToIssue(
    critical.ATLASAuditIssues.current().issues.find(
      (entry) => entry.target?.control === "param:right_field",
    ).stableKey,
  );
  assert.equal(field.classNames.has("atlas-issue-target--critical"), true);
});

test("system catalog failure can jump and retry", async () => {
  const context = await runtime(completeAudit(), {
    fetch: async () => {
      throw new Error("catalog offline");
    },
  });
  const issue = context.ATLASAuditIssues.current().issues[0];
  assert.equal(issue.category, "system");
  assert.equal(issue.canJump, true);
  assert.equal(issue.canFix, true);
  assert.equal(issue.jumpAction, "openSystemIssue");
  assert.equal(issue.fixAction, "retryIssueCheck");
  assert.equal(issue.target.control, "issue-refresh");
});

test("name fix opens an in-place dialog", async () => {
  const audit = completeAudit();
  audit.id = "audit-3";
  audit.name = "";
  const context = await runtime(audit);
  mountIssueSurface(context, () => []);
  const issue = context.ATLASAuditIssues.current().issues.find(
    (entry) => entry.ruleId === "audit.identity.name-missing",
  );
  const opened = await context.ATLASAuditIssues.fixIssue(issue.stableKey, {
    focus() {},
    isConnected: true,
  });
  assert.equal(opened, true);
  assert.match(context.document.body.lastChild.innerHTML, /data-fix-name/);
  assert.match(context.document.body.lastChild.innerHTML, /Save name/);
});

test("jump highlight uses warning and critical border tokens", () => {
  const css = readFileSync(
    new URL("../css/audit-issues.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /\.atlas-issue-target--warning[\s\S]*var\(--warn/);
  assert.match(css, /\.atlas-issue-target--critical[\s\S]*var\(--danger/);
  assert.match(adapterSource, /Jump to Issue/);
  assert.match(adapterSource, /atlas-issue-target--\$\{tone\}/);
});

test("math operand picker does not filter fields by numeric metadata", () => {
  const source = readFileSync(
    new URL("../js/15g-visual-ui-events.js", import.meta.url),
    "utf8",
  );
  assert.equal(source.includes("values = values.filter((item) =>"), false);
});

test("math validation warns for uncertain field numeric compatibility", () => {
  const source = readFileSync(
    new URL("../js/02-logic-rendering.js", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("math_operand_numeric_metadata_missing"));
  assert.ok(source.includes("math_operand_non_numeric_metadata"));
  assert.ok(source.includes("math_operand_identifier"));
});

test("math UI explicitly hides inactive operands and uses a bounded layout", () => {
  const css = readFileSync(
    new URL("../css/logic-builder.css", import.meta.url),
    "utf8",
  );
  assert.ok(css.includes(".math-number-operand[hidden]"));
  assert.ok(css.includes(".math-field-operand[hidden]"));
  assert.ok(
    css.includes("grid-template-columns: minmax(0, 1fr) minmax(0, 0.86fr)"),
  );
});

test("Review Feedback is projected outside the portable canonical issue engine", () => {
  assert.match(adapterSource, /renderReviewFeedback/);
  assert.match(adapterSource, /ATLASReviewFeedback/);
  assert.doesNotMatch(engineSource, /Review Feedback|ATLASReviewFeedback/);
});

function stringTransformValidator(value, prefix = "") {
  const operation = value[`${prefix}string_operation`] || "first_characters";
  const count = String(value[`${prefix}string_character_count`] ?? "").trim();
  if (operation !== "character_count" && !/^[1-9]\d*$/.test(count))
    return [
      {
        level: "error",
        code: "string_count",
        message: "Number of characters must be a positive whole number.",
      },
    ];
  return [];
}

test("invalid persisted Create Column string counts produce critical Audit Issues", async () => {
  for (const value of ["", "0", "-1", "1.5", "cat", "1e2"]) {
    const audit = completeAudit();
    audit.steps = [
      {
        id: "string-step",
        enabled: true,
        parentId: null,
        branchType: "root",
        step_type: "create_column",
        params: {
          column_name: "Result",
          value_mode: "String transformation",
          string_operation: "first_characters",
          string_source_file: "Source One",
          string_source_field: "Status",
          string_character_count: value,
        },
      },
    ];
    const context = await runtime(audit, {
      atlasValidateStringTransform: stringTransformValidator,
    });
    const issues = context.ATLASAuditIssues.current().issues.filter(
      (entry) => entry.ruleId === "audit.logic.string-transform-integrity",
    );
    assert.equal(
      issues.length,
      1,
      `expected issue for ${JSON.stringify(value)}`,
    );
    assert.equal(issues[0].severity, "critical");
    assert.equal(issues[0].target.stepId, "string-step");
  }
});

test("invalid persisted IF action string counts produce critical Audit Issues", async () => {
  const audit = completeAudit();
  audit.steps[0].params.then_action_type = "set_column_string_transform";
  Object.assign(audit.steps[0].params, {
    then_target_column: "Result",
    then_string_operation: "last_characters",
    then_string_source_file: "Source One",
    then_string_source_field: "Status",
    then_string_character_count: "cat",
  });
  const context = await runtime(audit, {
    atlasValidateStringTransform: stringTransformValidator,
  });
  const issues = context.ATLASAuditIssues.current().issues.filter(
    (entry) => entry.ruleId === "audit.logic.string-transform-integrity",
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, "critical");
});

test("Character Count ignores stale character-count data", async () => {
  const audit = completeAudit();
  audit.steps = [
    {
      id: "character-count-step",
      enabled: true,
      parentId: null,
      branchType: "root",
      step_type: "create_column",
      params: {
        column_name: "Length",
        value_mode: "String transformation",
        string_operation: "character_count",
        string_source_file: "Source One",
        string_source_field: "Status",
        string_character_count: "cat",
      },
    },
  ];
  const context = await runtime(audit, {
    atlasValidateStringTransform: stringTransformValidator,
  });
  assert.equal(
    context.ATLASAuditIssues.current().issues.some(
      (entry) => entry.ruleId === "audit.logic.string-transform-integrity",
    ),
    false,
  );
});

test("incomplete Concatenate fields produce critical Audit Issues", async () => {
  const audit = completeAudit();
  audit.steps = [
    {
      id: "concat-step",
      enabled: true,
      parentId: null,
      branchType: "root",
      step_type: "create_column",
      params: {
        column_name: "Combined",
        value_mode: "Concatenate fields",
        concat_field_2: "Status",
        concat_source_2: "Source One",
      },
    },
  ];
  const context = await runtime(audit);
  const issues = context.ATLASAuditIssues.current().issues.filter(
    (entry) =>
      entry.target.stepId === "concat-step" &&
      /Concatenate Fields rule/.test(entry.summary),
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, "critical");
  assert.match(issues[0].summary, /missing its first field or source/i);
});

test("complete Concatenate fields add no incomplete-rule issue", async () => {
  const audit = completeAudit();
  audit.steps = [
    {
      id: "concat-step",
      enabled: true,
      parentId: null,
      branchType: "root",
      step_type: "create_column",
      params: {
        column_name: "Combined",
        value_mode: "Concatenate fields",
        concat_field_1: "Status",
        concat_source_1: "Source One",
        concat_field_2: "Status",
        concat_source_2: "Source One",
      },
    },
  ];
  const context = await runtime(audit);
  const issues = context.ATLASAuditIssues.current().issues.filter(
    (entry) =>
      entry.target.stepId === "concat-step" &&
      /Concatenate Fields rule/.test(entry.summary),
  );
  assert.equal(issues.length, 0);
});

test("a named Create Column is not treated as a missing source field", async () => {
  const audit = completeAudit();
  audit.steps.push({
    id: "step_2d01d8c4",
    enabled: true,
    parentId: null,
    branchType: "root",
    step_type: "create_column",
    source: "source.one",
    field: "Bonus Flag",
    params: {
      value_mode: "Static value",
      column_name: "Bonus Flag",
      source_file: "source.one",
      expression_type: "custom_expression",
    },
  });
  const context = await runtime(audit, {
    sourceFiles: [
      {
        sourceKey: "source.one",
        sourceFile: "Source One",
        fields: [{ rawFieldName: "Status" }],
      },
    ],
  });
  const issues = context.ATLASAuditIssues.current().issues.filter(
    (entry) => entry.target?.stepId === "step_2d01d8c4",
  );
  assert.equal(
    issues.some(
      (entry) =>
        entry.summary ===
        "Logic references a field that is no longer available for its source.",
    ),
    false,
  );
});

test("Create Column source-field mode still flags a missing catalog field", async () => {
  const audit = completeAudit();
  audit.steps.push({
    id: "source-field-step",
    enabled: true,
    parentId: null,
    branchType: "root",
    step_type: "create_column",
    source: "source.one",
    field: "Copied Amount",
    params: {
      value_mode: "Source field value",
      column_name: "Copied Amount",
      source_file: "source.one",
      field_name: "Retired Field",
    },
  });
  const context = await runtime(audit, {
    sourceFiles: [
      {
        sourceKey: "source.one",
        sourceFile: "Source One",
        fields: [{ rawFieldName: "Status" }],
      },
    ],
  });
  const issues = context.ATLASAuditIssues.current().issues.filter(
    (entry) =>
      entry.target?.stepId === "source-field-step" &&
      entry.summary ===
        "Logic references a field that is no longer available for its source.",
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].target.control, "param:field_name");
});

test("comparing two created fields does not flag them as missing catalog fields", async () => {
  const audit = completeAudit();
  audit.steps = [
    {
      id: "column-a",
      enabled: true,
      parentId: null,
      branchType: "root",
      step_type: "create_column",
      params: {
        value_mode: "Static value",
        column_name: "test",
      },
    },
    {
      id: "column-b",
      enabled: true,
      parentId: null,
      branchType: "root",
      step_type: "create_column",
      params: {
        value_mode: "Static value",
        column_name: "test 2",
      },
    },
    {
      id: "compare-step",
      enabled: true,
      parentId: null,
      branchType: "root",
      step_type: "if_then",
      params: {
        then_action_type: "do_not_display",
        conditions_json: JSON.stringify([
          {
            id: "cond_2b8db257",
            sourceFile: "__created_columns__",
            fieldName: "test",
            operator: "is equal to",
            valueMode: "field",
            compareSourceFile: "__created_columns__",
            compareFieldName: "test 2",
            compareFieldRef: {
              kind: "created",
              creatorStepId: "column-b",
            },
          },
        ]),
      },
    },
  ];
  const context = await runtime(audit);
  const issues = context.ATLASAuditIssues.current().issues.filter(
    (entry) => entry.target?.stepId === "compare-step",
  );
  assert.equal(
    issues.filter(
      (entry) => entry.ruleId === "audit.sources.reference-integrity",
    ).length,
    0,
  );
  assert.equal(
    issues.filter(
      (entry) => entry.ruleId === "audit.logic.self-field-comparison",
    ).length,
    0,
  );
});

test("comparing a created field to itself warns once", async () => {
  const audit = completeAudit();
  audit.steps = [
    {
      id: "column-a",
      enabled: true,
      parentId: null,
      branchType: "root",
      step_type: "create_column",
      params: {
        value_mode: "Static value",
        column_name: "test",
      },
    },
    {
      id: "compare-step",
      enabled: true,
      parentId: null,
      branchType: "root",
      step_type: "if_then",
      params: {
        then_action_type: "do_not_display",
        conditions_json: JSON.stringify([
          {
            id: "cond_self",
            sourceFile: "__created_columns__",
            fieldName: "test",
            fieldRef: { kind: "created", creatorStepId: "column-a" },
            operator: "is equal to",
            valueMode: "field",
            compareSourceFile: "__created_columns__",
            compareFieldName: "test",
          },
        ]),
      },
    },
  ];
  const context = await runtime(audit);
  const issues = context.ATLASAuditIssues.current().issues.filter(
    (entry) => entry.target?.stepId === "compare-step",
  );
  const warnings = issues.filter(
    (entry) => entry.ruleId === "audit.logic.self-field-comparison",
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].severity, "warning");
  assert.equal(warnings[0].title, "Condition compares a field to itself");
  assert.equal(
    warnings[0].summary,
    'This condition compares "test" to itself. Choose a different field, or compare against a value.',
  );
  assert.equal(warnings[0].instanceId, "compare-step-cond_self-self-compare");
  assert.equal(warnings[0].target.page, "steps");
  assert.equal(warnings[0].target.conditionId, "cond_self");
  assert.equal(warnings[0].target.control, "condition-compareFieldName");
  assert.equal(
    issues.some(
      (entry) =>
        entry.ruleId === "audit.sources.reference-integrity" ||
        entry.ruleId === "audit.logic.created-reference" ||
        entry.severity === "critical",
    ),
    false,
  );
});

test("comparing an attached calculated field to itself warns once", async () => {
  const audit = completeAudit();
  audit.steps = [
    {
      id: "ref-source",
      enabled: true,
      parentId: null,
      branchType: "root",
      step_type: "reference_source",
      source: "source.one",
      params: { source_file: "source.one" },
    },
    {
      id: "attached-column",
      enabled: true,
      parentId: "ref-source",
      branchType: "then",
      step_type: "create_column",
      params: {
        value_mode: "Static value",
        column_name: "test",
      },
    },
    {
      id: "compare-step",
      enabled: true,
      parentId: null,
      branchType: "root",
      step_type: "if_then",
      params: {
        then_action_type: "do_not_display",
        conditions_json: JSON.stringify([
          {
            id: "cond_attached",
            sourceFile: "source.one",
            fieldName: "test",
            operator: "is equal to",
            valueMode: "field",
            compareSourceFile: "Source One",
            compareFieldName: "test",
          },
        ]),
      },
    },
  ];
  const context = await runtime(audit);
  const issues = context.ATLASAuditIssues.current().issues.filter(
    (entry) => entry.target?.stepId === "compare-step",
  );
  const warnings = issues.filter(
    (entry) => entry.ruleId === "audit.logic.self-field-comparison",
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].severity, "warning");
  assert.equal(
    issues.some(
      (entry) => entry.ruleId === "audit.sources.reference-integrity",
    ),
    false,
  );
});

test("comparing a catalog field to itself warns once", async () => {
  const audit = completeAudit();
  audit.steps[0].params.conditions_json = JSON.stringify([
    {
      id: "cond_status",
      sourceFile: "source.one",
      fieldName: "Status",
      operator: "is equal to",
      valueMode: "field",
      compareSourceFile: "source.one",
      compareFieldName: "Status",
    },
  ]);
  const context = await runtime(audit);
  const issues = context.ATLASAuditIssues.current().issues.filter(
    (entry) => entry.target?.stepId === "step-1",
  );
  const warnings = issues.filter(
    (entry) => entry.ruleId === "audit.logic.self-field-comparison",
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].severity, "warning");
  assert.equal(
    warnings[0].summary,
    'This condition compares "Status" to itself. Choose a different field, or compare against a value.',
  );
  assert.equal(
    issues.some((entry) => entry.severity === "critical"),
    false,
  );
});

test("comparing a catalog field to itself through an alias warns once", async () => {
  const audit = completeAudit();
  audit.steps[0].params.conditions_json = JSON.stringify([
    {
      id: "cond_alias",
      sourceFile: "Source One",
      fieldName: "Status",
      operator: "is equal to",
      valueMode: "field",
      compareSourceFile: "source.one",
      compareFieldName: "Status",
    },
  ]);
  const context = await runtime(audit);
  const warnings = context.ATLASAuditIssues.current().issues.filter(
    (entry) =>
      entry.target?.stepId === "step-1" &&
      entry.ruleId === "audit.logic.self-field-comparison",
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].severity, "warning");
});

test("comparing two different catalog fields does not self-compare warn", async () => {
  const audit = completeAudit();
  audit.sources.push({ sourceKey: "source.two", sourceFile: "Source Two" });
  audit.fields.push(
    { sourceKey: "source.one", rawFieldName: "Amount", name: "Amount" },
    { sourceKey: "source.two", rawFieldName: "Status", name: "Status" },
  );
  audit.steps[0].params.conditions_json = JSON.stringify([
    {
      id: "cond_fields",
      sourceFile: "source.one",
      fieldName: "Status",
      operator: "is equal to",
      valueMode: "field",
      compareSourceFile: "source.one",
      compareFieldName: "Amount",
    },
    {
      id: "cond_sources",
      sourceFile: "source.one",
      fieldName: "Status",
      operator: "is equal to",
      valueMode: "field",
      compareSourceFile: "source.two",
      compareFieldName: "Status",
    },
  ]);
  const context = await runtime(audit);
  const warnings = context.ATLASAuditIssues.current().issues.filter(
    (entry) => entry.ruleId === "audit.logic.self-field-comparison",
  );
  assert.equal(warnings.length, 0);
});

test("unmatched source replacement gaps are critical and suppress the generic missing-source issue", async () => {
  const audit = completeAudit();
  audit.sources = [{ sourceKey: "source.two", sourceFile: "Source Two" }];
  audit.steps.push({
    id: "legacy-step",
    enabled: true,
    parentId: null,
    branchType: "root",
    step_type: "if_then",
    source: "source.one",
    field: "Legacy",
    params: {
      source_file: "source.one",
      field_name: "Legacy",
      then_action_type: "do_not_display",
      conditions_json: "[]",
    },
  });
  audit.unmatchedSourceReplacements = {
    fields: [
      {
        id: "source.one::Legacy",
        originalSourceKey: "source.one",
        originalSourceFile: "Source One",
        originalField: "Legacy",
        replacementSourceKeys: ["source.two", "source.three"],
      },
    ],
    sources: [
      {
        sourceKey: "source.three",
        sourceFile: "Source Three",
        replacedSourceKey: "source.one",
        replacedSourceFile: "Source One",
      },
    ],
  };
  const context = await runtime(audit);
  const issues = context.ATLASAuditIssues.current().issues;
  const unmatched = issues.filter(
    (entry) => entry.ruleId === "audit.sources.replacement-unmatched",
  );
  assert.equal(unmatched.length, 2);
  assert.ok(unmatched.every((entry) => entry.severity === "critical"));
  assert.ok(
    unmatched.every((entry) => entry.jumpAction === "openSourceReplacement"),
  );
  const fieldIssue = unmatched.find((entry) => /Legacy/.test(entry.summary));
  const sourceIssue = unmatched.find((entry) =>
    /Source Three/.test(entry.summary),
  );
  assert.match(fieldIssue.summary, /source\.two, source\.three/);
  assert.match(sourceIssue.summary, /no fields were matched to it/);
  assert.equal(
    issues.some(
      (entry) =>
        entry.target?.stepId === "legacy-step" &&
        entry.summary ===
          "Logic references a source that is not selected for this audit.",
    ),
    false,
  );
});

test("indicator tone prefers critical and ignores closed issues", async () => {
  const context = await runtime(completeAudit());
  const tone = context.ATLASAuditIssues.indicatorTone;
  assert.equal(tone([{ severity: "warning" }]), "warning");
  assert.equal(
    tone([{ severity: "warning" }, { severity: "critical" }]),
    "critical",
  );
  assert.equal(
    tone([
      { severity: "warning", status: "resolved" },
      { severity: "critical", state: "closed" },
      { severity: "critical", resolved: true },
    ]),
    "",
  );
  assert.equal(tone([{ severity: "ok" }]), "");
  assert.equal(tone([]), "");
});

function indicatorElement(tag, { id = "", className = "", dataset = {} } = {}) {
  const node = {
    nodeType: 1,
    tagName: String(tag || "div").toUpperCase(),
    id,
    className,
    hidden: false,
    type: "",
    dataset: { ...dataset },
    children: [],
    parentElement: null,
    attributes: new Map(),
  };
  node.classList = {
    add(name) {
      const names = new Set(node.className.split(/\s+/).filter(Boolean));
      names.add(name);
      node.className = [...names].join(" ");
    },
    remove(name) {
      node.className = node.className
        .split(/\s+/)
        .filter((item) => item && item !== name)
        .join(" ");
    },
    toggle(name, force) {
      const has = node.className.split(/\s+/).includes(name);
      const next = force == null ? !has : Boolean(force);
      if (next) node.classList.add(name);
      else node.classList.remove(name);
      return next;
    },
    contains(name) {
      return node.className.split(/\s+/).includes(name);
    },
  };
  node.getAttribute = (name) =>
    node.attributes.has(name) ? node.attributes.get(name) : null;
  node.setAttribute = (name, value) => {
    node.attributes.set(name, String(value));
  };
  node.append = (child) => {
    child.parentElement = node;
    node.children.push(child);
  };
  node.appendChild = (child) => {
    node.append(child);
    return child;
  };
  node.replaceChildren = (...next) => {
    node.children.splice(0).forEach((child) => {
      child.parentElement = null;
    });
    next.forEach((child) => node.append(child));
  };
  Object.defineProperty(node, "childElementCount", {
    get() {
      return node.children.length;
    },
  });
  node.remove = () => {
    node.parentElement?.children?.splice?.(
      node.parentElement.children.indexOf(node),
      1,
    );
    node.parentElement = null;
  };
  node.matches = (selector) => indicatorMatches(node, selector);
  node.closest = (selector) => {
    let current = node;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  };
  node.querySelectorAll = (selector) => {
    const found = [];
    const walk = (item) => {
      if (indicatorMatches(item, selector)) found.push(item);
      item.children?.forEach(walk);
    };
    node.children.forEach(walk);
    return found;
  };
  node.querySelector = (selector) => {
    if (selector.startsWith(":scope > ")) {
      const names = selector
        .slice(":scope > ".length)
        .split(",")
        .map((part) => part.trim().replace(":scope > ", "").toLowerCase());
      return (
        node.children.find((child) =>
          names.includes(child.tagName.toLowerCase()),
        ) || null
      );
    }
    return node.querySelectorAll(selector)[0] || null;
  };
  return node;
}

function indicatorMatches(node, selector) {
  const raw = String(selector || "").trim();
  if (!raw) return false;
  if (raw.includes(","))
    return raw.split(",").some((part) => indicatorMatches(node, part.trim()));
  let rest = raw;
  if (/^[a-z][\w-]*$/i.test(rest)) return node.tagName === rest.toUpperCase();
  if (rest.startsWith("#")) {
    const id = rest.slice(1).split(/[.[#\s]/)[0];
    if (node.id !== id) return false;
    rest = rest.slice(id.length + 1);
  }
  const classes = [...rest.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
  if (classes.some((name) => !node.className.split(/\s+/).includes(name)))
    return false;
  const attrs = [...rest.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)];
  for (const [, key, value] of attrs) {
    const prop = key.startsWith("data-")
      ? key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
      : "";
    const actual = prop ? node.dataset[prop] : node.getAttribute(key);
    if (value == null) {
      if (actual == null || actual === "") return false;
    } else if (actual !== value) return false;
  }
  return true;
}

test("open issues show a floating indicator beside each linked surface", async () => {
  const audit = completeAudit();
  audit.name = "";
  audit.sources = [
    { sourceKey: "source.one", sourceFile: "Source One" },
    { sourceKey: "source.two", sourceFile: "Source Two" },
  ];
  audit.steps = [
    {
      id: "join-1",
      enabled: true,
      parentId: null,
      branchType: "root",
      step_type: "join",
      params: {
        join_type: "",
        left_source: "Source One",
        right_source: "Source Two",
        left_field: "Status",
        right_field: "",
      },
    },
    {
      id: "clean-step",
      enabled: true,
      parentId: null,
      branchType: "root",
      step_type: "if_then",
      params: {
        then_action_type: "do_not_display",
        conditions_json: JSON.stringify([
          {
            id: "condition-1",
            fieldName: "Status",
            operator: "is equal to",
            valueMode: "values",
            compareValue: "Inactive",
          },
        ]),
      },
    },
  ];
  const context = await runtime(audit);
  const body = indicatorElement("body");
  const nameLabel = indicatorElement("label");
  const name = indicatorElement("input", { id: "auditName" });
  nameLabel.append(name);
  const joinCard = indicatorElement("div", {
    className: "logic-rule-card step-card",
    dataset: { id: "join-1" },
  });
  const cleanCard = indicatorElement("div", {
    className: "logic-rule-card step-card",
    dataset: { id: "clean-step" },
  });
  const tableRow = indicatorElement("tr", {
    dataset: { tableStepId: "join-1" },
  });
  const tableCell = indicatorElement("td");
  tableRow.append(tableCell);
  const editor = indicatorElement("div", {
    dataset: { liveEditorStepId: "join-1" },
  });
  const previewRow = indicatorElement("tr", {
    dataset: { previewStepId: "join-1" },
  });
  const previewCell = indicatorElement("td");
  previewRow.append(previewCell);
  [nameLabel, joinCard, cleanCard, tableRow, editor, previewRow].forEach(
    (node) => body.append(node),
  );
  context.document = {
    body,
    documentElement: indicatorElement("html"),
    createElement: (tag) => indicatorElement(tag),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: (selector) => body.querySelectorAll(selector),
  };
  const marker = (host) =>
    host.children.find((child) => child.dataset.atlasIssueIndicator);
  context.ATLASAuditIssues.syncIndicators();
  assert.equal(marker(nameLabel)?.dataset.status, "warning");
  assert.equal(marker(nameLabel)?.getAttribute("aria-label"), "Open warning");
  assert.equal(
    marker(nameLabel)?.children[0]?.className,
    "atlas-audit-issues__icon",
  );
  assert.equal(marker(joinCard)?.dataset.status, "critical");
  assert.equal(
    marker(joinCard)?.getAttribute("aria-label"),
    "Open critical error",
  );
  assert.equal(marker(tableCell)?.dataset.status, "critical");
  assert.equal(marker(editor)?.dataset.status, "critical");
  assert.equal(marker(previewCell)?.dataset.status, "critical");
  assert.equal(marker(cleanCard), undefined);

  audit.name = "Named audit";
  audit.steps[0].params.join_type = "INNER JOIN";
  audit.steps[0].params.right_field = "Status";
  context.ATLASAuditIssues.invalidate();
  context.ATLASAuditIssues.syncIndicators();
  assert.equal(marker(nameLabel), undefined);
  assert.equal(marker(joinCard), undefined);
  assert.equal(marker(tableCell), undefined);
  assert.equal(marker(editor), undefined);
  assert.equal(marker(previewCell), undefined);
});

function issueContextLines(context) {
  const list = indicatorElement("div", { id: "atlas-audit-issues-list" });
  const root = indicatorElement("div", { id: "atlas-audit-issues-root" });
  root.isConnected = true;
  const page = indicatorElement("section", { className: "page active" });
  page.dataset.page = "steps";
  context.document = {
    body: indicatorElement("body"),
    documentElement: indicatorElement("html"),
    createElement: (tag) => indicatorElement(tag),
    getElementById(id) {
      if (id === "atlas-audit-issues-root") return root;
      if (id === "atlas-audit-issues-list") return list;
      return null;
    },
    querySelector(selector) {
      return selector === ".page.active" ? page : null;
    },
    querySelectorAll: () => [],
    addEventListener() {},
  };
  context.requestAnimationFrame = (callback) => {
    callback(0);
    return 0;
  };
  context.ATLASAuditIssues.render();
  return list
    .querySelectorAll(".atlas-audit-issue-card__context")
    .map((node) => node.textContent);
}

test("issue lists are built only while visible and reused while unchanged", async () => {
  const audit = completeAudit();
  audit.steps = [brokenConditionStep("step_hidden_panel")];
  const context = await runtime(audit);
  const panel = indicatorElement("div", { id: "atlas-audit-issues-panel" });
  panel.hidden = true;
  panel.addEventListener = () => {};
  const list = indicatorElement("div", { id: "atlas-audit-issues-list" });
  list.parentElement = panel;
  const root = indicatorElement("div", { id: "atlas-audit-issues-root" });
  root.isConnected = true;
  const page = indicatorElement("section", { className: "page active" });
  page.dataset.page = "steps";
  context.document = {
    body: indicatorElement("body"),
    documentElement: indicatorElement("html"),
    createElement: (tag) => indicatorElement(tag),
    getElementById(id) {
      if (id === "atlas-audit-issues-root") return root;
      if (id === "atlas-audit-issues-list") return list;
      if (id === "atlas-audit-issues-panel") return panel;
      return null;
    },
    querySelector(selector) {
      return selector === ".page.active" ? page : null;
    },
    querySelectorAll: () => [],
    addEventListener() {},
  };
  context.requestAnimationFrame = (callback) => {
    callback(0);
    return 0;
  };
  const cards = () => list.querySelectorAll(".atlas-audit-issue-card");

  context.ATLASAuditIssues.render();
  assert.equal(cards().length, 0, "a closed panel is not rendered");

  panel.hidden = false;
  context.ATLASAuditIssues.render();
  const first = cards();
  assert.ok(first.length > 0, "an open panel lists its issues");

  context.ATLASAuditIssues.render();
  assert.equal(cards()[0], first[0], "an unchanged result keeps its cards");

  // The app reports audit changes (invalidate or an autosave request).
  audit.steps.push(brokenConditionStep("step_hidden_panel_2"));
  context.ATLASAuditIssues.invalidate();
  assert.ok(cards().length > first.length, "a changed result is re-rendered");
});

test("DOM-change indicator sync paints from the last issue render", async () => {
  const audit = completeAudit();
  audit.steps = [brokenConditionStep("step_dom_sync")];
  const context = await runtime(audit);
  const card = indicatorElement("div", {
    className: "logic-rule-card step-card",
    dataset: { id: "step_dom_sync" },
  });
  const body = indicatorElement("body");
  body.children.push(card);
  card.parentElement = body;
  const root = indicatorElement("div", { id: "atlas-audit-issues-root" });
  root.isConnected = true;
  const page = indicatorElement("section", { className: "page active" });
  page.dataset.page = "steps";
  context.document = {
    body,
    documentElement: indicatorElement("html"),
    createElement: (tag) => indicatorElement(tag),
    getElementById: (id) => (id === "atlas-audit-issues-root" ? root : null),
    querySelector: (selector) => (selector === ".page.active" ? page : null),
    querySelectorAll: (selector) => body.querySelectorAll(selector),
    addEventListener() {},
  };
  context.requestAnimationFrame = (callback) => {
    callback(0);
    return 0;
  };
  const marker = () =>
    card.children.find((child) => child.dataset?.atlasIssueIndicator);

  context.ATLASAuditIssues.syncIndicatorsAfterDomChange();
  assert.equal(marker(), undefined, "nothing is painted before a render");

  context.ATLASAuditIssues.render();
  card.children.splice(0);
  context.ATLASAuditIssues.syncIndicatorsAfterDomChange();
  assert.ok(marker(), "a re-rendered card gets its marker back");
});

test("issue renders wait until change requests pause and run once", async () => {
  const audit = completeAudit();
  const context = await runtime(audit);
  const root = indicatorElement("div", { id: "atlas-audit-issues-root" });
  root.isConnected = true;
  const page = indicatorElement("section", { className: "page active" });
  page.dataset.page = "steps";
  let renders = 0;
  context.document = {
    body: indicatorElement("body"),
    documentElement: indicatorElement("html"),
    createElement: (tag) => indicatorElement(tag),
    getElementById: (id) => (id === "atlas-audit-issues-root" ? root : null),
    querySelector(selector) {
      if (selector === ".page.active") renders += 1;
      return selector === ".page.active" ? page : null;
    },
    querySelectorAll: () => [],
    addEventListener() {},
  };
  context.requestAnimationFrame = (callback) => {
    callback(0);
    return 0;
  };
  const timers = new Map();
  let nextTimer = 1;
  context.setTimeout = (callback) => {
    timers.set(nextTimer, callback);
    return nextTimer++;
  };
  context.clearTimeout = (id) => timers.delete(id);
  const flush = () => {
    const pending = [...timers.values()];
    timers.clear();
    pending.forEach((callback) => callback());
  };

  context.ATLASAuditIssues.render();
  context.ATLASAuditIssues.render();
  context.ATLASAuditIssues.invalidate();
  assert.equal(renders, 0, "nothing renders while changes are arriving");
  assert.equal(timers.size, 1, "requests share one pending render");
  flush();
  assert.equal(renders, 1);
});

test("scoped indicator sync paints only the nodes it is given", async () => {
  const audit = completeAudit();
  audit.steps = [
    brokenConditionStep("step_in_view"),
    brokenConditionStep("step_elsewhere"),
  ];
  const context = await runtime(audit);
  const body = indicatorElement("body");
  const card = (id) => {
    const node = indicatorElement("div", {
      className: "logic-rule-card step-card",
      dataset: { id },
    });
    body.children.push(node);
    node.parentElement = body;
    return node;
  };
  const added = card("step_in_view");
  const untouched = card("step_elsewhere");
  const root = indicatorElement("div", { id: "atlas-audit-issues-root" });
  root.isConnected = true;
  const page = indicatorElement("section", { className: "page active" });
  page.dataset.page = "steps";
  context.document = {
    body,
    documentElement: indicatorElement("html"),
    createElement: (tag) => indicatorElement(tag),
    getElementById: (id) => (id === "atlas-audit-issues-root" ? root : null),
    querySelector: (selector) => (selector === ".page.active" ? page : null),
    querySelectorAll: (selector) => body.querySelectorAll(selector),
    addEventListener() {},
  };
  context.requestAnimationFrame = (callback) => {
    callback(0);
    return 0;
  };
  const marker = (node) =>
    node.children.find((child) => child.dataset?.atlasIssueIndicator);

  context.ATLASAuditIssues.render();
  added.children.splice(0);
  untouched.children.splice(0);
  context.ATLASAuditIssues.syncIndicatorsWithin([added]);
  assert.ok(marker(added), "the added card gets its marker");
  assert.equal(marker(untouched), undefined, "other nodes are left alone");
});

function issueListHarness(context, created = { articles: 0 }) {
  const list = indicatorElement("div", { id: "atlas-audit-issues-list" });
  const root = indicatorElement("div", { id: "atlas-audit-issues-root" });
  root.isConnected = true;
  const page = indicatorElement("section", { className: "page active" });
  page.dataset.page = "steps";
  context.document = {
    body: indicatorElement("body"),
    documentElement: indicatorElement("html"),
    createElement(tag) {
      if (tag === "article") created.articles += 1;
      return indicatorElement(tag);
    },
    getElementById(id) {
      if (id === "atlas-audit-issues-root") return root;
      if (id === "atlas-audit-issues-list") return list;
      return null;
    },
    querySelector: (selector) => (selector === ".page.active" ? page : null),
    querySelectorAll: () => [],
    addEventListener() {},
  };
  return () =>
    Array.from(
      list.querySelectorAll(".atlas-audit-issue-card"),
      (card) => card.dataset.reviewIssueKey,
    );
}

const manyBrokenSteps = (count) =>
  Array.from({ length: count }, (_, index) =>
    brokenConditionStep(`step_many_${index}`),
  );

test("long issue lists fill in over frames, as a one-pass build would", async () => {
  const audit = completeAudit();
  audit.steps = manyBrokenSteps(130);
  const context = await runtime(audit);
  const cards = issueListHarness(context);
  const frames = [];
  context.requestAnimationFrame = (callback) => frames.push(callback);
  context.ATLASAuditIssues.render();
  frames.shift()(0); // the issue render itself
  assert.equal(cards().length, 100, "the first frame shows the first batch");
  while (frames.length) frames.shift()(0);
  assert.ok(cards().length > 100, "later frames add the rest");

  const oneFrame = await runtime(structuredClone(audit));
  const oneFrameCards = issueListHarness(oneFrame);
  oneFrame.ATLASAuditIssues.render();
  assert.deepEqual(cards(), oneFrameCards(), "same cards in the same order");
});

test("a new issue render stops the batches of the previous one", async () => {
  const audit = completeAudit();
  audit.steps = manyBrokenSteps(500);
  const context = await runtime(audit);
  const created = { articles: 0 };
  const cards = issueListHarness(context, created);
  const frames = [];
  context.requestAnimationFrame = (callback) => frames.push(callback);
  context.ATLASAuditIssues.render();
  frames.shift()(0);
  assert.equal(cards().length, 100);

  audit.steps.splice(2);
  context.ATLASAuditIssues.invalidate();
  created.articles = 0;
  while (frames.length) frames.shift()(0);
  const fewer = cards();
  assert.ok(fewer.length > 0 && fewer.length < 100, "only the new result");
  assert.ok(fewer.every((key) => /step_many_[01]-/.test(key)));
  // A batch already queued before the new render may still run; none after.
  assert.ok(
    created.articles <= 200 + fewer.length,
    "the old render stops after the new one",
  );
});

function brokenConditionStep(id, parentId = null) {
  return {
    id,
    enabled: true,
    parentId,
    branchType: parentId ? "then" : "root",
    step_type: "if_then",
    params: {
      then_action_type: "do_not_display",
      conditions_json: JSON.stringify([
        {
          id: "cond_92dbe63a",
          fieldName: "",
          operator: "",
          valueMode: "values",
          compareValue: "",
        },
      ]),
    },
  };
}

test("issue cards show the rules-list step number instead of the step id", async () => {
  const ordered = completeAudit();
  ordered.steps = [
    brokenConditionStep("step_2d01d8c4"),
    {
      id: "step_join_first",
      enabled: true,
      parentId: null,
      branchType: "root",
      step_type: "join",
      params: {
        join_type: "INNER JOIN",
        left_source: "Source One",
        right_source: "Source One",
        left_field: "Status",
        right_field: "Status",
      },
    },
  ];
  const orderedContext = await runtime(ordered);
  const orderedIssue = orderedContext.ATLASAuditIssues.current().issues.find(
    (entry) => entry.target?.conditionId === "cond_92dbe63a",
  );
  assert.equal(orderedIssue.target.stepId, "step_2d01d8c4");
  const orderedLines = issueContextLines(orderedContext).filter((line) =>
    line.includes("Condition cond_92dbe63a"),
  );
  assert.ok(orderedLines.length > 0);
  assert.deepEqual(
    [...new Set(orderedLines)],
    ["Step 2 · Condition cond_92dbe63a"],
  );

  const nested = completeAudit();
  nested.steps = [
    {
      id: "step_parent",
      enabled: true,
      parentId: null,
      branchType: "root",
      step_type: "if_then",
      params: {
        then_action_type: "do_not_display",
        conditions_json: JSON.stringify([
          {
            id: "cond_parent",
            fieldName: "Status",
            operator: "is equal to",
            valueMode: "values",
            compareValue: "Inactive",
          },
        ]),
      },
    },
    brokenConditionStep("step_2d01d8c4", "step_parent"),
  ];
  const nestedLines = issueContextLines(await runtime(nested)).filter((line) =>
    line.includes("Condition cond_92dbe63a"),
  );
  assert.deepEqual(
    [...new Set(nestedLines)],
    ["Step 1.1 · Condition cond_92dbe63a"],
  );

  const missing = completeAudit();
  missing.steps = [brokenConditionStep("step_2d01d8c4", "step_missing_parent")];
  const missingLines = issueContextLines(await runtime(missing));
  assert.ok(
    missingLines.some((line) => line === "Step · Condition cond_92dbe63a"),
  );
  assert.equal(
    missingLines.some((line) => line.includes("step_")),
    false,
  );
});

const rootStep = (id, step_type, params, extra = {}) => ({
  id,
  enabled: true,
  parentId: null,
  branchType: "root",
  step_type,
  params,
  ...extra,
});
const issuesFor = (context, stepId, ruleId) =>
  context.ATLASAuditIssues.current().issues.filter(
    (entry) => entry.target?.stepId === stepId && entry.ruleId === ruleId,
  );

test("stale conditions on non-condition steps are not checked", async () => {
  const audit = completeAudit();
  const stale = [{ id: "c", fieldName: "", operator: "", compareValue: "" }];
  audit.steps.push(
    rootStep(
      "join-step",
      "join",
      {
        join_type: "INNER JOIN",
        left_source: "Source One",
        right_source: "Source One",
        left_field: "Status",
        right_field: "Status",
      },
      { conditions: stale },
    ),
    rootStep(
      "column-step",
      "create_column",
      { value_mode: "Static value", column_name: "Flag", static_value: "Y" },
      { conditions: stale },
    ),
    rootStep(
      "sort-step",
      "sort",
      { source_file: "Source One", field_name: "Status" },
      { conditions: stale },
    ),
  );
  const context = await runtime(audit);
  ["join-step", "column-step", "sort-step"].forEach((stepId) =>
    assert.equal(
      issuesFor(context, stepId, "audit.logic.condition-integrity").length,
      0,
      stepId,
    ),
  );
});

test("if/then step with a blank condition field is still flagged", async () => {
  const audit = completeAudit();
  audit.steps[0].params.conditions_json = JSON.stringify([
    { id: "c", fieldName: "", operator: "is equal to", compareValue: "x" },
  ]);
  const context = await runtime(audit);
  assert.ok(
    issuesFor(context, "step-1", "audit.logic.condition-integrity").length,
  );
});

test("blank operators do not require a comparison value", async () => {
  const audit = completeAudit();
  audit.steps[0].params.conditions_json = JSON.stringify([
    {
      id: "c",
      fieldName: "Status",
      operator: "is blank/null",
      valueMode: "values",
      compareValue: "",
    },
  ]);
  const context = await runtime(audit);
  assert.equal(
    issuesFor(context, "step-1", "audit.logic.condition-integrity").length,
    0,
  );
});

test("steps using a created column are not invalid references", async () => {
  const audit = completeAudit();
  audit.steps.push(
    rootStep("column-step", "create_column", {
      value_mode: "Static value",
      column_name: "Bonus Flag",
      static_value: "Y",
    }),
    rootStep("sort-step", "sort", {
      source_file: "Source One",
      field_name: "Bonus Flag",
      field_name_field_ref: {
        kind: "created",
        creatorStepId: "column-step",
      },
    }),
    rootStep("legacy-sort-step", "sort", {
      source_file: "Source One",
      field_name: "Bonus Flag",
    }),
  );
  const context = await runtime(audit);
  ["sort-step", "legacy-sort-step"].forEach((stepId) =>
    assert.equal(
      issuesFor(context, stepId, "audit.sources.reference-integrity").length,
      0,
      stepId,
    ),
  );
});

test("missing field on a non-condition step is still flagged", async () => {
  const audit = completeAudit();
  audit.steps.push(
    rootStep("sort-step", "sort", {
      source_file: "Source One",
      field_name: "Removed Field",
    }),
  );
  const context = await runtime(audit, {
    sourceFiles: [
      {
        sourceKey: "source.one",
        sourceFile: "Source One",
        fields: [{ rawFieldName: "Status" }],
      },
    ],
  });
  assert.ok(
    issuesFor(context, "sort-step", "audit.sources.reference-integrity").length,
  );
});

test("custom source fields are valid references", async () => {
  const audit = completeAudit();
  audit.sources.push({ sourceKey: "custom.upload", sourceFile: "My Upload" });
  audit.steps.push(
    rootStep("sort-step", "sort", {
      source_file: "My Upload",
      field_name: "Amount",
    }),
  );
  const context = await runtime(audit, {
    sourceFiles: [
      {
        sourceKey: "source.one",
        sourceFile: "Source One",
        fields: [{ rawFieldName: "Status" }],
      },
      {
        sourceKey: "custom.upload",
        sourceFile: "My Upload",
        fields: [{ rawFieldName: "Amount" }],
      },
    ],
  });
  assert.equal(
    issuesFor(context, "sort-step", "audit.sources.reference-integrity").length,
    0,
  );
});

test("incremental issue checks match a fresh check after every edit", async () => {
  const conditionStep = (id, extra = {}) => ({
    id,
    enabled: true,
    parentId: null,
    branchType: "root",
    step_type: "if_then",
    params: {
      then_action_type: "do_not_display",
      conditions_json: JSON.stringify([
        {
          id: `${id}-c`,
          sourceFile: "Source One",
          fieldName: "Status",
          operator: "is equal to",
          valueMode: "values",
          compareValue: "Inactive",
        },
      ]),
    },
    ...extra,
  });
  const audit = completeAudit();
  audit.sources.push({ sourceKey: "source.two", sourceFile: "Source Two" });
  audit.steps = [
    conditionStep("a"),
    conditionStep("b"),
    {
      id: "join",
      enabled: true,
      parentId: null,
      branchType: "root",
      step_type: "join",
      params: {
        join_type: "INNER JOIN",
        left_source: "Source One",
        right_source: "Source Two",
        left_field: "Status",
        right_field: "",
      },
    },
    {
      id: "calc",
      enabled: true,
      parentId: null,
      branchType: "root",
      step_type: "create_column",
      params: { column_name: "Flag", value_mode: "Static value" },
    },
    conditionStep("c", { parentId: "a", branchType: "then" }),
  ];
  const context = await runtime(audit);
  const keys = (result) =>
    Array.from(result.issues, (entry) => `${entry.stableKey}|${entry.summary}`);
  const check = async (label) => {
    context.ATLASAuditIssues.invalidate();
    const fresh = await runtime(structuredClone(audit));
    assert.deepEqual(
      keys(context.ATLASAuditIssues.current()),
      keys(fresh.ATLASAuditIssues.current()),
      label,
    );
  };
  const conditions = (step) => JSON.parse(step.params.conditions_json);
  const setConditions = (step, list) => {
    step.params.conditions_json = JSON.stringify(list);
  };

  await check("initial");
  const b = audit.steps[1];
  setConditions(
    b,
    conditions(b).map((item) => ({ ...item, operator: "", fieldName: "" })),
  );
  await check("one step's condition broken");
  setConditions(b, [{ ...conditions(b)[0], operator: "is equal to" }]);
  await check("the same step partly repaired");
  audit.steps[2].params.right_field = "Status";
  await check("join completed");
  audit.steps[3].params.column_name = "Status";
  await check("created column renamed onto a catalog field");
  audit.steps.splice(1, 0, conditionStep("new"));
  await check("step inserted");
  audit.steps.splice(0, 1);
  await check("step removed");
  audit.steps.find((step) => step.id === "c").parentId = "missing";
  await check("parent removed from under a step");
  audit.steps.push(
    conditionStep("self", {
      params: {
        then_action_type: "do_not_display",
        conditions_json: JSON.stringify([
          {
            id: "self-c",
            sourceFile: "Source One",
            fieldName: "Status",
            operator: "is equal to",
            valueMode: "field",
            compareSourceFile: "S1",
            compareFieldName: "Status",
          },
        ]),
      },
    }),
  );
  await check("condition compares a field through an unknown alias");
  const selfBefore = keys(context.ATLASAuditIssues.current());
  audit.sources[0].alias = "S1";
  await check("the alias now names the same source");
  assert.notDeepEqual(
    keys(context.ATLASAuditIssues.current()),
    selfBefore,
    "the alias changes the result",
  );
  audit.sources.splice(1, 1);
  await check("source deselected");
  audit.name = "";
  await check("audit name cleared");
  audit.steps.reverse();
  await check("steps reordered");
});
