import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./src/load-env.js";
import express from "express";
import compression from "compression";
import multer from "multer";
import pg from "pg";
import {
  CsvValidationError,
  replaceFieldLibrary,
} from "./src/field-library.js";
import { sourceLibraryFromRows } from "./src/source-library.js";
import {
  fieldLibraryProvenance,
  loadLiveFieldLibrary,
} from "./src/field-library-source.js";
import {
  FIELD_LIBRARY_COLUMNS,
  FIELD_LIBRARY_TABLE,
  SOURCE_LIBRARY_ADMIN_ROLE,
  ATLAS_ADMIN_ROLE,
} from "./src/00-global-variables.js";
import { quoteIdentifier } from "./src/schema.js";
import {
  auditAccessForUser,
  isAssignedAnalyst,
  requireAuditCapability,
} from "./src/audit-authorization.js";
import {
  normalizedRoleSlugs,
  sourceLibraryAccessDecision,
} from "./src/source-library-authorization.js";
import {
  listAudits,
  listArchivedAudits,
  getAudit,
  saveAudit,
  listAuditRevisions,
  getAuditRevision,
  restoreAuditRevision,
  listStepRevisions,
  getStepRevision,
  restoreStepRevision,
  archiveAudit,
  restoreArchivedAudit,
  permanentlyDeleteArchivedAudit,
  importAudit,
} from "./src/audit-repository.js";
import { createUserProfileRouter } from "./src/user-profile-routes.js";
import {
  getImpersonationProfile,
  getLoginProfile,
  resolvedUserMatchesStoredProfile,
  searchUserProfiles,
  upsertUserProfiles,
} from "./src/user-profile-repository.js";
import {
  isLocalAppEnv,
  localSignedInUser,
  verifiedStoredRoles,
} from "./src/local-development.js";
import {
  IMPERSONATION_COOKIE,
  userImpersonationEnabled,
  impersonationCookieOptions,
  clearImpersonationCookie,
  resolveImpersonationSession,
  invalidateImpersonationToken,
  startImpersonation,
  renewImpersonation,
  effectiveUserFromSession,
  logImpersonation,
} from "./src/user-impersonation.js";
import {
  refreshImpersonationCandidates,
  refreshImpersonationProfile,
} from "./src/studioshare-role-refresh.js";
import {
  submitAuditForApproval,
  rescindAuditApprovalRequest,
  approveAuditRevision,
  denyAuditRevision,
  publishAuditRevision,
  lockAuditRevision,
  unlockPublishedAudit,
  softDeleteAuditPublication,
  getAuditWorkflowSummary,
  listAuditPublications,
  getAuditPublication,
  listAuditActivity,
  listInboxItems,
  getInboxUnreadCount,
  markInboxItemRead,
  getInboxApprovalReviewContext,
} from "./src/audit-workflow-repository.js";
import {
  openAuditReview,
  getAuditReview,
  saveAuditReview,
  bulkApproveAuditReview,
  getAuditReviewFinalSummary,
  returnAuditReview,
  getReturnedReviewFeedback,
  finalizeApprovedAuditReview,
} from "./src/audit-review-repository.js";
import {
  getReviewItemDiscussions,
  createReviewDiscussion,
  addDiscussionMessage,
  resolveDiscussion,
  reopenDiscussion,
} from "./src/audit-discussion-repository.js";
import {
  workflowFeatureFlags,
  publicWorkflowFeatureFlags,
  reduceWorkflowCapabilities,
  requireWorkflowFeature,
} from "./src/workflow-feature-flags.js";
import {
  previewAuditRevision,
  previewAuditRestoration,
  previewStepRestoration,
  previewApprovalRequest,
  previewPublication,
} from "./src/audit-preview-repository.js";
import { cookieValue } from "./src/studioshare-client.js";
import { createIdentityRouter } from "./src/routes/identity-routes.js";
import { createSourceLibraryRouter } from "./src/routes/source-library-routes.js";
import { createAuditRouter } from "./src/routes/audit-routes.js";
import { createFieldLibraryRouter } from "./src/routes/field-library-routes.js";
import { createPreviewRouter } from "./src/routes/preview-routes.js";
import { createWorkflowRouter } from "./src/routes/workflow-routes.js";
import { createReviewRouter } from "./src/routes/review-routes.js";
import {
  apiRateLimits,
  securityHeaders,
  useJsonBodyParsers,
} from "./src/http-security.js";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnvFile(path.join(__dirname, ".env"));

const app = express();
const port = Number(process.env.PORT || 8080);
const workflowFlags = workflowFeatureFlags(process.env);
const workflowFeature = (name) => requireWorkflowFeature(name, workflowFlags);

