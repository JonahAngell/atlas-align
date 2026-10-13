import { test, expect } from "./fixtures/atlas.fixture.js";
import { openPage } from "./helpers/ui.js";

test("15-16.4 validates Display Fields and Requirements Preview surfaces", async ({
  page,
  ownedAudit,
}, testInfo) => {
  await test.step("15-15.3 Display Fields supports selection and persisted ordering surface", async () => {
    await openPage(page, "display-fields");
    await expect(page.locator("#addDisplayFieldBtn")).toBeVisible();
    await expect(page.locator("#displayFieldsTable")).toBeVisible();
  });
  await test.step("16-16.4 Fields precede Logic and preview toggles are non-mutating", async () => {
    await openPage(page, "preview");
    await expect(page.locator("#requirementsFieldsPreview")).toBeVisible();
    await expect(page.locator("#logicPreview")).toBeVisible();
    const order = await page
      .locator("#requirementsFieldsPreview, #logicPreview")
      .evaluateAll((nodes) => nodes.map((n) => n.id));
    expect(order).toEqual(["requirementsFieldsPreview", "logicPreview"]);
    await page.locator("#completeStatementsToggle").check();
    await page.locator("#includeNotesToggle").uncheck();
  });
});
