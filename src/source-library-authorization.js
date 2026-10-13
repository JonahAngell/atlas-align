import { SOURCE_LIBRARY_ADMIN_ROLE } from "./00-global-variables.js";

function roleSlug(value) {
  if (typeof value === "string") {
    const candidate = value.trim().toLowerCase();
    return /^[a-f0-9]{24}$/i.test(candidate) ? "" : candidate;
  }
  if (!value || typeof value !== "object") return "";
  return roleSlug(value.slug || value.role?.slug || "");
}

function normalizedRoleSlugs(user) {
  const values = [
    ...(Array.isArray(user?.resolvedRoleSlugs) ? user.resolvedRoleSlugs : []),
    ...(Array.isArray(user?.roles) ? user.roles : []),
  ];
  return [...new Set(values.map(roleSlug).filter(Boolean))];
}

function sourceLibraryAccessDecision(user) {
  const roles = normalizedRoleSlugs(user);
  const allowed = roles.includes(SOURCE_LIBRARY_ADMIN_ROLE);
  let reason = allowed ? "required_role_present" : "required_role_absent";
  if (!allowed && user?.roleResolutionStatus === "unavailable")
    reason = "role_resolution_unavailable";
  if (!allowed && user?.roleResolutionStatus === "malformed")
    reason = "role_payload_malformed";
  return { allowed, reason, roles };
}

export { normalizedRoleSlugs, sourceLibraryAccessDecision };
