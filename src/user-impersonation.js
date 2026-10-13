import { createHash, randomBytes } from "node:crypto";
import {
  getImpersonationProfile,
  listImpersonationProfiles,
} from "./user-profile-repository.js";
import { loadSql } from "./sql.js";

const SQL = Object.freeze({
  resolveImpersonationSession: loadSql(
    "../sql/user-impersonation/resolve-impersonation-session.sql",
    import.meta.url,
  ),
  invalidateImpersonationToken: loadSql(
    "../sql/user-impersonation/invalidate-impersonation-token.sql",
    import.meta.url,
  ),
  createImpersonationSession: loadSql(
    "../sql/user-impersonation/create-impersonation-session.sql",
    import.meta.url,
  ),
  renewImpersonationSession: loadSql(
    "../sql/user-impersonation/renew-impersonation-session.sql",
    import.meta.url,
  ),
});

export const IMPERSONATION_COOKIE = "atlas_impersonation";
export const IMPERSONATION_TTL_MS = 24 * 60 * 60 * 1000;
export function userImpersonationEnabled(env = process.env) {
  return (
    String(env.ATLAS_USER_IMPERSONATION_ENABLED || "")
      .trim()
      .toLowerCase() === "true"
  );
}
export function hashImpersonationToken(token) {
  return createHash("sha256")
    .update(String(token || ""), "utf8")
    .digest("hex");
}
export function impersonationCookieOptions(req) {
  const secure =
    req.secure ||
    String(req.headers["x-forwarded-proto"] || "")
      .split(",")[0]
      .trim() === "https";
  return {
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
    maxAge: IMPERSONATION_TTL_MS,
  };
}
export function clearImpersonationCookie(res, req) {
  res.clearCookie(IMPERSONATION_COOKIE, {
    ...impersonationCookieOptions(req),
    maxAge: undefined,
  });
}
export function logImpersonation(event, fields = {}) {
  console.info(JSON.stringify({ level: "info", event, ...fields }));
}
export async function resolveImpersonationSession(
  pool,
  token,
  authenticatedUserId,
) {
  if (!token) return null;
  const result = await pool.query(SQL.resolveImpersonationSession, [
    hashImpersonationToken(token),
    String(authenticatedUserId),
  ]);
  return result.rows[0] || null;
}
export async function invalidateImpersonationToken(pool, token, reason) {
  if (!token) return;
  await pool.query(SQL.invalidateImpersonationToken, [
    hashImpersonationToken(token),
    reason,
  ]);
}
export async function startImpersonation(
  pool,
  authenticatedUserId,
  effectiveProfileId,
) {
  const profile = await getImpersonationProfile(pool, effectiveProfileId);
  if (!profile) return null;
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MS);
  const result = await pool.query(SQL.createImpersonationSession, [
    hashImpersonationToken(token),
    String(authenticatedUserId),
    profile.id,
    expiresAt,
  ]);
  return {
    token,
    expiresAt: expiresAt.toISOString(),
    sessionId: result.rows[0].id,
    profile,
  };
}
export async function renewImpersonation(pool, token, authenticatedUserId) {
  const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MS);
  const result = await pool.query(SQL.renewImpersonationSession, [
    hashImpersonationToken(token),
    String(authenticatedUserId),
    expiresAt,
  ]);
  return result.rows[0]
    ? { ...result.rows[0], expiresAt: expiresAt.toISOString() }
    : null;
}
export async function impersonationCandidates(pool) {
  return listImpersonationProfiles(pool);
}
export function effectiveUserFromSession(session, authenticatedUser) {
  return {
    id: session.effectiveProfileId,
    username: session.username,
    fullName: session.fullName,
    email: session.email || "",
    avatar: session.avatar || null,
    disabled: session.disabled === true,
    roles: session.roleSlugs || [],
    resolvedRoleSlugs: session.roleSlugs || [],
    roleResolutionStatus: session.roleResolutionStatus || "unavailable",
    authenticatedActor: {
      id: authenticatedUser.id,
      username: authenticatedUser.username,
    },
  };
}
