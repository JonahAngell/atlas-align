/** Reads one decoded cookie value. Returns an empty string when it is absent. */
export function cookieValue(request, name) {
  const cookies = String(request.headers.cookie || "").split(";");
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;
    const key = cookie.slice(0, separator).trim();
    if (key !== name) continue;
    return decodeURIComponent(cookie.slice(separator + 1));
  }
  return "";
}

export function studioshareApiBase() {
  return String(process.env.STUDIOSHARE_API_URL || "").replace(/\/$/, "");
}

/**
 * Bearer token, otherwise the raw access_token cookie.
 * This cookie value is not decoded, matching the profile directory client.
 */
export function profileAccessToken(req) {
  const auth = String(req.headers.authorization || "");
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  const cookies = Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((item) => item.trim().split(/=(.*)/s).slice(0, 2)),
  );
  return cookies.access_token || "";
}

/**
 * Bearer token, otherwise a decoded access_token cookie.
 * This matches the role-refresh client.
 */
export function refreshAccessToken(req) {
  const authorization = String(req.headers.authorization || "");
  if (authorization.startsWith("Bearer ")) return authorization.slice(7);
  const cookie = String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("access_token="));
  return cookie ? decodeURIComponent(cookie.slice("access_token=".length)) : "";
}

/** StudioShare JSON request used by profile lookup. Preserves upstream error text. */
export async function studioShareJson(req, path) {
  const base = studioshareApiBase();
  const token = profileAccessToken(req);
  if (!base || !token)
    throw Object.assign(new Error("StudioShare user lookup is unavailable."), {
      status: 503,
    });
  const response = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw Object.assign(
      new Error(
        payload?.error || `StudioShare request failed with ${response.status}.`,
      ),
      { status: response.status },
    );
  return payload;
}

function rateLimitMetadata(response) {
  return {
    limit: response.headers.get("ratelimit-limit") || undefined,
    remaining: response.headers.get("ratelimit-remaining") || undefined,
    reset: response.headers.get("ratelimit-reset") || undefined,
  };
}

/** StudioShare JSON request used by role refresh, including timeout and rate-limit metadata. */
export async function studioShareRequest(req, path) {
  const base = studioshareApiBase();
  const token = refreshAccessToken(req);
  if (!base || !token) {
    throw Object.assign(new Error("StudioShare lookup is unavailable."), {
      status: 503,
    });
  }
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    throw Object.assign(new Error("StudioShare lookup is unavailable."), {
      status: 503,
      cause: error,
    });
  }
  const metadata = rateLimitMetadata(response);
  const payload = await response.json().catch(() => {
    throw Object.assign(new Error("StudioShare returned malformed JSON."), {
      status: 502,
      rateLimit: metadata,
    });
  });
  if (!response.ok) {
    throw Object.assign(
      new Error(`StudioShare request failed with ${response.status}.`),
      {
        status: response.status,
        rateLimit: metadata,
      },
    );
  }
  return { payload, rateLimit: metadata };
}