const studioshareApiUrl = process.env.STUDIOSHARE_API_URL;

const databaseUrl = process.env.STUDIOSHARE_DB_URL;
const USER_METADATA_DEBUG_FLAG = "ATLAS_USER_METADATA_DEBUG";
const IN_APP_VALIDATION_FLAG = "ATLAS_IN_APP_VALIDATION_ENABLED";
const USER_METADATA_DEBUG_REDACTED_KEYS =
  /token|cookie|authorization|header|secret|credential|password|api[-_]?key|private[-_]?key|session/i;

if (!databaseUrl) {
  console.error("Missing STUDIOSHARE_DB_URL");
}

if (!studioshareApiUrl && !isLocalAppEnv()) {
  console.error("Missing STUDIOSHARE_API_URL.");
}

const pool = new Pool({ connectionString: databaseUrl, max: 5 });
// pg emits "error" when the server drops an idle client; without a listener that crashes the process.
pool.on("error", (error) => {
  console.error(
    JSON.stringify({
      level: "error",
      event: "database_pool_error",
      message: error.message,
    }),
  );
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 8 * 1024 * 1024 },
});

app.disable("x-powered-by");
app.use(securityHeaders({ local: isLocalAppEnv() }));
app.use(compression());

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/styles.css", (_req, res) => {
  res.sendFile(path.join(__dirname, "styles.css"));
});

app.use(
  "/sections",
  express.static(path.join(__dirname, "sections"), {
    index: false,
    dotfiles: "deny",
    fallthrough: false,
  }),
);
app.use(
  "/css",
  express.static(path.join(__dirname, "css"), {
    index: false,
    dotfiles: "deny",
    fallthrough: false,
  }),
);
app.use(
  "/js",
  express.static(path.join(__dirname, "js"), {
    index: false,
    dotfiles: "deny",
    fallthrough: false,
  }),
);

app.use(
  "/vendor",
  express.static(path.join(__dirname, "vendor"), {
    index: false,
    dotfiles: "deny",
    fallthrough: false,
  }),
);

app.use(
  "/tutorials",
  express.static(path.join(__dirname, "tutorials"), {
    index: false,
    dotfiles: "deny",
    fallthrough: false,
  }),
);

app.use(
  "/catalogs",
  express.static(path.join(__dirname, "catalogs"), {
    index: false,
    dotfiles: "deny",
    fallthrough: false,
  }),
);

app.use(
  "/templates",
  express.static(path.join(__dirname, "templates"), {
    index: false,
    dotfiles: "deny",
    fallthrough: false,
  }),
);

// API traffic only: static assets above are neither rate limited nor body parsed.
const rateLimits = apiRateLimits();
app.use("/api", rateLimits.api, rateLimits.writes);
app.use("/api/admin/field-library/replace", rateLimits.uploads);

useJsonBodyParsers(app);

async function resolveUserRoleSlugs(accessToken, user) {
  const existing = normalizedRoleSlugs(user);
  const hasOpaqueRoleIds =
    Array.isArray(user?.roles) &&
    user.roles.some(
      (role) => typeof role === "string" && /^[a-f0-9]{24}$/i.test(role.trim()),
    );
  if (!hasOpaqueRoleIds) return { slugs: existing, status: "embedded" };

  const url = `${studioshareApiUrl.replace(/\/$/, "")}/core/users/${encodeURIComponent(user.id)}/roles`;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "source_library_role_resolution_failed",
          userId: user.id,
          status: response.status,
        }),
      );
      return { slugs: existing, status: "unavailable" };
    }
    const payload = await response.json();
    const assignments = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.items)
        ? payload.items
        : [];
    const resolved = normalizedRoleSlugs({ roles: assignments });
    return {
      slugs: [...new Set([...existing, ...resolved])],
      status: resolved.length ? "resolved" : "malformed",
    };
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "source_library_role_resolution_failed",
        userId: user.id,
        message: error.message,
      }),
    );
    return { slugs: existing, status: "unavailable" };
  }
}

