import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import express from "express";
import {
  apiRateLimits,
  rateLimitKey,
  securityHeaders,
  useJsonBodyParsers,
} from "../src/http-security.js";

async function withServer(configure, run) {
  const app = express();
  configure(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("security headers set a same-origin script policy and deny framing", async () => {
  await withServer(
    (app) => {
      app.use(securityHeaders());
      app.get("/", (_req, res) => res.send("ok"));
    },
    async (base) => {
      const response = await fetch(base);
      const csp = response.headers.get("content-security-policy");
      assert.match(csp, /script-src 'self'(;|$)/);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(csp, /object-src 'none'/);
      assert.match(csp, /upgrade-insecure-requests/);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.ok(response.headers.get("strict-transport-security"));
    },
  );
});

test("local security headers skip HTTPS-only directives", async () => {
  await withServer(
    (app) => {
      app.use(securityHeaders({ local: true }));
      app.get("/", (_req, res) => res.send("ok"));
    },
    async (base) => {
      const response = await fetch(base);
      const csp = response.headers.get("content-security-policy");
      assert.doesNotMatch(csp, /upgrade-insecure-requests/);
      assert.equal(response.headers.get("strict-transport-security"), null);
    },
  );
});

test("write limiter returns 429 per token and leaves reads and other users alone", async () => {
  const limits = apiRateLimits({ readLimit: 100, writeLimit: 2 });
  await withServer(
    (app) => {
      app.use("/api", limits.api, limits.writes);
      app.all("/api/thing", (_req, res) => res.json({ ok: true }));
    },
    async (base) => {
      const as = (token, method = "POST") =>
        fetch(`${base}/api/thing`, {
          method,
          headers: { authorization: `Bearer ${token}` },
        });
      assert.equal((await as("a")).status, 200);
      assert.equal((await as("a")).status, 200);
      const limited = await as("a");
      assert.equal(limited.status, 429);
      assert.match((await limited.json()).error, /Wait a minute/);
      assert.equal((await as("a", "GET")).status, 200);
      assert.equal((await as("b")).status, 200);
    },
  );
});

test("health checks are never rate limited", async () => {
  const limits = apiRateLimits({ readLimit: 1 });
  await withServer(
    (app) => {
      app.use("/api", limits.api);
      app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
    },
    async (base) => {
      for (let i = 0; i < 3; i += 1) {
        assert.equal((await fetch(`${base}/api/health`)).status, 200);
      }
    },
  );
});

test("rate limit keys hash tokens and fall back to the client address", () => {
  const bearer = rateLimitKey({ headers: { authorization: "Bearer secret" } });
  const cookie = rateLimitKey({
    headers: { cookie: "theme=dark; access_token=secret" },
  });
  assert.equal(bearer, cookie);
  assert.match(bearer, /^t:[0-9a-f]{32}$/);
  assert.ok(!bearer.includes("secret"));
  assert.match(rateLimitKey({ headers: {}, ip: "10.0.0.1" }), /^ip:/);
});

test("only document routes accept large JSON bodies", async () => {
  const big = JSON.stringify({ text: "x".repeat(2 * 1024 * 1024) });
  await withServer(
    (app) => {
      useJsonBodyParsers(app);
      app.post("/api/audits", (req, res) =>
        res.json({ size: req.body.text.length }),
      );
      app.post("/api/inbox/:id/read", (_req, res) => res.json({ ok: true }));
      app.use((error, _req, res, _next) => res.status(error.status).end());
    },
    async (base) => {
      const post = (path) =>
        fetch(`${base}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: big,
        });
      assert.equal((await post("/api/audits")).status, 200);
      assert.equal((await post("/api/inbox/1/read")).status, 413);
    },
  );
});

test("server wires security middleware before routers and maps client errors", () => {
  const source = readFileSync(new URL("../server.js", import.meta.url), "utf8");
  const headers = source.indexOf("app.use(securityHeaders(");
  const limits = source.indexOf('app.use("/api", rateLimits.api');
  const parsers = source.indexOf("useJsonBodyParsers(app)");
  const routers = source.indexOf("app.use(createIdentityRouter(");
  assert.ok(headers > 0 && headers < limits && limits < parsers);
  assert.ok(parsers < routers);
  assert.doesNotMatch(source, /express\.json\(\{ limit: "12mb" \}\)/);
  assert.match(source, /entity\.too\.large/);
  assert.match(source, /status >= 400 && status < 500/);
});
