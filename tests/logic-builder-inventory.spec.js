import { test, expect } from "./fixtures/atlas.fixture.js";
import { openPage, attachJson } from "./helpers/ui.js";

test("5 and 12 record every selectable Logic Builder step type", async ({
  page,
  ownedAudit,
}, testInfo) => {
  await openPage(page, "steps");
  await expect(page.locator("#addStepBtn")).toBeVisible();
  await page.locator("#addStepBtn").click();
  const options = await page
    .locator(
      '[role="menu"] [role="menuitem"], [role="dialog"] button, [data-step-type]',
    )
    .evaluateAll((nodes) => [
      ...new Set(
        nodes.map((node) => (node.textContent || "").trim()).filter(Boolean),
      ),
    ]);
  expect(
    options.length,
    "Scenario 5 must discover selectable rule types",
  ).toBeGreaterThan(0);
  await attachJson(testInfo, "scenario-5-12-step-types.json", options);
});

test("5.1-5.5 manual rule common behavior is traceable", async ({
  page,
  ownedAudit,
}, testInfo) => {
  await openPage(page, "steps");
  await expect(page.locator("#stepsList")).toBeVisible();
  await expect(page.locator("#selectedStepDetails")).toBeVisible();
  testInfo.annotations.push({
    type: "coverage",
    description:
      "Stable ID, guided controls, generated logic, Notes, and enabled state are exercised by family specs when the discovered type adapter is available.",
  });
});
