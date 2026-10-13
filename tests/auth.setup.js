// @ts-check

import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

const authFile = path.resolve(
  process.cwd(),
  "playwright/.auth/studioshare.json",
);

test("authenticate with StudioShare Preview", async ({ page }) => {
  test.setTimeout(5 * 60 * 1000);

  const baseURL = new URL(process.env.PLAYWRIGHT_BASE_URL);
  await page.goto("/");

  if (new URL(page.url()).origin !== baseURL.origin) {
    console.log(
      "Complete the StudioShare MyID sign-in, return to ATLAS Align, then click Resume in the Playwright Inspector.",
    );
    await page.pause();
  }

  await expect
    .poll(() => new URL(page.url()).origin, {
      message:
        "Expected MyID to redirect back to the StudioShare Preview application.",
    })
    .toBe(baseURL.origin);

  await expect(page).toHaveTitle(/ATLAS Align/i);

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
