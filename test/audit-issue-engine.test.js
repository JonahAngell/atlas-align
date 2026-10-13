import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const engineSource = readFileSync(
  new URL("../js/22-audit-issue-engine.js", import.meta.url),
  "utf8",
);
const catalog = JSON.parse(
  readFileSync(
    new URL("../catalogs/audit-issue-rules.json", import.meta.url),
    "utf8",
  ),
);

function loadApi() {
  const context = vm.createContext({ console });
  vm.runInContext(engineSource, context);
  return context.AuditIssueEngine;
}

function enabledRule(overrides = {}) {
  return {
    id: "test.required",
    enabled: true,
    severity: "warning",
    category: "setup",
    priority: 10,
    title: "Required value missing",
    summary: "A value is missing.",
    detail: "Provide a value.",
    evaluator: "requiredValue",
    jumpAction: "jump",
    fixAction: "fix",
    targetType: "field",
    config: { key: "name" },
    ...overrides,
  };
}

function handlers() {
  return {
    evaluators: {
      requiredValue(context, config) {
        return context[config.key]
          ? []
          : [{ instanceId: config.key, target: { field: config.key } }];
      },
      duplicate() {
        return [
          { stableKey: "same", summary: "first" },
          { stableKey: "same", summary: "second" },
        ];
      },
      explode() {
        throw new Error("expected evaluator failure");
      },
      critical() {
        return [{}];
      },
    },
    jumpActions: { jump() {} },
    fixActions: { fix() {} },
  };
}

test("catalog is valid JSON with declarative rules and no executable strings", () => {
  assert.equal(catalog.schemaVersion, 1);
  assert.ok(Array.isArray(catalog.rules));
  assert.ok(catalog.rules.length > 0);
  assert.equal(JSON.stringify(catalog).includes("function("), false);
  assert.equal(JSON.stringify(catalog).includes("=>"), false);
});

test("creates independent engine instances", () => {
  const api = loadApi();
  const first = api.create(handlers());
  const second = api.create(handlers());
  assert.notEqual(first, second);
  assert.equal(first.evaluate({}, [enabledRule()]).counts.warning, 1);
  assert.equal(
    second.evaluate({ name: "Ready" }, [enabledRule()]).status,
    "ok",
  );
});

test("validates malformed rules, duplicate ids, severity, and registered names", () => {
  const api = loadApi();
  const engine = api.create(handlers());
  const result = engine.validateRules([
    enabledRule({ id: "duplicate" }),
    enabledRule({
      id: "duplicate",
      severity: "urgent",
      evaluator: "missing",
      jumpAction: "missing",
      fixAction: "missing",
    }),
  ]);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /duplicate id/);
  assert.match(result.errors.join(" "), /unsupported severity/);
  assert.match(result.errors.join(" "), /unknown evaluator/);
  assert.match(result.errors.join(" "), /unknown jump action/);
  assert.match(result.errors.join(" "), /unknown fix action/);
});

test("normalizes issues without mutating caller context, rules, or evaluator values", () => {
  const api = loadApi();
  const context = { name: "", nested: { value: 1 } };
  const rules = [enabledRule()];
  const beforeContext = structuredClone(context);
  const beforeRules = structuredClone(rules);
  const result = api.create(handlers()).evaluate(context, rules);
  assert.deepEqual(context, beforeContext);
  assert.deepEqual(rules, beforeRules);
  assert.equal(result.issues[0].ruleId, "test.required");
  assert.equal(result.issues[0].stableKey, "test.required|name||||name|");
  assert.equal(result.issues[0].canJump, true);
  assert.equal(result.issues[0].canFix, true);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.issues[0]));
});

test("deduplicates by stable key and sorts critical before warning", () => {
  const api = loadApi();
  const rules = [
    enabledRule({
      id: "warning",
      evaluator: "duplicate",
      jumpAction: "",
      fixAction: "",
    }),
    enabledRule({
      id: "critical",
      evaluator: "critical",
      severity: "critical",
      priority: 99,
      jumpAction: "",
      fixAction: "",
    }),
  ];
  const result = api.create(handlers()).evaluate({}, rules);
  assert.equal(result.issues.length, 2);
  assert.equal(result.issues[0].severity, "critical");
  assert.equal(result.issues[1].summary, "first");
  assert.equal(result.status, "critical");
  assert.deepEqual(
    { ...result.counts },
    { ok: 0, warning: 1, critical: 1, total: 2 },
  );
});

test("disabled rules emit no issues", () => {
  const api = loadApi();
  const result = api
    .create(handlers())
    .evaluate({}, [enabledRule({ enabled: false })]);
  assert.equal(result.issues.length, 0);
  assert.equal(result.status, "ok");
  assert.deepEqual(
    { ...result.counts },
    { ok: 1, warning: 0, critical: 0, total: 0 },
  );
});

test("evaluator failures produce a safe system warning and do not stop other rules", () => {
  const api = loadApi();
  const rules = [
    enabledRule({
      id: "broken",
      evaluator: "explode",
      jumpAction: "",
      fixAction: "",
    }),
    enabledRule({
      id: "working",
      evaluator: "requiredValue",
      jumpAction: "",
      fixAction: "",
    }),
  ];
  const result = api.create(handlers()).evaluate({}, rules);
  assert.equal(result.issues.length, 2);
  assert.ok(result.issues.some((issue) => issue.category === "system"));
  assert.ok(result.issues.some((issue) => issue.ruleId === "working"));
});

test("invalid catalogs are rejected before evaluation", () => {
  const api = loadApi();
  const engine = api.create(handlers());
  assert.throws(
    () => engine.evaluate({}, [enabledRule({ evaluator: "unknown" })]),
    /Invalid issue rules/,
  );
});
