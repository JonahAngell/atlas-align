/**
 * ATLAS Align loading published step types from GET /api/step-types, the
 * repository fallback, and decision B: publications render with the
 * definition versions recorded on them, editable audits with the latest.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadApp } from "./support/step-type-harness.js";

const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const BUNDLED_SORT_VERSION = JSON.parse(
  read("catalogs/step-types/sort_records.json"),
).version;
// Version 1 and 2 as the server would send them, whatever the bundled file's
// own version is.
const SORT_V1 = {
  ...JSON.parse(read("catalogs/step-types/sort_records.json")),
  version: 1,
};
const SORT_V2 = {
  ...SORT_V1,
  version: 2,
  english: {
    default:
      "Order the rows by {{tableColumn param.source_file param.source_alias param.field_name}} in {{param.sort_direction}} order.",
  },
};

const run = (context, code) =>
  JSON.parse(JSON.stringify(vm.runInContext(code, context) ?? null));

const STEP = {
  id: "step-1",
  step_type: "sort_records",
  params: {
    source_file: "Orders",
    source_alias: "o",
    field_name: "Order Date",
    sort_direction: "Ascending",
  },
};

/** A fetch that answers /api/step-types with `payload` (or `status`). */
function serverFetch(payload, status = 200) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(String(url));
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    };
  };
  return { fetch, calls };
}

async function loadFrom(context, fetchImpl) {
  context.__fetch = fetchImpl;
  await vm.runInContext(
    "ATLASStepTypeRuntime.loadFromServer({ fetch: __fetch })",
    context,
  );
}

function english(context, step = STEP) {
  context.__step = structuredClone(step);
  return vm.runInContext("ATLASStepTypeRuntime.english(__step)", context);
}

test("published definitions from the API replace the bundled versions", async () => {
  const context = await loadApp();
  const before = english(context);
  assert.match(before, /^Sort records /);
  const { fetch, calls } = serverFetch({
    latest: { sort_records: 2 },
    definitions: [{ status: "published", definition: SORT_V2 }],
  });
  await loadFrom(context, fetch);
  assert.deepEqual(calls, ["/api/step-types"]);
  assert.match(english(context), /^Order the rows by .* in Ascending order\.$/);
  assert.deepEqual(
    run(context, 'ATLASStepTypeRuntime.registry().versions("sort_records")'),
    // The bundled version stays next to the server's version 2 (or is
    // replaced by it when the bundled file is version 2 itself).
    [...new Set([BUNDLED_SORT_VERSION, 2])].sort((a, b) => a - b),
  );
  // Bundled types the server did not send keep working.
  assert.ok(
    run(
      context,
      'ATLASStepTypeRuntime.definitionById("remove_duplicates")?.id',
    ),
  );
});

test("the latest version comes from the server, not the highest number", async () => {
  const context = await loadApp();
  const retired = { ...SORT_V2, version: 3, label: "Retired" };
  const { fetch } = serverFetch({
    latest: { sort_records: 2 },
    definitions: [
      { status: "published", definition: SORT_V2 },
      { status: "retired", definition: retired },
    ],
  });
  await loadFrom(context, fetch);
  assert.equal(
    run(context, 'ATLASStepTypeRuntime.definitionById("sort_records").version'),
    2,
  );
  assert.ok(
    run(context, "ATLASStepTypeRuntime.typeOptions()").some(
      (option) =>
        option.id === "sort_records" && option.label === SORT_V1.label,
    ),
  );
});

test("a failed or empty API response keeps the bundled registry", async () => {
  for (const [payload, status] of [
    [{ error: "down" }, 503],
    [{ latest: {}, definitions: [] }, 200],
  ]) {
    const context = await loadApp();
    const size = run(context, "ATLASStepTypeRuntime.registry().size");
    const { fetch } = serverFetch(payload, status);
    await loadFrom(context, fetch);
    assert.equal(run(context, "ATLASStepTypeRuntime.registry().size"), size);
    assert.match(english(context), /^Sort records /);
  }
  const context = await loadApp();
  const size = run(context, "ATLASStepTypeRuntime.registry().size");
  await loadFrom(context, async () => {
    throw new Error("offline");
  });
  assert.equal(run(context, "ATLASStepTypeRuntime.registry().size"), size);
});

test("a publication renders with its pinned versions; editable audits use the latest", async () => {
  const context = await loadApp();
  const { fetch } = serverFetch({
    latest: { sort_records: 2 },
    definitions: [
      { status: "published", definition: SORT_V1 },
      { status: "published", definition: SORT_V2 },
    ],
  });
  await loadFrom(context, fetch);
  const latest = english(context);
  const revision = run(context, "ATLASStepTypeRuntime.revision()");

  vm.runInContext(
    "ATLASStepTypeRuntime.usePinnedVersions({ sort_records: 1 })",
    context,
  );
  assert.match(english(context), /^Sort records /);
  assert.ok(run(context, "ATLASStepTypeRuntime.revision()") > revision);
  // Types the publication does not name use their latest version.
  assert.ok(
    run(
      context,
      'ATLASStepTypeRuntime.definitionById("remove_duplicates")?.id',
    ),
  );

  vm.runInContext("ATLASStepTypeRuntime.usePinnedVersions(null)", context);
  assert.equal(english(context), latest);
});

