import { normalizedRoleSlugs } from "./source-library-authorization.js";
import {
  SOURCE_LIBRARY_ADMIN_ROLE,
  ATLAS_ADMIN_ROLE,
} from "./00-global-variables.js";

/**
 * Converts a value to a trimmed, lowercase string for consistent comparisons.
 * Falsy values are normalized to an empty string.
 */
function text(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/**
 * Determines whether two user-like objects identify the same user.
 * Compares normalized IDs when both are available, otherwise compares usernames.
 */
function sameUser(left, right) {
  const a = text(left?.id),
    b = text(right?.id);
  if (a && b) return a === b;
  return Boolean(
    text(left?.username) && text(left?.username) === text(right?.username),
  );
}

/**
 * Returns the assigned-user entries for an audit, supporting assignments stored
 * directly on the audit or within its nested document payload.
 */
function assignmentsFor(audit) {
  return (
    audit?.assignments?.assigned || audit?.document?.assignments?.assigned || []
  );
}

/**
 * Determines whether the supplied user appears in the audit's assigned analyst list.
 */
export function isAssignedAnalyst(user, audit) {
  return assignmentsFor(audit).some((entry) => sameUser(entry, user));
}

/**
 * Calculates the audit capabilities available to a user from authentication state,
 * verified roles, audit assignment, workflow status, and revision/request context.
 */
export function auditAccessForUser(user, audit = null, context = {}) {
  const authenticated = Boolean(
    user?.id && user?.username && user?.disabled !== true,
  );

  const roles = authenticated ? normalizedRoleSlugs(user) : [];
  const rolesVerified =
    authenticated &&
    ["embedded", "resolved", "resolved_empty"].includes(
      user?.roleResolutionStatus,
    );

  const assigned =
    authenticated && audit ? isAssignedAnalyst(user, audit) : false;

  const status =
    audit?.workflowStatus ||
    audit?.workflow_status ||
    context.workflowStatus ||
    "Draft";

  const adminTeam = rolesVerified && roles.includes(ATLAS_ADMIN_ROLE);
  const alignAdmin = rolesVerified && roles.includes(SOURCE_LIBRARY_ADMIN_ROLE);

  const selected =
    Boolean(context.selectedApprover) &&
    sameUser(user, context.selectedApprover);

  const exactRevision = context.exactRevision !== false;
  const exactRequest = context.exactRequest !== false;
  const exactApproval = context.exactApproval !== false;
  const exactPublication = context.exactPublication !== false;

  const isDraft = ["Draft", "Draft Revision"].includes(status);
  const isPendingApproval = status === "Pending Approval";
  const isApproved = status === "Approved";
  const isPublished = status === "Published";
  const workflowLocked = isPendingApproval || isPublished;

  const assignedRevision = authenticated && assigned && exactRevision;
  const adminRevision =
    authenticated && adminTeam && !assigned && exactRevision;

  const canModify = authenticated && adminTeam && !workflowLocked;
  const canViewApprovalRequest =
    authenticated &&
    isPendingApproval &&
    exactRevision &&
    exactRequest &&
    (assigned || selected);

  return {
    canRead: authenticated,
    canMutateAudit: authenticated && adminTeam,
    canCreate: authenticated && adminTeam,
    canEdit: canModify,
    canRestore: canModify,
    canRestoreAudit: canModify,
    canRestoreStep: canModify,
    canArchive: authenticated && adminTeam,
    canManageDeletedAudits: authenticated && adminTeam,

    canSubmit: adminTeam && assignedRevision && isDraft,
    canViewApprovalRequest,
    canRescindApprovalRequest:
      adminTeam && assignedRevision && isPendingApproval && exactRequest,

    canApprove: adminRevision && selected && isPendingApproval && exactRequest,
    canPublish: adminRevision && isApproved && exactApproval,
    canUnlock: adminRevision && isPublished && exactPublication,

    canDeletePublication: authenticated && alignAdmin,
    canViewHistory: authenticated && (assigned || adminTeam || alignAdmin),
  };
}

/**
 * Creates Express middleware that requires a named audit capability for the
 * signed-in user, returning HTTP 403 when the capability is unavailable.
 */
export function requireAuditCapability(capability) {
  return (req, res, next) => {
    const access = auditAccessForUser(req.studioshareUser);
    if (!access[capability])
      return res
        .status(403)
        .json({ error: `Audit capability ${capability} is required.` });
    req.auditAccess = access;
    return next();
  };
}
