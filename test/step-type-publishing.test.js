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
const FORMAT_V1 = JSON.parse(read("catalogs/step-types/format_field.json"));
const FORMAT_V2 = {
  ...FORMAT_V1,
  version: 2,
  english: {
    default:
      "Show {{tableColumn param.source_file param.source_alias param.field_name}} in {{param.format}} format.",
  },
};

const run = (context, code) =>
  JSON.parse(JSON.stringify(vm.runInContext(code, context) ?? null));

const STEP = {
  id: "step-1",
  step_type: "format_field",
  params: {
    source_file: "Orders",
    source_alias: "o",
    field_name: "Order Date",
    format: "text",
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
  assert.match(before, /^Format /);
  const { fetch, calls } = serverFetch({
    latest: { format_field: 2 },
    definitions: [{ status: "published", definition: FORMAT_V2 }],
  });
  await loadFrom(context, fetch);
  assert.deepEqual(calls, ["/api/step-types"]);
  assert.match(english(context), /^Show .* in text format\.$/);
  assert.deepEqual(
    run(context, 'ATLASStepTypeRuntime.registry().versions("format_field")'),
    [1, 2],
  );
  // Bundled types the server did not send keep working.
  assert.ok(
    run(context, 'ATLASStepTypeRuntime.definitionById("sort_records")?.id'),
  );
});

test("the latest version comes from the server, not the highest number", async () => {
  const context = await loadApp();
  const retired = { ...FORMAT_V2, version: 3, label: "Retired" };
  const { fetch } = serverFetch({
    latest: { format_field: 2 },
    definitions: [
      { status: "published", definition: FORMAT_V2 },
      { status: "retired", definition: retired },
    ],
  });
  await loadFrom(context, fetch);
  assert.equal(
    run(context, 'ATLASStepTypeRuntime.definitionById("format_field").version'),
    2,
  );
  assert.ok(
    run(context, "ATLASStepTypeRuntime.typeOptions()").some(
      (option) =>
        option.id === "format_field" && option.label === FORMAT_V1.label,
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
    assert.match(english(context), /^Format /);
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
    latest: { format_field: 2 },
    definitions: [
      { status: "published", definition: FORMAT_V1 },
      { status: "published", definition: FORMAT_V2 },
    ],
  });
  await loadFrom(context, fetch);
  const latest = english(context);
  const revision = run(context, "ATLASStepTypeRuntime.revision()");

  vm.runInContext(
    "ATLASStepTypeRuntime.usePinnedVersions({ format_field: 1 })",
    context,
  );
  assert.match(english(context), /^Format /);
  assert.ok(run(context, "ATLASStepTypeRuntime.revision()") > revision);
  // Types the publication does not name use their latest version.
  assert.ok(
    run(context, 'ATLASStepTypeRuntime.definitionById("sort_records")?.id'),
  );

  vm.runInContext("ATLASStepTypeRuntime.usePinnedVersions(null)", context);
  assert.equal(english(context), latest);
});

test("opening a publication in Audit History applies its pins until you return", async () => {
  const context = await loadApp();
  const { fetch } = serverFetch({
    latest: { format_field: 2 },
    definitions: [
      { status: "published", definition: FORMAT_V1 },
      { status: "published", definition: FORMAT_V2 },
    ],
  });
  await loadFrom(context, fetch);
  vm.runInContext(
    `historyView.active = true;
     historyView.kind = "publication";
     historyView.stepTypeVersions = { format_field: 1 };
     atlasApplyStepTypePins();`,
    context,
  );
  assert.deepEqual(run(context, "ATLASStepTypeRuntime.pinnedVersions()"), {
    format_field: 1,
  });
  assert.match(english(context), /^Format /);
  vm.runInContext(
    `historyView.active = false;
     historyView.kind = null;
     historyView.stepTypeVersions = null;
     atlasApplyStepTypePins();`,
    context,
  );
  assert.equal(run(context, "ATLASStepTypeRuntime.pinnedVersions()"), null);
  assert.match(english(context), /^Show /);
});

test("definitions this engine cannot read are an Audit Issue for admins only", async () => {
  const context = await loadApp();
  const newer = {
    ...FORMAT_V1,
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
