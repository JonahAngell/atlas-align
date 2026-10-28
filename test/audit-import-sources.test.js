import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (file) => readFileSync(new URL(`../js/${file}`, import.meta.url), "utf8");

function load() {
  const sandbox = { console };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(read("15i-source-replace.js"), context);
  vm.runInContext(read("15k-audit-import-sources.js"), context);
  return context;
}

const importer = load();
const plain = (value) => JSON.parse(JSON.stringify(value));
// Values built inside the vm context belong to another realm; compare copies.
const same = (actual, expected) => assert.deepEqual(plain(actual), expected);

const library = [
  {
    sourceKey: "sap.hi0256",
    sourceFile: "HI0256_Maseke",
    alias: "sap.hi0256",
    fields: [
      { fieldName: "PERNR", vanityLabel: "Personnel Number" },
      { fieldName: "status", vanityLabel: "Status" },
    ],
  },
  {
    sourceKey: "wd.worker",
    sourceFile: "Workday Workers",
    alias: "wd.worker",
    fields: [{ fieldName: "Employee_ID", vanityLabel: "Employee ID" }],
  },
];

function condition(sourceFile, sourceAlias, fieldName) {
  return {
    id: "cond_1",
    connector: "IF",
    sourceFile,
    sourceAlias,
    fieldName,
    operator: "is equal to",
    valueMode: "values",
    compareValue: "Withdrawn",
    compareSourceFile: "",
    compareSourceAlias: "",
    compareFieldName: "",
    expression: "",
  };
}

function sapAudit() {
  return {
    id: "sap-audit",
    name: "SAP Audit",
    sources: [
      { id: "source_1", name: "SAP HR Master", alias: "sap.hr", color: "#fdd0ec" },
      { id: "source_2", name: "Calculated Field", alias: "Calculated Field" },
    ],
    fields: [
      { id: "field_1", name: "Personnel Number", rawFieldName: "persno", type: "Source", sourceFile: "SAP HR Master", sourceAlias: "sap.hr" },
      { id: "field_2", name: "status", rawFieldName: "status", type: "Source", sourceFile: "SAP HR Master", sourceAlias: "sap.hr" },
      { id: "field_3", name: "Error Message", rawFieldName: "Error Message", type: "Custom", sourceFile: "Calculated Field", sourceAlias: "Calculated Field" },
    ],
    steps: [
      {
        id: "step_1", parentId: null, branchType: "root", sortOrder: 1, title: "Reference SAP HR Master",
        step_type: "reference_source", type: "source", source: "SAP HR Master", field: "",
        params: { source_file: "SAP HR Master", source_alias: "sap.hr" },
      },
      {
        id: "step_2", parentId: "step_1", branchType: "then", sortOrder: 2, title: "Format Field",
        step_type: "format_field", type: "transform", source: "SAP HR Master", field: "persno",
        params: { source_file: "SAP HR Master", source_alias: "sap.hr", field_name: "persno" },
      },
      {
        id: "step_3", parentId: "step_1", branchType: "then", sortOrder: 3, title: "IF / THEN",
        step_type: "if_then", type: "if", source: "SAP HR Master", field: "",
        params: {
          source_file: "SAP HR Master",
          source_alias: "sap.hr",
          conditions_json: JSON.stringify([condition("SAP HR Master", "sap.hr", "status"), { ...condition("SAP HR Master", "sap.hr", "legacy_code"), id: "cond_2", connector: "AND" }]),
          then_action_type: "do_not_display",
        },
      },
    ],
  };
}

test("hints are read from the file root and each audit, then removed from the audits", () => {
  const audit = { id: "a", sourceMappings: [{ source: "X", targetSource: "sap.hi0256" }] };
  const json = { audits: [audit], customSources: [{ source: "Y", fields: [] }] };
  const hints = importer.atlasImportExtractHints(json, [audit]);
  assert.equal(hints.customSources.length, 1);
  assert.equal(hints.sourceMappings.length, 1);
  assert.equal("sourceMappings" in audit, false);
});

