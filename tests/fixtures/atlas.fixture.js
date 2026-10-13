import { test as base, expect } from "@playwright/test";
import { lifecycleConfig, uniqueAuditName } from "../helpers/config.js";
import {
  acceptNextConfirmation,
  activeAuditSnapshot,
  attachJson,
  waitForAtlasReady,
} from "../helpers/ui.js";
import { isAuditCreateResponse, responseJson } from "../helpers/api.js";

export const test = base.extend({
  atlasConfig: async ({}, use) => use(lifecycleConfig()),
  ownedAudit: async ({ page, atlasConfig }, use, testInfo) => {
    const owned = {
      id: null,
      name: uniqueAuditName(atlasConfig.prefix, testInfo.workerIndex),
      initialRevision: null,
    };
    await page.goto("/");
    await expect(page).toHaveTitle(/ATLAS Align/i);
    await waitForAtlasReady(page);
    const createButton = page.locator("#newAuditBtn");
    await expect(
      createButton,
      "The authenticated identity must be able to create Preview audits",
    ).toBeVisible();
    await expect(createButton).toBeEnabled();
    await acceptNextConfirmation(page);
    const responsePromise = page.waitForResponse(isAuditCreateResponse);
    await createButton.click();
    const payload = await responseJson(await responsePromise);
    await expect
      .poll(async () => (await activeAuditSnapshot(page))?.revisionId)
      .toBeTruthy();
    const snapshot = await activeAuditSnapshot(page);
    owned.id = payload.audit?.id || payload.id || snapshot?.id || null;
    owned.initialRevision = payload.revision || payload.currentRevision || null;
    expect(
      owned.id,
      "POST /api/audits must return or activate a new audit ID",
    ).toBeTruthy();
    await attachJson(testInfo, "owned-audit.json", {
      name: owned.name,
      auditId: owned.id,
      initialRevision: owned.initialRevision,
    });
    await use(owned);
    const failed = testInfo.status !== testInfo.expectedStatus;
    if (failed && atlasConfig.preserveFailed) return;
    if (!owned.id) return;
    const current = await activeAuditSnapshot(page);
    if (current?.id !== owned.id) return;
    const deleteButton = page.locator("#deleteAuditBtn");
    if (!(await deleteButton.isVisible()) || !(await deleteButton.isEnabled()))
      return;
    await acceptNextConfirmation(page);
    const archive = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "DELETE" &&
        url.pathname === `/api/audits/${encodeURIComponent(owned.id)}`
      );
    });
    await deleteButton.click();
    const response = await archive;
    expect(
      response.ok(),
      "Successful tests archive only their exact owned audit",
    ).toBeTruthy();
  },
});

export { expect };
