const GRAPH = "https://graph.microsoft.com/v1.0";
const REQUIRED_KEYS = [
  "SP_TENANT_ID",
  "SP_CLIENT_ID",
  "SP_CLIENT_SECRET",
  "SP_HOST",
  "SP_SITE",
  "SP_FILE",
];
const HOST_PATTERN = /^[A-Za-z0-9.-]+$/;
const SITE_PATTERN = /^[^/?#\\]+$/;

const state = {
  token: { value: null, expires: 0 },
  siteIds: new Map(),
  cache: { checked: 0, etag: null, bytes: null, key: "" },
  tail: Promise.resolve(),
};

export class SharePointError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "SharePointError";
    this.status = details.status || null;
  }
}

export function resetSharePointState() {
  state.token = { value: null, expires: 0 };
  state.siteIds = new Map();
  state.cache = { checked: 0, etag: null, bytes: null, key: "" };
  state.tail = Promise.resolve();
}

function enqueue(task) {
  const run = state.tail.then(task, task);
  state.tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function setting(env, key) {
  return String(env[key] ?? "").trim();
}

export function readSharePointConfig(env = process.env) {
  const missing = REQUIRED_KEYS.filter((key) => !setting(env, key));
  if (missing.length) return { configured: false };
  const host = setting(env, "SP_HOST");
  const site = setting(env, "SP_SITE");
  if (!HOST_PATTERN.test(host) || !SITE_PATTERN.test(site)) {
    return { configured: false, invalid: true };
  }
  const rawCache = setting(env, "SP_CACHE_SECONDS");
  const parsedCache = Number(rawCache);
  const cacheSeconds =
    rawCache && Number.isFinite(parsedCache) && parsedCache >= 0
      ? parsedCache
      : 300;
  return {
    configured: true,
    tenantId: setting(env, "SP_TENANT_ID"),
    clientId: setting(env, "SP_CLIENT_ID"),
    clientSecret: setting(env, "SP_CLIENT_SECRET"),
    host,
    site,
    folder: setting(env, "SP_FOLDER").replace(/^\/|\/$/g, ""),
    file: setting(env, "SP_FILE"),
    sheet: setting(env, "SP_SHEET"),
    cacheSeconds,
  };
}

function encodeGraphPath(value) {
  return String(value || "")
    .replace(/^\/|\/$/g, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function cacheKey(config) {
  return [config.host, config.site, config.folder, config.file].join("\n");
}

function fileLocation(config) {
  return config.folder ? `${config.folder}/${config.file}` : config.file;
}

async function accessToken(config, fetchImpl, now) {
  if (state.token.value && now() < state.token.expires - 60_000) {
    return state.token.value;
  }
  let response;
  try {
    response = await fetchImpl(
      `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: config.clientId,
          client_secret: config.clientSecret,
          scope: "https://graph.microsoft.com/.default",
        }),
      },
    );
  } catch {
    throw new SharePointError("SharePoint workbook unavailable.");
  }
  if (!response.ok) {
    throw new SharePointError(`Token request failed (${response.status})`, {
      status: response.status,
    });
  }
  const body = await response.json();
  if (!body?.access_token) {
    throw new SharePointError("Token request failed.");
  }
  state.token = {
    value: body.access_token,
    expires: now() + Number(body.expires_in ?? 3600) * 1000,
  };
  return state.token.value;
}

async function graphGet(path, { raw, config, fetchImpl, now }) {
  const token = await accessToken(config, fetchImpl, now);
  let response;
  try {
    response = await fetchImpl(path.startsWith("http") ? path : `${GRAPH}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "follow",
    });
  } catch {
    throw new SharePointError("SharePoint workbook unavailable.");
  }
  if (!response.ok) {
    throw new SharePointError(
      `SharePoint workbook unavailable (HTTP ${response.status})`,
      { status: response.status },
    );
  }
  if (raw) return Buffer.from(await response.arrayBuffer());
  try {
    return await response.json();
  } catch {
    throw new SharePointError("SharePoint workbook unavailable.");
  }
}

async function siteId(config, fetchImpl, now) {
  const cached = state.siteIds.get(config.site);
  if (cached) return cached;
  const body = await graphGet(
    `/sites/${encodeURIComponent(config.host)}:/sites/${encodeURIComponent(config.site)}`,
    { config, fetchImpl, now },
  );
  if (!body?.id) throw new SharePointError("SharePoint workbook unavailable.");
  state.siteIds.set(config.site, body.id);
  return body.id;
}

async function readSharePointWorkbookUncached({
  fetchImpl = globalThis.fetch,
  now = Date.now,
  env = process.env,
} = {}) {
  const config = readSharePointConfig(env);
  if (!config.configured) {
    return { outcome: config.invalid ? "invalid_config" : "not_configured" };
  }
  const key = cacheKey(config);
  const ttlMs = config.cacheSeconds * 1000;
  if (
    state.cache.bytes &&
    state.cache.key === key &&
    now() - state.cache.checked < ttlMs
  ) {
    return {
      outcome: "cached",
      bytes: state.cache.bytes,
      fileName: config.file,
      sheetName: config.sheet,
    };
  }

  const id = await siteId(config, fetchImpl, now);
  const itemPath = `/sites/${id}/drive/root:/${encodeGraphPath(fileLocation(config))}:`;
  const metadata = await graphGet(itemPath, { config, fetchImpl, now });
  const etag = metadata?.eTag || metadata?.cTag || "";
  if (state.cache.bytes && state.cache.key === key && etag && state.cache.etag === etag) {
    state.cache.checked = now();
    return {
      outcome: "reloaded",
      bytes: state.cache.bytes,
      fileName: config.file,
      sheetName: config.sheet,
    };
  }
  const bytes = await graphGet(`${itemPath}/content`, {
    raw: true,
    config,
    fetchImpl,
    now,
  });
  state.cache = { checked: now(), etag, bytes, key };
  return {
    outcome: "reloaded",
    bytes,
    fileName: config.file,
    sheetName: config.sheet,
  };
}

export function readSharePointWorkbook(options) {
  return enqueue(() => readSharePointWorkbookUncached(options));
}