test("sources are grouped across audits, skip Calculated Field, and include logic-only fields", () => {
  const second = { ...sapAudit(), id: "second", name: "Second" };
  const entries = importer.atlasImportCollectSources([sapAudit(), second]);
  assert.equal(entries.length, 1);
  same((entries[0].documentIndexes), [0, 1]);
  same(
    entries[0].fields.map((field) => field.field),
    ["persno", "status", "legacy_code"],
  );
  assert.equal(entries[0].fields[0].vanity, "Personnel Number");
});

test("the initial plan keeps library keys, maps name matches, and creates unknown sources", () => {
  const audit = {
    id: "mixed",
    name: "Mixed",
    sources: [
      { name: "Anything", alias: "wd.worker" },
      { name: "HI0256_Maseke", alias: "hr" },
      { name: "Brand New Feed", alias: "new.feed" },
    ],
    fields: [
      { rawFieldName: "status", type: "Source", sourceFile: "HI0256_Maseke" },
      { rawFieldName: "Amount", type: "Source", sourceFile: "Brand New Feed", fieldFormat: "currency" },
    ],
    steps: [],
  };
  const plans = importer.atlasImportInitialPlan(
    importer.atlasImportCollectSources([audit]),
    library,
    { customSources: [], sourceMappings: [] },
  );
  same(plans.map((plan) => plan.action), ["library", "map", "create"]);
  assert.equal(plans[1].targetSourceKey, "sap.hi0256");
  assert.equal(plans[1].rows[0].destination.field, "status");
  same((plans[2].createFields), [
    { fieldName: "Amount", vanityLabel: "Amount", fieldFormat: "Currency", businessDescription: "" },
  ]);
  assert.equal(importer.atlasImportPlanNeedsReview(plans, {}), true);
  assert.equal(importer.atlasImportPlanNeedsReview([plans[0]], {}), false);
});

test("hints prefill mappings and custom sources, but a library match wins over a custom source hint", () => {
  const entries = importer.atlasImportCollectSources([sapAudit()]);
  const mapped = importer.atlasImportInitialPlan(entries, library, {
    sourceMappings: [{ source: "sap.hr", targetSource: "HI0256_Maseke", fields: { persno: "PERNR" } }],
    customSources: [],
  })[0];
  assert.equal(mapped.action, "map");
  assert.equal(mapped.hinted, true);
  same(
    mapped.rows.map((row) => [row.field, row.destination?.field ?? null]),
    [["persno", "PERNR"], ["status", "status"], ["legacy_code", null]],
  );

  const created = importer.atlasImportInitialPlan(entries, library, {
    sourceMappings: [],
    customSources: [{ source: "SAP HR Master", sourceName: "SAP HR Extract", sourceSystem: "SAP", fields: [{ fieldName: "persno", vanityLabel: "Personnel No.", fieldFormat: "Number" }] }],
  })[0];
  assert.equal(created.action, "create");
  assert.equal(created.sourceName, "SAP HR Extract");
  same(
    created.createFields.map((field) => [field.fieldName, field.fieldFormat]),
    [["persno", "Number"], ["status", "Text"], ["legacy_code", "Text"]],
  );

  const reimport = importer.atlasImportInitialPlan(
    importer.atlasImportCollectSources([{ sources: [{ name: "Workday Workers", alias: "wd" }], fields: [], steps: [] }]),
    library,
    { sourceMappings: [], customSources: [{ source: "Workday Workers", fields: [{ fieldName: "x" }] }] },
  )[0];
  assert.equal(reimport.action, "map");
  assert.equal(reimport.targetSourceKey, "wd.worker");
  assert.match(reimport.hintWarning, /already in the Source Library/);

  const missingTarget = importer.atlasImportInitialPlan(entries, library, {
    sourceMappings: [{ source: "sap.hr", targetSource: "nowhere" }],
    customSources: [],
  })[0];
  assert.equal(missingTarget.action, "create");
  assert.match(missingTarget.hintWarning, /nowhere is not in the Source Library/);
});

