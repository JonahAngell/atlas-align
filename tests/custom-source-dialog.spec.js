import ExcelJS from "exceljs";
import { test, expect } from "@playwright/test";
import { openPage, waitForAtlasReady } from "./helpers/ui.js";

async function workbookBuffer() {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Notes").addRow(["Ignore me"]);
  const sheet = workbook.addWorksheet("Fields");
  sheet.addRow(["Header A", "Header B"]);
  sheet.addRow([]);
  sheet.addRow(["Pay? $Rate!", null, "*Bonus_v2", "  ", "Pay? $Rate!"]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function openDialog(page) {
  await page.goto("/");
  await waitForAtlasReady(page);
  await openPage(page, "fields");
  await page.locator("#addCustomSourceBtn").click();
  const dialog = page.getByRole("dialog", { name: "Add Custom Source" });
  await expect(dialog).toBeVisible();
  return dialog;
}

const displayInputs = (dialog) => dialog.locator("[data-field-display]");

test("custom source dialog adds fields in bulk, imports a row, and saves symbols", async ({
  page,
}) => {
  const dialog = await openDialog(page);
  const count = dialog.locator("#customSourceFieldCount");
  await expect(displayInputs(dialog)).toHaveCount(1);

  await test.step("Add Several reuses the blank row and can be undone", async () => {
    await dialog.locator("#customSourceBulkToggle").click();
    await dialog
      .locator("#customSourceBulkNames")
      .fill("Employee ID\n\nHire Date\nStatus?");
    const add = dialog.locator("#customSourceBulkAddBtn");
    await expect(add).toHaveText(/Add 3 Fields/);
    await add.click();
    await expect(displayInputs(dialog)).toHaveCount(3);
    await expect(displayInputs(dialog).first()).toHaveValue("Employee ID");
    await expect(count).toHaveText("3 fields");

    await dialog.locator("[data-custom-source-undo]").click();
    await expect(displayInputs(dialog)).toHaveCount(1);
    await expect(displayInputs(dialog).first()).toHaveValue("");
  });

  await test.step("Import from Excel previews the chosen row's cells", async () => {
    await dialog.locator("#customSourceImportToggle").click();
    await dialog.locator("#customSourceImportFile").setInputFiles({
      name: "fields.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: await workbookBuffer(),
    });
    await dialog.locator("#customSourceImportSheet").selectOption("Fields");

    await dialog.locator("#customSourceImportRow").fill("2");
    await expect(dialog.locator("#customSourceImportPreview")).toContainText(
      "Row 2 has no values",
    );
    await expect(dialog.locator("#customSourceImportAddBtn")).toBeDisabled();

    await dialog.locator("#customSourceImportRow").fill("3");
    const chips = dialog.locator("#customSourceImportPreview li");
    await expect(chips).toHaveText(["Pay? $Rate!", "*Bonus_v2"]);
    await dialog.locator("#customSourceImportAddBtn").click();
    await expect(displayInputs(dialog)).toHaveCount(2);
    await expect(displayInputs(dialog).nth(1)).toHaveValue("*Bonus_v2");
  });

  await test.step("Format grid supports arrow keys and Enter", async () => {
    const trigger = dialog.locator("[data-choice-popover-trigger]").nth(1);
    await trigger.click();
    const grid = page.locator(".atlas-choice-popover-grid:not([hidden])");
    await expect(grid).toBeVisible();
    await expect(grid.getByRole("radio", { name: /Text/ })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(grid).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toContainText("Number");
    await expect(
      dialog
        .locator("[data-custom-field]")
        .nth(1)
        .locator("[data-field-format]"),
    ).toHaveValue("Number");
  });

  await test.step("Save sends the special-character display names unchanged", async () => {
    let posted = null;
    await page.route("**/api/source-library/custom", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      posted = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ origin: "custom", sourceKey: "custom.e2e" }),
      });
    });
    await dialog.locator("#customSourceName").fill("E2E Custom Source");
    await dialog.locator("#customSourceSaveBtn").click();
    await expect.poll(() => posted).not.toBeNull();
    expect(posted.fields.map((field) => field.vanityLabel)).toEqual([
      "Pay? $Rate!",
      "*Bonus_v2",
    ]);
    expect(posted.fields[1].fieldFormat).toBe("Number");
  });
});
