import {
  getImpersonationProfile,
  listImpersonationProfiles,
  recordProfileRoleRefreshFailure,
  saveProfileRoleRefreshSuccess,
} from "./user-profile-repository.js";
import { isLocalAppEnv, verifiedStoredRoles } from "./local-development.js";
import { studioShareRequest } from "./studioshare-client.js";

export const USER_ROLE_REFRESH_MAX_AGE_MS = 15 * 60 * 1000;
export const USER_ROLE_REFRESH_CONCURRENCY = 3;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeUserRoleSlugs(payload) {
  const assignments = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : null;
  if (!assignments)
    throw new TypeError("Unrecognized StudioShare role response.");
  return [
    ...new Set(
      assignments
        .map((assignment) => {
          if (typeof assignment === "string") return text(assignment);
          return text(assignment?.role?.slug || assignment?.slug);
        })
        .filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

export function roleRefreshStatusForError(error) {
  if (error?.status === 401 || error?.status === 403) return "forbidden";
  if (error?.status === 404) return "not_found";
  return "unavailable";
}

export function profileRoleSnapshotIsFresh(profile, now = Date.now()) {
  if (!["resolved", "resolved_empty"].includes(profile?.roleResolutionStatus))
    return false;
  const resolvedAt = Date.parse(profile?.lastRoleResolvedAt || "");
  return (
    Number.isFinite(resolvedAt) &&
    now - resolvedAt < USER_ROLE_REFRESH_MAX_AGE_MS
  );
}

export async function refreshImpersonationProfile(pool, req, profileId) {
  const cached = await getImpersonationProfile(pool, profileId);
  if (!cached) return { ok: false, status: "not_found", profile: null };
  if (isLocalAppEnv()) {
    return verifiedStoredRoles(cached)
      ? { ok: true, profile: cached }
      : { ok: false, status: "unavailable", profile: cached };
  }
  try {
    const userResult = await studioShareRequest(
      req,
      `/core/users/${encodeURIComponent(profileId)}`,
    );
    const roleResult = await studioShareRequest(
      req,
      `/core/users/${encodeURIComponent(profileId)}/roles`,
    );
    const roleSlugs = normalizeUserRoleSlugs(roleResult.payload);
    const profile = await saveProfileRoleRefreshSuccess(pool, {
      ...cached,
      ...userResult.payload,
      id: cached.id,
      roleSlugs,
      roleResolutionStatus: roleSlugs.length ? "resolved" : "resolved_empty",
    });
    return { ok: true, profile, rateLimit: roleResult.rateLimit };
  } catch (error) {
    const status = roleRefreshStatusForError(error);
    await recordProfileRoleRefreshFailure(pool, profileId, status);
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "impersonation_role_refresh_failed",
        profileId,
        status,
        rateLimit: error.rateLimit || undefined,
      }),
    );
    return {
      ok: false,
      status,
      profile: await getImpersonationProfile(pool, profileId),
    };
  }
}

export async function refreshImpersonationCandidates(pool, req) {
  const profiles = await listImpersonationProfiles(pool);
  const stale = profiles.filter(
    (profile) => !profileRoleSnapshotIsFresh(profile),
  );
  let cursor = 0;
  let rateLimited = false;
  async function worker() {
    while (!rateLimited) {
      const profile = stale[cursor++];
      if (!profile) return;
      const result = await refreshImpersonationProfile(pool, req, profile.id);
      if (result.rateLimit?.remaining === "0") rateLimited = true;
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(USER_ROLE_REFRESH_CONCURRENCY, stale.length) },
      worker,
    ),
  );
  return listImpersonationProfiles(pool);
}