test("opening a publication in Audit History applies its pins until you return", async () => {
  const context = await loadApp();
  const { fetch } = serverFetch({
    latest: { sort_records: 2 },
    definitions: [
      { status: "published", definition: SORT_V1 },
      { status: "published", definition: SORT_V2 },
    ],
  });
  await loadFrom(context, fetch);
  vm.runInContext(
    `historyView.active = true;
     historyView.kind = "publication";
     historyView.stepTypeVersions = { sort_records: 1 };
     atlasApplyStepTypePins();`,
    context,
  );
  assert.deepEqual(run(context, "ATLASStepTypeRuntime.pinnedVersions()"), {
    sort_records: 1,
  });
  assert.match(english(context), /^Sort records /);
  vm.runInContext(
    `historyView.active = false;
     historyView.kind = null;
     historyView.stepTypeVersions = null;
     atlasApplyStepTypePins();`,
    context,
  );
  assert.equal(run(context, "ATLASStepTypeRuntime.pinnedVersions()"), null);
  assert.match(english(context), /^Order the rows /);
});

test("definitions this engine cannot read are an Audit Issue for admins only", async () => {
  const context = await loadApp();
  const newer = {
    ...SORT_V1,
    id: "future_type",
    schemaVersion: 99,
    aliases: { step_type: [], type: [] },
  };
  const { fetch } = serverFetch({
    latest: { future_type: 1 },
    definitions: [{ status: "published", definition: newer }],
  });
  await loadFrom(context, fetch);
  assert.equal(
    run(context, 'ATLASStepTypeRuntime.definitionById("future_type")'),
    null,
  );
  const issues = (admin) => {
    vm.runInContext(
      `state.currentUser = { access: { canCreate: ${admin} } };
       state.audit = normalizeLoadedAudit({ id: "a", name: "A", steps: [] }, "repo");
       state.auditSelected = true;
       ATLASAuditIssues.invalidate();`,
      context,
    );
    return run(context, "ATLASAuditIssues.current().issues").filter(
      (issue) =>
        issue.ruleId === "audit.logic.step-type-definitions-unavailable",
    );
  };
  assert.deepEqual(issues(false), []);
  const [entry] = issues(true);
  assert.equal(entry.severity, "warning");
  assert.match(
    entry.summary,
    /future_type version 1 needs a newer ATLAS Align/,
  );
});

test("a retired type leaves the picker but its steps and pinned publications still render", async () => {
  const context = await loadApp();
  const pickerIds = () =>
    run(context, "ATLASStepTypeRuntime.typeOptions()").map(
      (option) => option.id,
    );
  assert.ok(pickerIds().includes("sort_records"));
  const before = english(context);

  // Every version of sort_records is retired. The server still sends the
  // version a publication is pinned to, and names the type as retired.
  const { fetch } = serverFetch({
    latest: {},
    retired: ["sort_records"],
    definitions: [{ status: "retired", definition: SORT_V1 }],
  });
  await loadFrom(context, fetch);
  assert.ok(!pickerIds().includes("sort_records"), "hidden from the picker");
  assert.ok(pickerIds().includes("remove_duplicates"), "others stay");
  // Existing steps of the type keep rendering.
  assert.equal(english(context), before);
  // And so does a publication pinned to the retired version.
  vm.runInContext(
    "ATLASStepTypeRuntime.usePinnedVersions({ sort_records: 1 })",
    context,
  );
  assert.equal(english(context), before);
  vm.runInContext("ATLASStepTypeRuntime.usePinnedVersions(null)", context);
});

test("retiring one version keeps the type in the picker at its published version", async () => {
  const context = await loadApp();
  const { fetch } = serverFetch({
    latest: { sort_records: 1 },
    retired: [],
    definitions: [
      { status: "published", definition: SORT_V1 },
      { status: "retired", definition: SORT_V2 },
    ],
  });
  await loadFrom(context, fetch);
  assert.equal(
    run(context, 'ATLASStepTypeRuntime.definitionById("sort_records").version'),
    1,
  );
  assert.ok(
    run(context, "ATLASStepTypeRuntime.typeOptions()").some(
      (option) => option.id === "sort_records",
    ),
  );
  vm.runInContext(
    "ATLASStepTypeRuntime.usePinnedVersions({ sort_records: 2 })",
    context,
  );
  assert.match(english(context), /^Order the rows by /);
  vm.runInContext("ATLASStepTypeRuntime.usePinnedVersions(null)", context);
});

test("steps of a fully retired builder-made type render with its last retired version", async () => {
  const context = await loadApp();
  // A type only the database has: no file in catalogs/step-types/.
  const { aliases: _aliases, ...withoutAliases } = SORT_V1;
  const CUSTOM = {
    ...withoutAliases,
    id: "custom_sort",
    label: "Custom Sort",
    version: 3,
  };
  const step = { ...STEP, step_type: "custom_sort" };
  // The server sends the highest retired version and names the type retired.
  const { fetch } = serverFetch({
    latest: {},
    retired: ["custom_sort"],
    definitions: [{ status: "retired", definition: CUSTOM }],
  });
  await loadFrom(context, fetch);
  assert.equal(
    run(context, 'ATLASStepTypeRuntime.definitionById("custom_sort").version'),
    3,
  );
  assert.match(english(context, step), /Order Date/);
  assert.ok(
    !run(context, "ATLASStepTypeRuntime.typeOptions()").some(
      (option) => option.id === "custom_sort",
    ),
    "hidden from the picker",
  );
});
