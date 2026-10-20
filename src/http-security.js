import { createHash } from "node:crypto";
import express from "express";
import helmet from "helmet";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

export const DEFAULT_JSON_LIMIT = "1mb";
export const LARGE_JSON_LIMIT = "12mb";

/** Routes whose bodies carry whole audit or review documents. */
export const LARGE_JSON_ROUTES = Object.freeze([
  ["post", "/api/audits"],
  ["post", "/api/audits/import"],
  ["put", "/api/audits/:auditId"],
  ["put", "/api/review-sessions/:sessionId/draft"],
  ["post", "/api/source-library/custom"],
]);

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const UPLOAD_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Security headers. Every script and stylesheet is same-origin; style
 * attributes are rendered by the client templates, so inline styles stay
 * allowed while inline scripts do not. Avatars are https or same-origin.
 */
export function securityHeaders({ local = false } = {}) {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(local ? {} : { upgradeInsecureRequests: [] }),
      },
    },
    strictTransportSecurity: local ? false : undefined,
    xFrameOptions: { action: "deny" },
  });
}

/**
 * Clients sit behind the StudioShare ingress, so the socket address is shared
 * by every user. Key on the caller's token instead, hashed so raw tokens never
 * sit in the limiter store, and fall back to the address.
 */
export function rateLimitKey(req) {
  const authorization = String(req.headers.authorization || "");
  const cookieToken = String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("access_token="));
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : cookieToken?.slice("access_token=".length);
  if (token) {
    return `t:${createHash("sha256").update(token).digest("hex").slice(0, 32)}`;
  }
  return `ip:${ipKeyGenerator(req.ip || "")}`;
}

function limiter({ windowMs, limit, message, skip }) {
  return rateLimit({
    windowMs,
    limit,
    skip,
    keyGenerator: rateLimitKey,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    handler: (_req, res) => res.status(429).json({ error: message }),
  });
}

const isReadRequest = (req) => ["GET", "HEAD", "OPTIONS"].includes(req.method);

export function apiRateLimits({
  readLimit = 600,
  writeLimit = 120,
  uploadLimit = 10,
} = {}) {
  return {
    api: limiter({
      windowMs: RATE_LIMIT_WINDOW_MS,
      limit: readLimit,
      skip: (req) => req.path === "/health",
      message: "Too many requests. Wait a minute, then try again.",
    }),
    writes: limiter({
      windowMs: RATE_LIMIT_WINDOW_MS,
      limit: writeLimit,
      skip: isReadRequest,
      message:
        "Too many changes in a short time. Wait a minute, then try again.",
    }),
    uploads: limiter({
      windowMs: UPLOAD_LIMIT_WINDOW_MS,
      limit: uploadLimit,
      skip: isReadRequest,
      message: "Too many uploads. Wait 15 minutes, then try again.",
    }),
  };
}

/** Registers the large document parser on its routes, then the default parser. */
export function useJsonBodyParsers(app) {
  const largeJson = express.json({ limit: LARGE_JSON_LIMIT });
  for (const [method, route] of LARGE_JSON_ROUTES)
    app[method](route, largeJson);
  app.use(express.json({ limit: DEFAULT_JSON_LIMIT }));
}
