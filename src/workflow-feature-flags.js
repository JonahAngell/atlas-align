/** Fail-closed, dependency-aware Phase 8 workflow rollout configuration. */
export const WORKFLOW_FEATURE_ENV = Object.freeze({
  reads: "ATLAS_WORKFLOW_READS_ENABLED",
  history: "ATLAS_WORKFLOW_HISTORY_ENABLED",
  restoration: "ATLAS_WORKFLOW_RESTORATION_ENABLED",
  submission: "ATLAS_WORKFLOW_SUBMISSION_ENABLED",
  decisions: "ATLAS_WORKFLOW_DECISIONS_ENABLED",
  publication: "ATLAS_WORKFLOW_PUBLICATION_ENABLED",
  unlock: "ATLAS_WORKFLOW_UNLOCK_ENABLED",
  publicationDeletion: "ATLAS_WORKFLOW_PUBLICATION_DELETION_ENABLED",
});
const ORDER = Object.freeze(Object.keys(WORKFLOW_FEATURE_ENV));
function enabled(value) {
  return (
    String(value || "")
      .trim()
      .toLowerCase() === "true"
  );
}
export function workflowFeatureFlags(env = process.env) {
  const requested = Object.fromEntries(
    ORDER.map((name) => [name, enabled(env[WORKFLOW_FEATURE_ENV[name]])]),
  );
  const flags = {};
  let dependenciesEnabled = true;
  for (const name of ORDER) {
    flags[name] = Boolean(requested[name] && dependenciesEnabled);
    dependenciesEnabled = dependenciesEnabled && flags[name];
  }
  return Object.freeze(flags);
}
export function publicWorkflowFeatureFlags(flags) {
  return Object.fromEntries(
    ORDER.map((name) => [name, Boolean(flags?.[name])]),
  );
}
export function reduceWorkflowCapabilities(capabilities = {}, flags = {}) {
  return {
    ...capabilities,
    canViewHistory: Boolean(capabilities.canViewHistory && flags.history),
    canRestore: Boolean(capabilities.canRestore && flags.restoration),
    canRestoreAudit: Boolean(capabilities.canRestoreAudit && flags.restoration),
    canRestoreStep: Boolean(capabilities.canRestoreStep && flags.restoration),
    canSubmit: Boolean(capabilities.canSubmit && flags.submission),
    canViewApprovalRequest: Boolean(
      capabilities.canViewApprovalRequest && flags.reads,
    ),
    canRescindApprovalRequest: Boolean(
      capabilities.canRescindApprovalRequest && flags.submission,
    ),
    canApprove: Boolean(capabilities.canApprove && flags.decisions),
    canPublish: Boolean(capabilities.canPublish && flags.publication),
    canUnlock: Boolean(capabilities.canUnlock && flags.unlock),
    canDeletePublication: Boolean(
      capabilities.canDeletePublication && flags.publicationDeletion,
    ),
  };
}
export function requireWorkflowFeature(name, flags) {
  if (!ORDER.includes(name))
    throw new Error(`Unknown workflow feature: ${name}`);
  return (_req, res, next) =>
    flags[name]
      ? next()
      : res
          .status(403)
          .json({ error: "This workflow feature is not enabled." });
}
