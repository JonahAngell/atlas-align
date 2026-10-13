import { withTransaction } from "./db-transaction.js";

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}
export function minimalUserProfile(user, hasLoggedIn = false) {
  if (!user || typeof user !== "object" || Array.isArray(user)) return null;
  const id = cleanText(user.id);
  const username = cleanText(user.username);
  if (!id || !username) return null;
  return {
    id,
    username,
    fullName: cleanText(user.fullName),
    avatar: cleanText(user.avatar) || null,
    email: cleanText(user.email) || null,
    roleSlugs: [
      ...new Set(
        (Array.isArray(user.resolvedRoleSlugs)
          ? user.resolvedRoleSlugs
          : Array.isArray(user.roles)
            ? user.roles
            : []
        )
          .map((role) =>
            cleanText(typeof role === "string" ? role : role?.slug),
          )
          .filter(Boolean),
      ),
    ],
    roleResolutionStatus: cleanText(user.roleResolutionStatus) || null,
    hasRoleSnapshot:
      Array.isArray(user.resolvedRoleSlugs) ||
      Array.isArray(user.roles) ||
      ["resolved", "resolved_empty"].includes(
        cleanText(user.roleResolutionStatus),
      ),
    disabled: user.disabled === true,
    hasLoggedIn: hasLoggedIn === true,
  };
}
export async function upsertUserProfilesWithClient(
  client,
  users,
  { hasLoggedIn = false } = {},
) {
  const profiles = (Array.isArray(users) ? users : [users])
    .map((user) => minimalUserProfile(user, hasLoggedIn))
    .filter(Boolean);
  if (!profiles.length) return [];
  for (const profile of profiles) {
    await client.query(
      `INSERT INTO atlas_user_profiles
      (user_id,username,full_name,avatar_url,email,role_slugs,disabled,has_logged_in,role_resolution_status,last_role_resolved_at)
      VALUES ($1,$2,$3,$4,$5,$6::text[],$7,$8,
        CASE WHEN $9 THEN CASE WHEN cardinality($6::text[])>0 THEN 'resolved' ELSE 'resolved_empty' END ELSE NULL END,
        CASE WHEN $9 THEN current_timestamp ELSE NULL END)
      ON CONFLICT (user_id) DO UPDATE SET
        username=EXCLUDED.username, full_name=EXCLUDED.full_name,
        avatar_url=EXCLUDED.avatar_url,
        email=COALESCE(EXCLUDED.email, atlas_user_profiles.email),
        role_slugs=CASE WHEN $9 THEN EXCLUDED.role_slugs ELSE atlas_user_profiles.role_slugs END,
        role_resolution_status=CASE WHEN $9 THEN CASE WHEN cardinality(EXCLUDED.role_slugs)>0 THEN 'resolved' ELSE 'resolved_empty' END ELSE atlas_user_profiles.role_resolution_status END,
        last_role_resolved_at=CASE WHEN $9 THEN current_timestamp ELSE atlas_user_profiles.last_role_resolved_at END,
        disabled=EXCLUDED.disabled,
        has_logged_in=atlas_user_profiles.has_logged_in OR EXCLUDED.has_logged_in,
        last_seen_at=CASE WHEN EXCLUDED.has_logged_in THEN current_timestamp ELSE atlas_user_profiles.last_seen_at END,
        last_resolved_at=current_timestamp`,
      [
        profile.id,
        profile.username,
        profile.fullName,
        profile.avatar,
        profile.email,
        profile.roleSlugs,
        profile.disabled,
        profile.hasLoggedIn,
        profile.hasRoleSnapshot,
      ],
    );
  }
  return profiles;
}
export async function upsertUserProfiles(pool, users, options = {}) {
  return withTransaction(pool, (client) =>
    upsertUserProfilesWithClient(client, users, options),
  );
}

