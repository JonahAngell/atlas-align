/**
 * Records the step type snapshots in test/fixtures/step-type-snapshots/recorded/.
 *
 * Run only when an output change is intended, then review the diff:
 *   npm run snapshots:record
 *   git diff test/fixtures/step-type-snapshots/recorded/
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { loadApp, recordAudit } from "../test/support/step-type-harness.js";
import {
  SNAPSHOT_DIR,
  snapshotCorpus,
} from "../test/support/step-type-corpus.js";

mkdirSync(SNAPSHOT_DIR, { recursive: true });
const corpus = snapshotCorpus();
const names = new Set(corpus.map(({ name }) => `${name}.json`));
for (const file of readdirSync(SNAPSHOT_DIR))
  if (file.endsWith(".json") && !names.has(file))
    rmSync(new URL(file, SNAPSHOT_DIR));

let steps = 0;
for (const { name, document } of corpus) {
  const recorded = await recordAudit(await loadApp(), document);
  steps += recorded.steps.length;
  writeFileSync(
    new URL(`${name}.json`, SNAPSHOT_DIR),
    `${JSON.stringify(recorded, null, 2)}\n`,
  );
}
console.log(
  `Recorded ${corpus.length} audit snapshots (${steps} steps) in test/fixtures/step-type-snapshots/recorded/.`,
);
