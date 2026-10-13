import {
  ATLAS_ADMIN_ROLE,
  SOURCE_LIBRARY_ADMIN_ROLE,
} from "./00-global-variables.js";

const LOCAL_USER_PROFILES = Object.freeze({
  "local-user-1": Object.freeze({
    username: "local.user",
    fullName: "Local Test User",
  }),
  "local-user-2": Object.freeze({
    username: "local.reviewer",
    fullName: "Local Test Reviewer",
  }),
});

const LOCAL_DEVELOPMENT_ROLES = Object.freeze([
  ATLAS_ADMIN_ROLE,
  SOURCE_LIBRARY_ADMIN_ROLE,
]);

export function isLocalAppEnv(env = process.env) {
  return (
    String(env.ATLAS_APP_ENV || "")
      .trim()
      .toLowerCase() === "local"
  );
}

/**
 * Signed-in identity for local development. Returns null unless
 * ATLAS_APP_ENV is exactly "local", so an unsigned request stays refused
 * in StudioShare environments.
 */
export function localSignedInUser(env = process.env) {
  if (!isLocalAppEnv(env)) return null;
  const id = String(env.DEV_USER_ID || "").trim() || "local-user-1";
  const known = LOCAL_USER_PROFILES[id] || { username: id, fullName: id };
  return {
    id,
    username: known.username,
    fullName: known.fullName,
    email: "",
    avatar: null,
    disabled: false,
    roles: [...LOCAL_DEVELOPMENT_ROLES],
    resolvedRoleSlugs: [...LOCAL_DEVELOPMENT_ROLES],
    roleResolutionStatus: "embedded",
  };
}

/** A stored profile snapshot that local mode can trust without StudioShare. */
export function verifiedStoredRoles(profile) {
  const status = String(profile?.roleResolutionStatus || "").trim();
  if (!["resolved", "resolved_empty"].includes(status)) return null;
  const roles = [
    ...new Set(
      (Array.isArray(profile.roleSlugs) ? profile.roleSlugs : [])
        .map((role) => String(role || "").trim())
        .filter(Boolean),
    ),
  ];
  return { roles, roleResolutionStatus: status };
}
