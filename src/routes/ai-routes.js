import express from "express";
import { aiConfig } from "../ai/config.js";

export const AI_PROMPT_VERSION = "atlas-ai-1";

/**
 * /api/ai/*. Phase 0 serves only GET /api/ai/status. Every route needs a
 * signed-in user. Nothing here returns URLs, tokens or keys.
 */
export function createAiRouter({
  requireCurrentUser,
  aiClient,
  aiLimits,
  env = process.env,
  log = (entry) => console.log(JSON.stringify(entry)),
}) {
  const router = express.Router();
  if (aiLimits) router.use("/api/ai", aiLimits.minute, aiLimits.day);

  router.get("/api/ai/status", requireCurrentUser, async (_req, res) => {
    res.set("Cache-Control", "no-store");
    const config = aiConfig(env);
    if (!config.enabled)
      return res.json({
        enabled: false,
        features: [],
        providers: [],
        promptVersion: AI_PROMPT_VERSION,
      });
    const configured = aiClient.configured();
    const listed = configured ? await aiClient.listModels() : null;
    const wanted = [...new Set([...config.models, ...config.codeModels])];
    const models = wanted.map((id) => ({
      id,
      // null when the gateway's list couldn't be read
      available: listed ? listed.includes(id) : null,
    }));
    const usable = configured && models.some((m) => m.available !== false);
    log({
      message: "ai status",
      status: usable ? "info" : "warning",
      configured,
      modelsListed: Array.isArray(listed),
      missingModels: models.filter((m) => m.available === false).length,
    });
    res.json({
      enabled: usable,
      features: usable ? config.features : [],
      providers: [{ name: "gateway", configured, models }],
      promptVersion: AI_PROMPT_VERSION,
      ...(usable
        ? {}
        : {
            detail: configured
              ? "The AI service doesn't list any of the configured models. An owner needs to grant ATLAS Use permission on the model's provider in the AI console."
              : "AI is turned on, but the AI service isn't configured for this environment.",
          }),
    });
  });
  return router;
}
