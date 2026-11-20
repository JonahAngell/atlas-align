import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createAiRouter } from "../src/routes/ai-routes.js";
import { aiRateLimits } from "../src/http-security.js";

const signedIn = (req, _res, next) => {
  req.studioshareUser = { id: "u1" };
  next();
};
const signedOut = (_req, res) =>
  res.status(401).json({ error: "Authentication is required." });

async function withApp(options, run) {
  const app = express();
  const logs = [];
  app.use(
    createAiRouter({
      requireCurrentUser: signedIn,
      log: (entry) => logs.push(entry),
      ...options,
    }),
  );
  app.post("/api/ai/echo", (_req, res) => res.json({ status: "ok" }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base, logs);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const client = (listed, configured = true) => ({
  configured: () => configured,
  listModels: async () => listed,
});

const ENABLED = {
  ATLAS_AI_ENABLED: "true",
  STUDIOSHARE_AI_GATEWAY_URL: "https://secret-gateway.example.test",
  STUDIOSHARE_OIDC_TOKEN: "super-secret-token",
  STUDIOSHARE_AI_MODELS: "anthropic/model-a",
};

test("status needs a signed-in user", async () => {
  await withApp(
    { requireCurrentUser: signedOut, aiClient: client([]), env: ENABLED },
    async (base) => {
      assert.equal((await fetch(`${base}/api/ai/status`)).status, 401);
    },
  );
});

test("status is disabled unless the flag is the literal true", async () => {
  let listed = 0;
  const aiClient = {
    configured: () => true,
    listModels: async () => {
      listed += 1;
      return [];
    },
  };
  await withApp(
    { aiClient, env: { ...ENABLED, ATLAS_AI_ENABLED: "1" } },
    async (base) => {
      const body = await (await fetch(`${base}/api/ai/status`)).json();
      assert.equal(body.enabled, false);
      assert.deepEqual(body.features, []);
      assert.equal(listed, 0);
    },
  );
});

test("status lists the configured models and never exposes secrets", async () => {
  await withApp(
    { aiClient: client(["anthropic/model-a"]), env: ENABLED },
    async (base, logs) => {
      const response = await fetch(`${base}/api/ai/status`);
      const text = await response.text();
      const body = JSON.parse(text);
      assert.equal(body.enabled, true);
      assert.ok(body.features.includes("code-import"));
      assert.deepEqual(body.providers[0].models, [
        { id: "anthropic/model-a", available: true },
      ]);
      assert.equal(response.headers.get("cache-control"), "no-store");
      for (const secret of ["secret-gateway", "super-secret-token"]) {
        assert.ok(!text.includes(secret));
        assert.ok(!JSON.stringify(logs).includes(secret));
      }
    },
  );
});

test("a missing model turns AI off with a reason", async () => {
  await withApp(
    { aiClient: client(["other/model"]), env: ENABLED },
    async (base) => {
      const body = await (await fetch(`${base}/api/ai/status`)).json();
      assert.equal(body.enabled, false);
      assert.match(body.detail, /Use permission/);
      assert.equal(body.providers[0].models[0].available, false);
    },
  );
});

test("an unconfigured gateway turns AI off", async () => {
  await withApp(
    { aiClient: client(null, false), env: ENABLED },
    async (base) => {
      const body = await (await fetch(`${base}/api/ai/status`)).json();
      assert.equal(body.enabled, false);
      assert.equal(body.providers[0].configured, false);
    },
  );
});

test("the AI limiter answers with the envelope and skips status", async () => {
  await withApp(
    {
      aiClient: client(["anthropic/model-a"]),
      env: ENABLED,
      aiLimits: aiRateLimits({ perMinute: 2, perDay: 100 }),
    },
    async (base) => {
      const post = () => fetch(`${base}/api/ai/echo`, { method: "POST" });
      assert.equal((await post()).status, 200);
      assert.equal((await post()).status, 200);
      const limited = await post();
      assert.equal(limited.status, 429);
      const body = await limited.json();
      assert.equal(body.status, "rate_limited");
      assert.match(body.detail, /Wait a minute/);
      assert.equal((await fetch(`${base}/api/ai/status`)).status, 200);
    },
  );
});
