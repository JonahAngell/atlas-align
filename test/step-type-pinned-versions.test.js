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

/** Corpus audits with at least one step of a type. */
const corpusWith = (id) =>
  snapshotCorpus().filter(({ document }) =>
    (document.steps || []).some((step) => step.step_type === id),
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

test("old versions load next to the latest", async () => {
  const context = await appWithOldVersions();
  const runtime = context.ATLASStepTypeRuntime;
  for (const { id, version, block } of pinnedDefinitions) {
    if (block)
      assert.ok(
        runtime.BLOCK_NAMES.includes(block),
        `${block} is still a known block`,
      );
    runtime.usePinnedVersions({ [id]: version });
    assert.equal(runtime.definitionById(id).version, version, id);
    runtime.usePinnedVersions(null);
    assert.ok(runtime.definitionById(id).version > version, id);
  }
});

for (const { id, version } of pinnedDefinitions) {
  const corpus = corpusWith(id);
  test(`the corpus has ${id} steps to compare`, () => {
    assert.ok(corpus.length > 0);
  });
  for (const { name, document } of corpus)
    test(`${id} pinned to version ${version} renders as the latest: ${name}`, async () => {
      const context = await appWithOldVersions();
      const latest = JSON.parse(
        JSON.stringify(await recordAudit(context, document)),
      );
      context.ATLASStepTypeRuntime.usePinnedVersions({ [id]: version });
      // A pin that is not loaded falls back to the latest silently, which
      // would make the comparison below pass without testing anything.
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
}