test("applying a mapping rewrites references, swaps the source, and reports unmatched fields", () => {
  const audit = sapAudit();
  const [plan] = importer.atlasImportInitialPlan(
    importer.atlasImportCollectSources([audit]),
    library,
    { sourceMappings: [{ source: "sap.hr", targetSource: "sap.hi0256", fields: { persno: "PERNR" } }], customSources: [] },
  );
  importer.atlasImportApplyPlans([audit], [plan], library);

  const [reference, format, rule] = audit.steps;
  assert.equal(reference.source, "sap.hi0256");
  assert.equal(reference.params.source_file, "HI0256_Maseke");
  assert.equal(reference.params.source_alias, "sap.hi0256");
  assert.equal(reference.title, "Reference HI0256_Maseke");
  assert.equal(format.params.field_name, "PERNR");
  assert.equal(format.params.source_file, "sap.hi0256");
  assert.equal(rule.params.source_file, "sap.hi0256");
  const conditions = JSON.parse(rule.params.conditions_json);
  same(
    conditions.map((item) => [item.sourceFile, item.fieldName]),
    [["sap.hi0256", "status"], ["SAP HR Master", "legacy_code"]],
  );

  same(
    audit.sources.map((source) => [source.sourceKey || source.name, source.color || ""]),
    [["sap.hi0256", "#fdd0ec"], ["Calculated Field", ""]],
  );
  assert.equal(audit.fields[0].sourceKey, "sap.hi0256");
  assert.equal(audit.fields[0].rawFieldName, "PERNR");
  assert.equal(audit.fields[0].name, "Personnel Number");
  assert.equal(audit.fields[2].sourceFile, "Calculated Field");
  same(
    audit.unmatchedSourceReplacements.fields.map((gap) => gap.originalField),
    ["legacy_code"],
  );
});

test("mapping one source leaves another source's reference step alone", () => {
  const audit = sapAudit();
  audit.sources.push({ id: "source_3", name: "Workday Feed", alias: "wd.feed" });
  audit.steps.push({
    id: "step_4", parentId: null, branchType: "root", sortOrder: 4, title: "Reference Workday Feed",
    step_type: "reference_source", type: "source", source: "Workday Feed", field: "",
    params: { source_file: "Workday Feed", source_alias: "wd.feed" },
  });
  const plans = importer.atlasImportInitialPlan(
    importer.atlasImportCollectSources([audit]),
    library,
    {
      sourceMappings: [
        { source: "sap.hr", targetSource: "sap.hi0256" },
        { source: "Workday Feed", targetSource: "wd.worker" },
      ],
      customSources: [],
    },
  );
  importer.atlasImportApplyPlans([audit], plans, library);
  same(
    [audit.steps[0], audit.steps[3]].map((step) => [step.source, step.params.source_file, step.params.source_alias, step.title]),
    [
      ["sap.hi0256", "HI0256_Maseke", "sap.hi0256", "Reference HI0256_Maseke"],
      ["wd.worker", "Workday Workers", "wd.worker", "Reference Workday Workers"],
    ],
  );
});

test("a fully mapped source leaves no gap record on the audit", () => {
  const audit = sapAudit();
  audit.steps.pop();
  const [plan] = importer.atlasImportInitialPlan(
    importer.atlasImportCollectSources([audit]),
    library,
    { sourceMappings: [{ source: "sap.hr", targetSource: "sap.hi0256", fields: { persno: "PERNR" } }], customSources: [] },
  );
  importer.atlasImportApplyPlans([audit], [plan], library);
  assert.equal("unmatchedSourceReplacements" in audit, false);
});

