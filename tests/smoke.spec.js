// @ts-check

import { test, expect } from "@playwright/test";
import { waitForAtlasReady } from "./helpers/ui.js";

test("loads the authenticated ATLAS Align application shell", async ({
  page,
}) => {
  const baseURL = new URL(process.env.PLAYWRIGHT_BASE_URL);
  const response = await page.goto("/");

  expect(response).not.toBeNull();
  expect(response?.ok()).toBe(true);
  expect(new URL(page.url()).origin).toBe(baseURL.origin);
  await expect(page).toHaveTitle(/ATLAS Align/i);
  await waitForAtlasReady(page);
  await expect(page.locator("body")).toHaveClass(/audit-not-selected/);
  await expect(page.locator("#activeAuditSelect")).toHaveValue("");
});
