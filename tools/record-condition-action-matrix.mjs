/**
 * Records the condition and action matrix in
 * test/fixtures/condition-action-matrix/recorded/.
 *
 * Run only when an output change is intended, then review the diff:
 *   npm run matrix:record
 *   git diff test/fixtures/condition-action-matrix/recorded/
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import {
  MATRIX_DIR,
  matrixGroups,
  recordGroup,
} from "../test/support/condition-action-matrix.js";

mkdirSync(MATRIX_DIR, { recursive: true });
const groups = matrixGroups();
const names = new Set(groups.map(({ group }) => `${group}.json`));
for (const file of readdirSync(MATRIX_DIR))
  if (file.endsWith(".json") && !names.has(file))
    rmSync(new URL(file, MATRIX_DIR));

let cases = 0;
for (const { group, cases: documents } of groups) {
  const recorded = await recordGroup(documents);
  cases += documents.length;
  writeFileSync(
    new URL(`${group}.json`, MATRIX_DIR),
    `${JSON.stringify(recorded, null, 2)}\n`,
  );
}
console.log(
  `Recorded ${cases} condition and action cases in ${groups.length} files in test/fixtures/condition-action-matrix/recorded/.`,
);