test("custom source problems are caught before the server is called", () => {
  const plan = (overrides) => ({
    label: "Feed",
    sourceName: "Feed",
    sourceSystem: "",
    createFields: [{ fieldName: "Amount", vanityLabel: "Amount", fieldFormat: "Text" }],
    ...overrides,
  });
  assert.equal(importer.atlasImportCustomSourceProblem(plan({})), "");
  assert.match(importer.atlasImportCustomSourceProblem(plan({ sourceName: "" })), /Enter a source name/);
  assert.match(importer.atlasImportCustomSourceProblem(plan({ sourceName: "#Feed" })), /can use letters/);
  assert.match(importer.atlasImportCustomSourceProblem(plan({ createFields: [] })), /has no fields/);
  assert.match(
    importer.atlasImportCustomSourceProblem(plan({ createFields: [{ fieldName: "Amt#", vanityLabel: "Amt", fieldFormat: "Text" }] })),
    /field name Amt#/,
  );
  same((importer.atlasImportCustomSourcePayload(plan({ sourceSystem: " SAP " }))), {
    sourceName: "Feed",
    sourceSystem: "SAP",
    fields: [{ fieldName: "Amount", vanityLabel: "Amount", fieldFormat: "Text", businessDescription: "" }],
  });
});

test("imported top-level Reference steps become the generated reference for their source", () => {
  const audit = {
    sources: [
      { id: "source_1", name: "sap.hi0256", sourceKey: "sap.hi0256", sourceFile: "HI0256", alias: "sap.hi0256" },
      { name: "wd.worker", sourceKey: "wd.worker", sourceFile: "Workday Workers", alias: "wd.worker" },
    ],
    steps: [
      { id: "step_1", step_type: "reference_source", parentId: null, source: "HI0256", params: { source_file: "HI0256", source_alias: "sap.hi0256" } },
      { id: "step_2", step_type: "format_field", parentId: "step_1", params: {} },
      { id: "step_3", step_type: "reference_source", parentId: null, source: "sap.hi0256", params: { source_file: "sap.hi0256" } },
      { id: "step_4", step_type: "if_then", parentId: "step_3", params: {} },
      { id: "step_5", step_type: "reference_source", parentId: "step_4", source: "Workday Workers", params: { source_file: "Workday Workers" } },
      { id: "step_6", step_type: "join", parentId: null, params: {} },
    ],
  };
  importer.atlasImportAdoptReferenceSteps(audit);
  same(
    audit.steps.map((step) => [step.id, step.parentId, step.autoGeneratedReference ?? false, step.source ?? ""]),
    [
      ["reference_source_1", null, true, "sap.hi0256"],
      ["step_2", "reference_source_1", false, ""],
      ["step_4", "reference_source_1", false, ""],
      ["step_5", "step_4", false, "Workday Workers"],
      ["step_6", null, false, ""],
    ],
  );
  assert.equal(audit.steps[0].locked, true);
});

test("an adopted Reference step takes the generated id, or the source name when the source has no id", () => {
  const audit = {
    sources: [{ name: "wd.worker", sourceKey: "wd.worker", sourceFile: "Workday Workers", alias: "wd.worker" }],
    steps: [
      { id: "ref", step_type: "reference_source", parentId: null, source: "Workday Workers", params: { source_file: "Workday Workers" } },
      { id: "child", step_type: "if_then", parentId: "ref", params: {} },
    ],
  };
  importer.atlasImportAdoptReferenceSteps(audit);
  same(audit.steps.map((step) => [step.id, step.parentId]), [["reference_wd.worker", null], ["child", "reference_wd.worker"]]);

  const taken = {
    sources: [{ id: "s1", name: "wd.worker", sourceFile: "Workday Workers" }],
    steps: [
      { id: "ref", step_type: "reference_source", parentId: null, source: "wd.worker", params: {} },
      { id: "reference_s1", step_type: "if_then", parentId: null, params: {} },
    ],
  };
  importer.atlasImportAdoptReferenceSteps(taken);
  assert.equal(taken.steps[0].id, "ref");
});
