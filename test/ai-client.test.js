import test from "node:test";
import assert from "node:assert/strict";
import { createAiClient } from "../src/ai/client.js";
import { aiConfig, aiFeatureEnabled } from "../src/ai/config.js";
import { completeJson, parseJsonObject } from "../src/ai/json.js";
import { createLruCache } from "../src/ai/cache.js";

const GATEWAY = "https://gateway.example.test";

function reply(
  content,
  { status = 200, model = "anthropic/model-a", headers = {} } = {},
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => ({ model, choices: [{ message: { content } }] }),
  };
}

/** A fake fetch that answers from a queue and records every call. */
function fakeFetch(queue) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const next = queue.shift();
    if (!next) throw new Error("no more replies");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(url, init) : next;
  };
  return { fetch, calls };
}

const baseEnv = (extra = {}) => ({
  STUDIOSHARE_AI_GATEWAY_URL: `${GATEWAY}/`,
  STUDIOSHARE_OIDC_TOKEN: "oidc-token",
  ...extra,
});

const messages = [{ role: "user", content: "hi" }];

test("config is off unless the flag is the literal true", () => {
  assert.equal(aiConfig({ ATLAS_AI_ENABLED: "yes" }).enabled, false);
  assert.deepEqual(aiConfig({ ATLAS_AI_ENABLED: "yes" }).features, []);
  const on = aiConfig({
    ATLAS_AI_ENABLED: "true",
    ATLAS_AI_FEATURES: "code-import, bogus",
  });
  assert.deepEqual(on.features, ["code-import"]);
  assert.equal(aiFeatureEnabled(on, "code-import"), true);
  assert.equal(aiFeatureEnabled(on, "chat-explain"), false);
  assert.ok(aiConfig({ ATLAS_AI_ENABLED: "TRUE" }).features.length > 3);
});

test("code models fall back to the chat models, then the default", () => {
  assert.deepEqual(aiConfig({ STUDIOSHARE_AI_MODELS: "a,b" }).codeModels, [
    "a",
    "b",
  ]);
  assert.deepEqual(aiConfig({ STUDIOSHARE_AI_CODE_MODELS: "c" }).codeModels, [
    "c",
  ]);
  assert.equal(aiConfig({}).codeModels.length, 1);
});

test("no gateway URL or token source means unavailable with no network call", async () => {
  for (const env of [
    { STUDIOSHARE_OIDC_TOKEN: "t" },
    { STUDIOSHARE_AI_GATEWAY_URL: GATEWAY },
  ]) {
    const { fetch, calls } = fakeFetch([]);
    const client = createAiClient({ fetch, env });
    const result = await client.complete({ messages });
    assert.equal(result.status, "unavailable");
    assert.equal(calls.length, 0);
  }
});

test("the personal access token is refused outside local", async () => {
  const env = {
    STUDIOSHARE_AI_GATEWAY_URL: GATEWAY,
    STUDIOSHARE_AI_API_KEY: "pat",
  };
  assert.equal(createAiClient({ env }).tokenSource(), null);
  assert.equal(
    createAiClient({ env: { ...env, ATLAS_APP_ENV: "local" } }).tokenSource(),
    "api_key",
  );
});

test("a reply carries the served model, and the bearer token goes only to the gateway", async () => {
  const { fetch, calls } = fakeFetch([
    reply('{"a":1}', { model: "anthropic/served" }),
  ]);
  const client = createAiClient({ fetch, env: baseEnv() });
  const result = await client.complete({ messages, maxTokens: 50 });
  assert.equal(result.status, "ok");
  assert.equal(result.model, "anthropic/served");
  assert.equal(calls[0].url, `${GATEWAY}/v1/chat/completions`);
  assert.equal(calls[0].init.headers.Authorization, "Bearer oidc-token");
  assert.equal(calls[0].body.temperature, 0);
  assert.equal(calls[0].body.max_tokens, 50);
});

test("OIDC tokens are minted, cached, and refreshed 15 minutes before expiry", async () => {
  let clock = Date.parse("2026-11-20T10:00:00Z");
  const mint = (token) => ({
    ok: true,
    status: 200,
    json: async () => ({
      token,
      expiresAt: new Date(clock + 60 * 60 * 1000).toISOString(),
    }),
  });
  const { fetch, calls } = fakeFetch([
    mint("t1"),
    reply("{}"),
    reply("{}"),
    mint("t2"),
    reply("{}"),
  ]);
  const client = createAiClient({
    fetch,
    now: () => clock,
    env: {
      STUDIOSHARE_AI_GATEWAY_URL: GATEWAY,
      STUDIOSHARE_OIDC_URL: "http://sidecar/mint",
    },
  });
  await client.complete({ messages });
  clock += 30 * 60 * 1000;
  await client.complete({ messages });
  clock += 20 * 60 * 1000; // 50 minutes in: inside the refresh margin
  await client.complete({ messages });
  const bearers = calls
    .filter((c) => c.url.endsWith("/completions"))
    .map((c) => c.init.headers.Authorization);
  assert.deepEqual(bearers, ["Bearer t1", "Bearer t1", "Bearer t2"]);
  assert.equal(calls.filter((c) => c.url === "http://sidecar/mint").length, 2);
});

