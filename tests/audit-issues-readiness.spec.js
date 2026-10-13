import { test, expect } from "./fixtures/atlas.fixture.js";
import { openPage } from "./helpers/ui.js";

test("17-17.6 validates canonical Audit Issues and Readiness surfaces", async ({
  page,
  ownedAudit,
}, testInfo) => {
  await expect(page.locator("#atlas-audit-issues-root")).toBeAttached();
  await expect(page.locator("#atlas-audit-issues-count")).toBeAttached();
  await openPage(page, "review");

  await expect(page.locator("#page-review")).toHaveClass(/\bactive\b/);
  await expect(page.locator("#atlas-readiness-issue-summary")).toBeVisible();
  await expect(page.locator("#validationPanel")).toBeVisible();

  testInfo.annotations.push({
    type: "coverage",
    description:
      "Specific bounded fixes require approved assignment and source inputs and are exercised by configured lifecycle runs.",
  });
});
