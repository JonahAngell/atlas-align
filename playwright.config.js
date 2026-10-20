// @ts-check

import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const localEnvPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(localEnvPath)) {
  process.loadEnvFile(localEnvPath);
}

const authFile = path.resolve(
  process.cwd(),
  "playwright/.auth/studioshare.json",
);

/**
 * Two targets:
 * - "preview" (PLAYWRIGHT_BASE_URL set): the deployed StudioShare Preview,
 *   signed in through MyID by auth.setup.js.
 * - "local" (default): starts server.js with ATLAS_APP_ENV=local against the
 *   PostgreSQL database in STUDIOSHARE_DB_URL. No MyID login is needed.
 */
const target =
  process.env.PLAYWRIGHT_TARGET?.trim() ||
  (process.env.PLAYWRIGHT_BASE_URL?.trim() ? "preview" : "local");

function requirePublicPreviewUrl(value) {
  if (!value?.trim()) {
    throw new Error(
      "PLAYWRIGHT_BASE_URL is required. Set it in .env to the public StudioShare Preview URL.",
    );
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("PLAYWRIGHT_BASE_URL must be a valid absolute URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("PLAYWRIGHT_BASE_URL must use HTTPS.");
  }

  return parsed.origin;
}

function localServer() {
  const databaseUrl = process.env.STUDIOSHARE_DB_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      "Local Playwright runs need STUDIOSHARE_DB_URL pointing at a migrated, seeded database. See README-local.md.",
    );
  }
  const port = Number(process.env.PLAYWRIGHT_LOCAL_PORT || 8095);
  const workflowFlags = Object.fromEntries(
    [
      "READS",
      "HISTORY",
      "RESTORATION",
      "SUBMISSION",
      "DECISIONS",
      "PUBLICATION",
      "UNLOCK",
      "PUBLICATION_DELETION",
    ].map((flag) => [`ATLAS_WORKFLOW_${flag}_ENABLED`, "true"]),
  );
  return {
    baseURL: `http://127.0.0.1:${port}`,
    webServer: {
      command: "node server.js",
      url: `http://127.0.0.1:${port}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60 * 1000,
      stdout: "pipe",
      env: {
        ...process.env,
        PORT: String(port),
        STUDIOSHARE_DB_URL: databaseUrl,
        ATLAS_APP_ENV: "local",
        DEV_USER_ID: process.env.DEV_USER_ID || "local-user-1",
        ATLAS_USER_IMPERSONATION_ENABLED: "true",
        ...workflowFlags,
      },
    },
  };
}

const local = target === "local" ? localServer() : null;
if (local) {
  // People seeded by local-db/seed.sql; explicit environment values still win.
  process.env.PLAYWRIGHT_ASSIGNED_ANALYST_QUERY ??= "local.user";
  process.env.PLAYWRIGHT_REVIEW_APPROVER_QUERY ??= "local.reviewer";
  process.env.PLAYWRIGHT_REVIEWER_PROFILE_QUERY ??= "local.reviewer";
}
const baseURL = local
  ? local.baseURL
  : requirePublicPreviewUrl(process.env.PLAYWRIGHT_BASE_URL);
// Specs compare page origins against PLAYWRIGHT_BASE_URL. Workers re-evaluate
// this file, so pin the target as well.
process.env.PLAYWRIGHT_BASE_URL = baseURL;
process.env.PLAYWRIGHT_TARGET = target;

const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const browser = {
  ...devices["Desktop Chrome"],
  ...(chromiumExecutable
    ? { launchOptions: { executablePath: chromiumExecutable } }
    : {}),
};

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  ...(local ? { webServer: local.webServer } : {}),

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: local
    ? [
        {
          name: "chromium",
          testIgnore: /auth\.setup\.js/,
          use: browser,
        },
      ]
    : [
        {
          name: "setup",
          testMatch: /auth\.setup\.js/,
          use: {
            ...browser,
            headless: false,
          },
        },
        {
          name: "chromium",
          testIgnore: /auth\.setup\.js/,
          use: {
            ...browser,
            storageState: authFile,
          },
        },
      ],
});