test("a failed mint means unavailable", async () => {
  const { fetch } = fakeFetch([
    { ok: false, status: 500, json: async () => ({}) },
  ]);
  const client = createAiClient({
    fetch,
    env: {
      STUDIOSHARE_AI_GATEWAY_URL: GATEWAY,
      STUDIOSHARE_OIDC_URL: "http://sidecar/mint",
    },
  });
  assert.equal((await client.complete({ messages })).status, "unavailable");
});

test("429 waits for Retry-After, capped at 5 s, and retries once", async () => {
  const waits = [];
  const { fetch, calls } = fakeFetch([
    reply("", { status: 429, headers: { "retry-after": "30" } }),
    reply('{"ok":true}'),
  ]);
  const client = createAiClient({
    fetch,
    env: baseEnv(),
    sleep: async (ms) => waits.push(ms),
  });
  const result = await client.complete({ messages });
  assert.equal(result.status, "ok");
  assert.deepEqual(waits, [5000]);
  assert.equal(calls.length, 2);
});

test("401 stops trying further models", async () => {
  const { fetch, calls } = fakeFetch([reply("", { status: 401 })]);
  const client = createAiClient({
    fetch,
    env: baseEnv({ STUDIOSHARE_AI_MODELS: "a,b" }),
  });
  assert.equal((await client.complete({ messages })).status, "unavailable");
  assert.equal(calls.length, 1);
});

test("a later unavailable never hides an earlier invalid", async () => {
  const { fetch } = fakeFetch([
    reply("", { status: 422 }),
    new Error("timeout"),
  ]);
  const client = createAiClient({
    fetch,
    env: baseEnv({ STUDIOSHARE_AI_MODELS: "a,b" }),
  });
  assert.equal((await client.complete({ messages })).status, "invalid");
});

test("errors and guard models move on to the next model", async () => {
  const { fetch, calls } = fakeFetch([
    reply("", { status: 503 }),
    reply("{}", { model: "meta/llama-guard" }),
    reply('{"x":1}', { model: "c" }),
  ]);
  const client = createAiClient({
    fetch,
    env: baseEnv({ STUDIOSHARE_AI_MODELS: "a,b,c" }),
  });
  const result = await client.complete({ messages });
  assert.equal(result.model, "c");
  assert.deepEqual(
    calls.map((c) => c.body.model),
    ["a", "b", "c"],
  );
});

test("listModels reads /v1/models and caches it", async () => {
  const { fetch, calls } = fakeFetch([
    {
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: "x" }, { id: "y" }] }),
    },
  ]);
  const client = createAiClient({ fetch, env: baseEnv() });
  assert.deepEqual(await client.listModels(), ["x", "y"]);
  assert.deepEqual(await client.listModels(), ["x", "y"]);
  assert.equal(calls.length, 1);
});

test("parseJsonObject strips fences and prose and rejects arrays", () => {
  assert.deepEqual(parseJsonObject('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonObject('Here you go: {"a":{"b":2}} thanks'), {
    a: { b: 2 },
  });
  assert.equal(parseJsonObject("[1,2]"), null);
  assert.equal(parseJsonObject("no json"), null);
});

test("completeJson repairs once, then reports invalid", async () => {
  const good = { complete: async () => ({ status: "ok", text: '{"a":1}' }) };
  assert.deepEqual((await completeJson(good, { messages })).value, { a: 1 });

  let count = 0;
  const repairs = {
    complete: async (request) => {
      count += 1;
      return {
        status: "ok",
        text: count === 1 ? "oops" : '{"b":2}',
        messages: request.messages,
      };
    },
  };
  const repaired = await completeJson(repairs, { messages });
  assert.deepEqual(repaired.value, { b: 2 });
  assert.equal(repaired.repaired, true);

  const bad = { complete: async () => ({ status: "ok", text: "still prose" }) };
  assert.equal((await completeJson(bad, { messages })).status, "invalid");

  const chat = await completeJson(bad, { messages }, { textFallback: true });
  assert.deepEqual(chat.value, { reply: "still prose", proposals: [] });
});

test("the LRU evicts the oldest entry and expires by TTL", () => {
  let clock = 0;
  const cache = createLruCache({ max: 2, ttlMs: 100, now: () => clock });
  cache.set("a", 1);
  cache.set("b", 2);
  cache.get("a");
  cache.set("c", 3);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 1);
  clock = 150;
  assert.equal(cache.get("a"), undefined);
});
