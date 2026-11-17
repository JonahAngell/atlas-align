/**
 * The audits recorded by the step type snapshots: every sample audit in
 * audits/ that has logic steps, plus the synthetic subtype audits.
 */
import { readdirSync, readFileSync } from "node:fs";
import { SYNTHETIC_AUDITS } from "../fixtures/step-type-snapshots/synthetic-audits.js";

const ROOT = new URL("../../", import.meta.url);

export const SNAPSHOT_DIR = new URL(
  "../fixtures/step-type-snapshots/recorded/",
  import.meta.url,
);

/** [{ name, document }] in a stable order. */
export function snapshotCorpus() {
  const samples = readdirSync(new URL("audits/", ROOT))
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => ({
      name: `sample-${file.replace(/\.json$/, "")}`,
      document: JSON.parse(
        readFileSync(new URL(`audits/${file}`, ROOT), "utf8"),
      ),
    }))
    .filter(({ document }) => (document.steps || []).length > 0);
  const synthetic = SYNTHETIC_AUDITS.map((document) => ({
    name: document.id,
    document,
  }));
  return [...samples, ...synthetic];
}
