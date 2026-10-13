import { test as base, expect } from "@playwright/test";

import {
  assertReviewerOverrides,
  closeReview,
  openConfiguredReview,
  provisionAutomaticReview,
  restoreOriginalProfile,
  reviewerProvisioningConfig,
} from "../helpers/reviewer.js";

export const test = base.extend({
  reviewerConfig: async ({}, use) => {
    const config = reviewerProvisioningConfig();
    assertReviewerOverrides(config);
    await use(config);
  },

  reviewSession: async ({ page, reviewerConfig }, use, testInfo) => {
    let opened;
    try {
      opened =
        reviewerConfig.mode === "configured"
          ? await openConfiguredReview(page, reviewerConfig)
          : await provisionAutomaticReview(page, reviewerConfig, testInfo);

      expect(
        opened.fixture?.auditId ??
          opened.context?.auditId ??
          reviewerConfig.editableAuditId,
        "Reviewer fixture must establish an exact audit ID",
      ).toBeTruthy();

      await use(opened);
    } finally {
      await closeReview(page).catch(() => {});
      await restoreOriginalProfile(page).catch(async (error) => {
        await testInfo.attach("identity-restoration-error.txt", {
          body: Buffer.from(String(error?.message || error)),
          contentType: "text/plain",
        });
      });
    }
  },
});

export { expect };
