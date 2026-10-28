import test from "node:test";
import assert from "node:assert/strict";
import {
  workflowFeatureFlags,
  reduceWorkflowCapabilities,
  requireWorkflowFeature,
} from "../src/workflow-feature-flags.js";
const all = Object.fromEntries(
  [
    "READS",
    "HISTORY",
    "RESTORATION",
    "SUBMISSION",
    "DECISIONS",
    "PUBLICATION",
    "UNLOCK",
    "PUBLICATION_DELETION",
  ].map((x) => [`ATLAS_WORKFLOW_${x}_ENABLED`, "true"]),
);
test("flags fail closed and enforce rollout dependencies", () => {
  assert.equal(workflowFeatureFlags({}).reads, false);
  assert.equal(
    workflowFeatureFlags({ ATLAS_WORKFLOW_PUBLICATION_ENABLED: "true" })
      .publication,
    false,
  );
  assert.equal(
    workflowFeatureFlags({ ...all, ATLAS_WORKFLOW_DECISIONS_ENABLED: "false" })
      .publication,
    false,
  );
  assert.equal(workflowFeatureFlags(all).publicationDeletion, true);
});
test("flags only reduce capabilities", () => {
  const c = reduceWorkflowCapabilities(
    { canSubmit: true, canApprove: false, canPublish: true },
    { submission: false, decisions: true, publication: true },
  );
  assert.equal(c.canSubmit, false);
  assert.equal(c.canApprove, false);
  assert.equal(c.canPublish, true);
  assert.equal(
    reduceWorkflowCapabilities({ canLock: true }, { publication: false })
      .canLock,
    false,
    "locking follows the publication flag",
  );
  assert.equal(
    reduceWorkflowCapabilities({ canLock: true }, { publication: true })
      .canLock,
    true,
  );
});
test("disabled middleware rejects direct calls", () => {
  let code, body;
  requireWorkflowFeature("publication", { publication: false })(
    {},
    {
      status(v) {
        code = v;
        return this;
      },
      json(v) {
        body = v;
      },
    },
    () => assert.fail(),
  );
  assert.equal(code, 403);
  assert.match(body.error, /not enabled/);
});
