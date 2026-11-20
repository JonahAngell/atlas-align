/**
 * AI settings read from the environment. Everything is off unless
 * ATLAS_AI_ENABLED is the literal "true", the same rule as the workflow flags.
 */

export const AI_FEATURES = Object.freeze([
  "code-import",
  "chat-explain",
  "chat-suggest",
  "drift-check",
  "review-summary",
  "import",
  "issues",
  "search",
]);

export const DEFAULT_MODELS = Object.freeze(["anthropic/claude-sonnet-4-6"]);

const isTrue = (value) =>
  String(value || "")
    .trim()
    .toLowerCase() === "true";

function list(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function positiveInt(value, fallback) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function aiConfig(env = process.env) {
  const enabled = isTrue(env.ATLAS_AI_ENABLED);
  const requested = list(env.ATLAS_AI_FEATURES);
  const features = enabled
    ? requested.length
      ? AI_FEATURES.filter((name) => requested.includes(name))
      : [...AI_FEATURES]
    : [];
  const models = list(env.STUDIOSHARE_AI_MODELS);
  const codeModels = list(env.STUDIOSHARE_AI_CODE_MODELS);
  return Object.freeze({
    enabled,
    features: Object.freeze(features),
    gatewayUrl: String(env.STUDIOSHARE_AI_GATEWAY_URL || "")
      .trim()
      .replace(/\/+$/, ""),
    models: Object.freeze(models.length ? models : [...DEFAULT_MODELS]),
    codeModels: Object.freeze(
      codeModels.length
        ? codeModels
        : models.length
          ? models
          : [...DEFAULT_MODELS],
    ),
    local:
      String(env.ATLAS_APP_ENV || "")
        .trim()
        .toLowerCase() === "local",
    timeoutMs: positiveInt(env.ATLAS_AI_TIMEOUT_MS, 0),
    perMinute: positiveInt(env.ATLAS_AI_USER_PER_MINUTE, 10),
    perDay: positiveInt(env.ATLAS_AI_USER_PER_DAY, 200),
  });
}

export function aiFeatureEnabled(config, name) {
  return Boolean(config?.enabled && config.features.includes(name));
}
