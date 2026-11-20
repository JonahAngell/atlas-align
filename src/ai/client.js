/**
 * Studioshare AI Gateway client. The gateway is the only provider. It speaks
 * the OpenAI-compatible /v1/chat/completions API.
 *
 * Tokens, in order of precedence:
 *   1. STUDIOSHARE_OIDC_TOKEN (pre-minted, mainly local work)
 *   2. a token minted from STUDIOSHARE_OIDC_URL (Launch sidecar)
 *   3. STUDIOSHARE_AI_API_KEY (personal access token, ATLAS_APP_ENV=local only)
 * Tokens never leave the server and are never logged.
 */
import { aiConfig } from "./config.js";

export const AI_STATUS = Object.freeze({
  ok: "ok",
  unavailable: "unavailable",
  rateLimited: "rate_limited",
  invalid: "invalid",
});

// A later "unavailable" never hides an earlier, more useful outcome.
const STATUS_RANK = { unavailable: 0, rate_limited: 1, invalid: 2, ok: 3 };
const keepStatus = (current, next) =>
  (STATUS_RANK[next] ?? 0) > (STATUS_RANK[current] ?? 0) ? next : current;

const GUARD_MODEL = /content-safety|moderation|guard/i;
const TOKEN_REFRESH_MARGIN_MS = 15 * 60 * 1000;
const SHORT_TOKEN_TTL_MS = 5 * 60 * 1000;
const MAX_RETRY_WAIT_MS = 5000;
const MODELS_TTL_MS = 5 * 60 * 1000;

export function createAiClient({
  fetch: fetchImpl = globalThis.fetch,
  env = process.env,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = () => {},
} = {}) {
  let cachedToken = null; // { token, refreshAt }
  let cachedModels = null; // { at, ids }

  function config() {
    return aiConfig(env);
  }

  function tokenSource() {
    if (String(env.STUDIOSHARE_OIDC_TOKEN || "").trim()) return "oidc_token";
    if (String(env.STUDIOSHARE_OIDC_URL || "").trim()) return "oidc_url";
    if (String(env.STUDIOSHARE_AI_API_KEY || "").trim() && config().local)
      return "api_key";
    return null;
  }

  /** True when the gateway URL and a usable token source are both set. */
  function configured() {
    return Boolean(config().gatewayUrl && tokenSource());
  }

  async function token() {
    const source = tokenSource();
    if (source === "oidc_token")
      return String(env.STUDIOSHARE_OIDC_TOKEN).trim();
    if (source === "api_key") return String(env.STUDIOSHARE_AI_API_KEY).trim();
    if (source !== "oidc_url") return null;
    if (cachedToken && now() < cachedToken.refreshAt) return cachedToken.token;
    try {
      const response = await fetchImpl(
        String(env.STUDIOSHARE_OIDC_URL).trim(),
        {
          method: "POST",
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) return null;
      const body = await response.json();
      if (!body?.token || typeof body.token !== "string") return null;
      const expiresAt = Date.parse(body.expiresAt);
      const refreshAt = Number.isFinite(expiresAt)
        ? Math.max(now(), expiresAt - TOKEN_REFRESH_MARGIN_MS)
        : now() + SHORT_TOKEN_TTL_MS;
      cachedToken = { token: body.token, refreshAt };
      return body.token;
    } catch (_error) {
      return null;
    }
  }

  function clearToken() {
    cachedToken = null;
  }

  /**
   * One completion. Tries each model in order and returns
   * { status, text, model, usage, latencyMs }.
   */
  async function complete({
    messages,
    models,
    maxTokens = 2000,
    timeoutMs,
    json = true,
  }) {
    const settings = config();
    const started = now();
    const result = (status, extra = {}) => ({
      status,
      text: "",
      model: null,
      usage: null,
      latencyMs: now() - started,
      ...extra,
    });
    if (!configured()) return result(AI_STATUS.unavailable);
    const bearer = await token();
    if (!bearer) return result(AI_STATUS.unavailable);
    const timeout = settings.timeoutMs || timeoutMs || 30000;
    let status = AI_STATUS.unavailable;
    for (const model of models?.length ? models : settings.models) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        let response;
        try {
          response = await fetchImpl(
            `${settings.gatewayUrl}/v1/chat/completions`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${bearer}`,
              },
              body: JSON.stringify({
                model,
                messages,
                temperature: 0,
                max_tokens: maxTokens,
                ...(json ? { response_format: { type: "json_object" } } : {}),
              }),
              signal: AbortSignal.timeout(timeout),
            },
          );
        } catch (_error) {
          break; // timeout or network: next model
        }
        if (response.status === 429) {
          status = keepStatus(status, AI_STATUS.rateLimited);
          if (attempt === 0) {
            const wait = Number(response.headers?.get?.("retry-after")) * 1000;
            await sleep(
              Math.min(MAX_RETRY_WAIT_MS, Number.isFinite(wait) ? wait : 1000),
            );
            continue;
          }
          break;
        }
        if (response.status === 401) {
          clearToken();
          log({ event: "ai_gateway_unauthorized" });
          return result(status);
        }
        if (response.status === 400 || response.status === 422) {
          status = keepStatus(status, AI_STATUS.invalid);
          break;
        }
        if (!response.ok) break;
        let body;
        try {
          body = await response.json();
        } catch (_error) {
          status = keepStatus(status, AI_STATUS.invalid);
          break;
        }
        const served = String(body?.model || model);
        if (GUARD_MODEL.test(served)) break;
        const text = body?.choices?.[0]?.message?.content;
        if (typeof text !== "string" || !text.trim()) {
          status = keepStatus(status, AI_STATUS.invalid);
          break;
        }
        return result(AI_STATUS.ok, {
          text,
          model: served,
          usage: body.usage || null,
        });
      }
    }
    return result(status);
  }

  /** Model ids the gateway lists for this app, cached for a few minutes. */
  async function listModels() {
    if (cachedModels && now() - cachedModels.at < MODELS_TTL_MS)
      return cachedModels.ids;
    if (!configured()) return null;
    const bearer = await token();
    if (!bearer) return null;
    try {
      const response = await fetchImpl(`${config().gatewayUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${bearer}` },
        signal: AbortSignal.timeout(10000),
      });
      if (response.status === 401) clearToken();
      if (!response.ok) return null;
      const body = await response.json();
      const ids = (Array.isArray(body?.data) ? body.data : [])
        .map((item) => String(item?.id || ""))
        .filter(Boolean);
      cachedModels = { at: now(), ids };
      return ids;
    } catch (_error) {
      return null;
    }
  }

  return { complete, listModels, configured, tokenSource };
}
