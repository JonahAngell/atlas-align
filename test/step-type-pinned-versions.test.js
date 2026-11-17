/**
 * Decision B: a publication pinned to an older definition version keeps
 * rendering after a later version replaced the type's behavior block with
 * fields. The removed blocks stay registered as shims (replacedBlocks in
 * js/13-step-type-library.js), so the snapshot corpus pinned to each old
 * version must record exactly what the latest version records.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import vm from "node:vm";
import { loadApp, recordAudit } from "./support/step-type-harness.js";
import { snapshotCorpus } from "./support/step-type-corpus.js";

const PINNED_DIR = new URL("./fixtures/step-types-pinned/", import.meta.url);

/** The old definition versions, as they are stored in Postgres. */
const pinnedDefinitions = readdirSync(PINNED_DIR)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => JSON.parse(readFileSync(new URL(file, PINNED_DIR), "utf8")));

const pinnedTypes = new Set(pinnedDefinitions.map((item) => item.id));
const pinnedVersions = [
  ...new Set(pinnedDefinitions.map((item) => item.version)),
].sort();

/** Corpus audits with at least one step of a pinned type. */
const corpus = snapshotCorpus().filter(({ document }) =>
  (document.steps || []).some((step) => pinnedTypes.has(step.step_type)),
);

/** The app with the old versions loaded next to the bundled latest ones. */
async function appWithOldVersions() {
  const context = await loadApp();
  context.__oldDefinitions = structuredClone(pinnedDefinitions);
  vm.runInContext(
    `(() => {
      const bundled = ATLASStepTypes.bundled;
      ATLASStepTypeRuntime.loadBundled({
        ...bundled,
        definitions: [...bundled.definitions, ...__oldDefinitions],
      });
    })()`,
    context,
  );
  return context;
}

test("old Format and Split versions load next to the latest", async () => {
  const context = await appWithOldVersions();
  const runtime = context.ATLASStepTypeRuntime;
  for (const definition of pinnedDefinitions)
    assert.ok(
      runtime.BLOCK_NAMES.includes(definition.block),
      `${definition.block} is still a known block`,
    );
  runtime.usePinnedVersions({ format_field: 2, split_field: 2 });
  assert.equal(runtime.definitionById("format_field").version, 2);
  assert.equal(runtime.definitionById("split_field").version, 2);
  runtime.usePinnedVersions(null);
  assert.ok(runtime.definitionById("format_field").version > 2);
});

test("the corpus has Format and Split steps to compare", () => {
  assert.ok(corpus.length > 0);
});

for (const version of pinnedVersions)
  for (const { name, document } of corpus)
    test(`pinned to version ${version} renders as the latest: ${name}`, async () => {
      const context = await appWithOldVersions();
      const latest = JSON.parse(
        JSON.stringify(await recordAudit(context, document)),
      );
      context.ATLASStepTypeRuntime.usePinnedVersions(
        Object.fromEntries([...pinnedTypes].map((id) => [id, version])),
      );
      // A pin that is not loaded falls back to the latest silently, which
      // would make the comparison below pass without testing anything.
      for (const id of pinnedTypes)
        assert.equal(
          context.ATLASStepTypeRuntime.definitionById(id).version,
          version,
          `${id} renders with version ${version}`,
        );
      const pinned = JSON.parse(
        JSON.stringify(await recordAudit(context, document)),
      );
      assert.deepEqual(pinned, latest);
    });
