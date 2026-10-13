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

const baseURL = requirePublicPreviewUrl(process.env.PLAYWRIGHT_BASE_URL);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }]],

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.js/,
      use: {
        ...devices["Desktop Chrome"],
        headless: false,
      },
    },
    {
      name: "chromium",
      testIgnore: /auth\.setup\.js/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile,
      },
    },
  ],
});