function sameTextList(left, right) {
  const a = [...(left || [])].map((item) => String(item));
  const b = [...(right || [])].map((item) => String(item));
  a.sort();
  b.sort();
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/** True when an upsert would not change username, name, email, roles, login, avatar, or disabled. */
export function resolvedUserMatchesStoredProfile(
  stored,
  user,
  { hasLoggedIn = false } = {},
) {
  const next = minimalUserProfile(user, hasLoggedIn);
  if (!stored || !next) return false;
  if (stored.username !== next.username) return false;
  if ((stored.fullName || "") !== next.fullName) return false;
  if ((stored.avatar || null) !== (next.avatar || null)) return false;
  if (next.email && (stored.email || null) !== next.email) return false;
  if (Boolean(stored.disabled) !== Boolean(next.disabled)) return false;
  if (next.hasLoggedIn && stored.hasLoggedIn !== true) return false;
  if (next.hasRoleSnapshot) {
    if (!sameTextList(stored.roleSlugs, next.roleSlugs)) return false;
    const status = next.roleSlugs.length ? "resolved" : "resolved_empty";
    if (stored.roleResolutionStatus !== status) return false;
  }
  return true;
}

export async function getLoginProfile(pool, userId) {
  const result = await pool.query(
    `SELECT user_id AS id, username,
    full_name AS "fullName", avatar_url AS avatar, email,
    role_slugs AS "roleSlugs", role_resolution_status AS "roleResolutionStatus",
    disabled, has_logged_in AS "hasLoggedIn"
    FROM atlas_user_profiles WHERE user_id=$1`,
    [cleanText(userId)],
  );
  return result.rows[0] || null;
}
export async function searchUserProfiles(pool, query = "", size = 20) {
  const q = cleanText(query);
  const limit = Math.max(1, Math.min(25, Number(size) || 20));
  const result = await pool.query(
    `SELECT user_id AS id, username,
    full_name AS "fullName", avatar_url AS avatar, email, role_slugs AS "roleSlugs", role_resolution_status AS "roleResolutionStatus", last_role_resolved_at AS "lastRoleResolvedAt", disabled
    FROM atlas_user_profiles
    WHERE disabled=false AND ($1='' OR username ILIKE '%' || $1 || '%' OR full_name ILIKE '%' || $1 || '%')
    ORDER BY has_logged_in DESC, last_seen_at DESC, lower(full_name), lower(username)
    LIMIT $2`,
    [q, limit],
  );
  return result.rows;
}
export async function cachedProfilesForIdentities(pool, users) {
  const ids = [
    ...new Set((users || []).map((user) => cleanText(user.id)).filter(Boolean)),
  ];
  const usernames = [
    ...new Set(
      (users || [])
        .map((user) => cleanText(user.username).toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (!ids.length && !usernames.length) return [];
  const result = await pool.query(
    `SELECT user_id AS id, username,
    full_name AS "fullName", avatar_url AS avatar, email, role_slugs AS "roleSlugs", role_resolution_status AS "roleResolutionStatus", last_role_resolved_at AS "lastRoleResolvedAt", disabled, last_resolved_at AS "lastResolvedAt"
    FROM atlas_user_profiles WHERE user_id=ANY($1::text[]) OR lower(username)=ANY($2::text[])`,
    [ids, usernames],
  );
  return result.rows;
}

export async function listImpersonationProfiles(pool) {
  const result = await pool.query(`SELECT user_id AS id, username,
    full_name AS "fullName", avatar_url AS avatar, email,
    role_slugs AS "roleSlugs", role_resolution_status AS "roleResolutionStatus", last_role_resolved_at AS "lastRoleResolvedAt", disabled
    FROM atlas_user_profiles
    ORDER BY lower(COALESCE(NULLIF(full_name,''),username)), lower(COALESCE(email,'')), user_id`);
  return result.rows;
}

export async function getImpersonationProfile(pool, userId) {
  const result = await pool.query(
    `SELECT user_id AS id, username,
    full_name AS "fullName", avatar_url AS avatar, email,
    role_slugs AS "roleSlugs", role_resolution_status AS "roleResolutionStatus", last_role_resolved_at AS "lastRoleResolvedAt", disabled
    FROM atlas_user_profiles WHERE user_id=$1`,
    [cleanText(userId)],
  );
  return result.rows[0] || null;
}

export async function saveProfileRoleRefreshSuccess(pool, profile) {
  const status = cleanText(profile.roleResolutionStatus);
  if (!["resolved", "resolved_empty"].includes(status)) {
    throw new TypeError(
      "A successful role refresh requires a verified status.",
    );
  }
  const roleSlugs = [
    ...new Set((profile.roleSlugs || []).map(cleanText).filter(Boolean)),
  ].sort();
  const result = await pool.query(
    `UPDATE atlas_user_profiles SET
      username=COALESCE(NULLIF($2,''),username),
      full_name=COALESCE(NULLIF($3,''),full_name),
      avatar_url=COALESCE($4,avatar_url),
      email=COALESCE($5,email),
      disabled=$6,
      role_slugs=$7::text[],
      role_resolution_status=$8,
      last_role_resolved_at=current_timestamp,
      last_resolved_at=current_timestamp
    WHERE user_id=$1
    RETURNING user_id AS id,username,full_name AS "fullName",avatar_url AS avatar,email,
      role_slugs AS "roleSlugs",role_resolution_status AS "roleResolutionStatus",
      last_role_resolved_at AS "lastRoleResolvedAt",disabled`,
    [
      cleanText(profile.id),
      cleanText(profile.username),
      cleanText(profile.fullName),
      cleanText(profile.avatar) || null,
      cleanText(profile.email) || null,
      profile.disabled === true,
      roleSlugs,
      status,
    ],
  );
  return result.rows[0] || null;
}

export async function recordProfileRoleRefreshFailure(pool, userId, status) {
  if (!["unavailable", "forbidden", "not_found"].includes(status)) {
    throw new TypeError("Invalid role refresh failure status.");
  }
  await pool.query(
    `UPDATE atlas_user_profiles SET role_resolution_status=$2 WHERE user_id=$1`,
    [cleanText(userId), status],
  );
}