async function getCurrentUser(req) {
  const localUser = localSignedInUser();
  if (localUser) return localUser;
  const accessToken = cookieValue(req, "access_token");
  if (!accessToken) return null;
  const response = await fetch(`${studioshareApiUrl.replace(/\/$/, "")}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok)
    throw new Error(
      `StudioShare /me request failed with status ${response.status}.`,
    );
  const user = await response.json();
  if (!user?.id || !user?.username)
    throw new Error("StudioShare /me returned an incomplete user record.");
  const roleResolution = await resolveUserRoleSlugs(accessToken, user);
  return {
    ...user,
    resolvedRoleSlugs: roleResolution.slugs,
    roleResolutionStatus: roleResolution.status,
  };
}

async function requireCurrentUser(req, res, next) {
  try {
    const user = await getCurrentUser(req);
    if (!user)
      return res.status(401).json({ error: "Authentication is required." });
    if (user.disabled)
      return res.status(403).json({ error: "This user account is disabled." });
    const storedProfile = await getLoginProfile(pool, user.id);
    if (
      !storedProfile ||
      !resolvedUserMatchesStoredProfile(storedProfile, user, {
        hasLoggedIn: true,
      })
    )
      await upsertUserProfiles(pool, [user], { hasLoggedIn: true });
    req.authenticatedStudioshareUser = user;
    const impersonationToken = cookieValue(req, IMPERSONATION_COOKIE);
    if (!userImpersonationEnabled()) {
      if (impersonationToken) {
        await invalidateImpersonationToken(
          pool,
          impersonationToken,
          "feature_disabled",
        );
        clearImpersonationCookie(res, req);
        logImpersonation("impersonation_feature_disabled", {
          authenticatedUserId: user.id,
        });
      }
      req.studioshareUser = user;
      req.impersonation = { enabled: false, active: false };
      return next();
    }
    let session = null;
    if (impersonationToken)
      session = await resolveImpersonationSession(
        pool,
        impersonationToken,
        user.id,
      );
    if (impersonationToken && !session) {
      await invalidateImpersonationToken(
        pool,
        impersonationToken,
        "invalid_or_expired",
      );
      clearImpersonationCookie(res, req);
      logImpersonation("impersonation_session_cleared", {
        authenticatedUserId: user.id,
        reason: "invalid_or_expired",
      });
    }
    req.studioshareUser = session
      ? effectiveUserFromSession(session, user)
      : user;
    req.impersonation = session
      ? {
          enabled: true,
          active: true,
          sessionId: session.sessionId,
          effectiveProfileId: session.effectiveProfileId,
          expiresAt: session.expiresAt,
        }
      : { enabled: true, active: false };
    return next();
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "identity_failed",
        message: error.message,
      }),
    );
    return res
      .status(502)
      .json({ error: "Could not resolve the signed-in StudioShare user." });
  }
}

function canReplaceSourceLibrary(user) {
  return sourceLibraryAccessDecision(user).allowed;
}

// TEMP DEBUG: remove with the user-metadata tooltip after identity troubleshooting.
function inAppValidationEnabled() {
  return (
    String(process.env.STUDIOSHARE_APP_ENV || "").toLowerCase() === "preview" &&
    String(process.env[IN_APP_VALIDATION_FLAG] || "").toLowerCase() === "true"
  );
}

function userMetadataDebugEnabled() {
  return (
    String(process.env.STUDIOSHARE_APP_ENV || "").toLowerCase() === "preview" &&
    String(process.env[USER_METADATA_DEBUG_FLAG] || "").toLowerCase() === "true"
  );
}

function sanitizedUserMetadata(value, seen = new WeakSet()) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value))
    return value;
  if (typeof value !== "object") return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value))
    return value
      .map((item) => sanitizedUserMetadata(item, seen))
      .filter((item) => item !== undefined);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !USER_METADATA_DEBUG_REDACTED_KEYS.test(key))
      .map(([key, item]) => [key, sanitizedUserMetadata(item, seen)])
      .filter(([, item]) => item !== undefined),
  );
}
function requireSourceLibraryAdmin(req, res, next) {
  const decision = sourceLibraryAccessDecision(req.studioshareUser);
  if (!decision.allowed) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "source_library_authorization_denied",
        userId: req.studioshareUser?.id || null,
        route: req.path,
        requiredRole: SOURCE_LIBRARY_ADMIN_ROLE,
        roles: decision.roles,
        reason: decision.reason,
      }),
    );
    return res.status(403).json({
      error:
        "The StudioShare atlas-align-admin role is required to replace the source library.",
      code: decision.reason,
    });
  }
  return next();
}

function workflowUserFromProfile(profile) {
  const verified = verifiedStoredRoles(profile);
  if (
    !profile?.id ||
    !profile?.username ||
    profile.disabled === true ||
    !verified
  )
    throw Object.assign(new Error("Workflow identity verification failed."), {
      status: 403,
    });
  return {
    id: profile.id,
    username: profile.username,
    fullName: profile.fullName,
    email: profile.email || "",
    avatar: profile.avatar || null,
    disabled: false,
    active: true,
    roles: verified.roles,
    resolvedRoleSlugs: verified.roles,
    roleResolutionStatus: verified.roleResolutionStatus,
  };
}

async function resolveWorkflowUser(req, identity) {
  const id = String(identity?.id || "").trim();
  if (isLocalAppEnv()) {
    if (!id)
      throw Object.assign(
        new Error("Workflow identity verification is unavailable."),
        { status: 403 },
      );
    const profile = await getImpersonationProfile(pool, id);
    if (!profile)
      throw Object.assign(new Error("Workflow identity verification failed."), {
        status: 403,
      });
    return workflowUserFromProfile(profile);
  }
  const token = cookieValue(req, "access_token");
  if (!token || !id)
    throw Object.assign(
      new Error("Workflow identity verification is unavailable."),
      { status: 403 },
    );
  const base = studioshareApiUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/core/users/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok)
    throw Object.assign(new Error("Workflow identity verification failed."), {
      status: 403,
    });
  const user = await response.json();
  const roleResponse = await fetch(
    `${base}/core/users/${encodeURIComponent(id)}/roles`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!roleResponse.ok)
    throw Object.assign(new Error("Workflow role verification failed."), {
      status: 403,
    });
  const payload = await roleResponse.json();
  const assignments = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : [];
  const roles = normalizedRoleSlugs({ roles: assignments });
  return {
    ...user,
    active: user.disabled !== true,
    roles,
    resolvedRoleSlugs: roles,
    roleResolutionStatus: roles.length ? "resolved" : "malformed",
  };
}
async function workflowApproverCandidates(req) {
  const stored = await getAudit(pool, req.params.auditId);
  if (!stored)
    throw Object.assign(new Error("Audit not found."), { status: 404 });
  if (!auditAccessForUser(req.studioshareUser, stored.audit).canRead)
    throw Object.assign(new Error("Audit access is required."), {
      status: 403,
    });
  const q = String(req.query.q || "").trim();
  let identities;
  if (isLocalAppEnv() || !q) {
    if (q && q.length < 2)
      throw Object.assign(new Error("Enter at least two characters."), {
        status: 400,
      });
    identities = await searchUserProfiles(pool, q, 25);
  } else {
    if (q.length < 2)
      throw Object.assign(new Error("Enter at least two characters."), {
        status: 400,
      });
    const token = cookieValue(req, "access_token");
    const url = new URL(`${studioshareApiUrl.replace(/\/$/, "")}/core/users`);
    url.searchParams.set("q", q);
    url.searchParams.set("page", "1");
    url.searchParams.set("size", "25");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok)
      throw Object.assign(new Error("User search is unavailable."), {
        status: response.status === 429 ? 429 : 502,
      });
    const payload = await response.json();
    identities = Array.isArray(payload?.items) ? payload.items : [];
  }
  const verified = await Promise.all(
    identities.slice(0, 25).map(async (identity) => {
      try {
        return await resolveWorkflowUser(req, identity);
      } catch (_error) {
        return null;
      }
    }),
  );
  const seen = new Set();
  return verified
    .filter((user) => user?.active && user.roles?.includes(ATLAS_ADMIN_ROLE))
    .reduce((items, user) => {
      const key = String(user.id || user.username).toLowerCase();
      if (!key || seen.has(key)) return items;
      seen.add(key);
      const assigned = isAssignedAnalyst(user, stored.audit);
      items.push({
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        avatar: user.avatar || null,
        eligible: !assigned,
        ineligibilityCode: assigned ? "assigned_analyst" : null,
        ineligibilityReason: assigned
          ? "This person is an Assigned Analyst on this audit and cannot approve it."
          : null,
      });
      return items;
    }, []);
}

function workflowOptions(req) {
  return {
    user: req.studioshareUser,
    verifyUser: (identity) => resolveWorkflowUser(req, identity),
  };
}
function workflowError(res, error) {
  const status = [400, 401, 403, 404, 409].includes(error.status)
    ? error.status
    : 500;
  if (status === 500) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "workflow_request_failed",
        message: error?.message || "Unknown workflow error",
        code: error?.code || null,
        constraint: error?.constraint || null,
      }),
    );
  }
  return res.status(status).json({
    error: status === 500 ? "Unexpected server error." : error.message,
    draftVersion: error.draftVersion,
    sectionKey: error.sectionKey,
    stableItemKey: error.stableItemKey,
    code: error.code,
    currentRevisionId: error.currentRevisionId,
    currentRequestId: error.currentRequestId,
    currentApprovalId: error.currentApprovalId,
    currentPublicationId: error.currentPublicationId,
  });
}
const routeContext = {
  pool,
  requireCurrentUser,
  requireAuditCapability,
  requireSourceLibraryAdmin,
  workflowFeature,
  workflowFlags,
  path,
  rootDir: __dirname,
  upload,
  cookieValue,
  studioshareApiUrl,
  IMPERSONATION_COOKIE,
  userImpersonationEnabled,
  impersonationCookieOptions,
  clearImpersonationCookie,
  invalidateImpersonationToken,
  startImpersonation,
  renewImpersonation,
  logImpersonation,
  refreshImpersonationCandidates,
  refreshImpersonationProfile,
  inAppValidationEnabled,
  userMetadataDebugEnabled,
  sanitizedUserMetadata,
  canReplaceSourceLibrary,
  sourceLibraryAccessDecision,
  sourceLibraryFromRows,
  fieldLibraryProvenance,
  loadLiveFieldLibrary,
  auditAccessForUser,
  normalizedRoleSlugs,
  isLocalAppEnv,
  searchUserProfiles,
  publicWorkflowFeatureFlags,
  reduceWorkflowCapabilities,
  FIELD_LIBRARY_COLUMNS,
  FIELD_LIBRARY_TABLE,
  quoteIdentifier,
  listAudits,
  listArchivedAudits,
  getAudit,
  saveAudit,
  listAuditRevisions,
  getAuditRevision,
  restoreAuditRevision,
  listStepRevisions,
  getStepRevision,
  restoreStepRevision,
  archiveAudit,
  restoreArchivedAudit,
  permanentlyDeleteArchivedAudit,
  importAudit,
  CsvValidationError,
  replaceFieldLibrary,
  previewAuditRevision,
  previewAuditRestoration,
  previewStepRestoration,
  previewApprovalRequest,
  previewPublication,
  getAuditWorkflowSummary,
  workflowApproverCandidates,
  workflowOptions,
  workflowError,
  submitAuditForApproval,
  rescindAuditApprovalRequest,
  approveAuditRevision,
  denyAuditRevision,
  publishAuditRevision,
  lockAuditRevision,
  unlockPublishedAudit,
  softDeleteAuditPublication,
  listAuditPublications,
  getAuditPublication,
  listAuditActivity,
  listInboxItems,
  getInboxUnreadCount,
  markInboxItemRead,
  getInboxApprovalReviewContext,
  openAuditReview,
  getAuditReview,
  saveAuditReview,
  bulkApproveAuditReview,
  getAuditReviewFinalSummary,
  returnAuditReview,
  getReturnedReviewFeedback,
  finalizeApprovedAuditReview,
  getReviewItemDiscussions,
  createReviewDiscussion,
  addDiscussionMessage,
  resolveDiscussion,
  reopenDiscussion,
};

app.use(createIdentityRouter(routeContext));

// Cached StudioShare profiles support fast assignment suggestions and avatar hydration.
app.use(
  "/api/user-profiles",
  requireCurrentUser,
  createUserProfileRouter({ pool }),
);

app.use(createSourceLibraryRouter(routeContext));
app.use(createAuditRouter(routeContext));
app.use(createFieldLibraryRouter(routeContext));
app.use(createPreviewRouter(routeContext));
app.use(createWorkflowRouter(routeContext));
app.use(createReviewRouter(routeContext));

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        status: "rejected",
        error: "The CSV exceeds the 8 MB upload limit.",
      });
    }

    const multerErrors = {
      LIMIT_FILE_COUNT: "Only one CSV file may be uploaded.",
      LIMIT_UNEXPECTED_FILE: "The upload must use the file field.",
      INVALID_FIELD_NAME:
        "The multipart request contains an invalid field name.",
      STREAM_DESTROYED:
        "The upload connection ended before the file was received.",
    };

    return res.status(400).json({
      status: "rejected",
      error:
        multerErrors[error.code] ||
        "The multipart upload request could not be processed.",
    });
  }

  if (error?.type === "entity.too.large") {
    return res.status(413).json({ error: "The request body is too large." });
  }

  if (error?.type === "entity.parse.failed") {
    return res
      .status(400)
      .json({ error: "The request body is not valid JSON." });
  }

  // Client errors (missing static files, fail(4xx) from routers) keep their status.
  const status = Number(error?.status || error?.statusCode);
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return res.status(status).json({
      error: error.expose === false ? "The request failed." : error.message,
    });
  }

  console.error(
    JSON.stringify({
      level: "error",
      event: "unhandled_error",
      message: error.message,
    }),
  );

  return res.status(500).json({ error: "Unexpected server error." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ level: "info", event: "server_started", port }));
});
