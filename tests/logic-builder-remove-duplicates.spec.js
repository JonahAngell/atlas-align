import { test, expect } from "./fixtures/atlas.fixture.js";
import { openPage, attachJson } from "./helpers/ui.js";

const sentence =
  /Remove duplicate records with matching values in .+, keeping /;

async function addRemoveDuplicatesStep(page) {
  await openPage(page, "steps");
  await page.locator("#addStepBtn").click();
  const choice = page
    .locator('[data-new-rule-type="remove_duplicates"]')
    .first();
  test.skip(
    !(await choice.isVisible()),
    "Remove Duplicates is not exposed by the deployed UI",
  );
  await choice.click();
  const editor = page.locator("#selectedStepDetails [data-duplicate-editor]");
  await expect(editor).toBeVisible();
  return editor;
}

async function addColumns(page, editor, count) {
  await editor.locator("[data-add-duplicate-field]").click();
  const options = page.locator(
    "button.atlas-visual-picker-option[data-atlas-picker-key]",
  );
  test.skip(
    (await options.count()) < count,
    `Audit sources expose fewer than ${count} columns`,
  );
  const keys = [];
  for (let index = 0; index < count; index += 1) {
    const option = options.nth(index);
    keys.push(await option.getAttribute("data-atlas-picker-key"));
    await option.click();
    await expect(option).toHaveAttribute("aria-selected", "true");
  }
  await page
    .getByRole("button", { name: new RegExp(`Add ${count} columns?`, "i") })
    .click();
  return keys;
}

async function chooseKeep(page, label) {
  await page
    .locator("#selectedStepDetails")
    .getByRole("button", { name: /Records to Keep/i })
    .click();
  await page
    .getByRole("radiogroup", { name: "Records to keep" })
    .getByRole("radio", { name: new RegExp(label, "i") })
    .click();
}

test("remove duplicates shows the empty state before any column is added", async ({
  page,
  ownedAudit,
}) => {
  const editor = await addRemoveDuplicatesStep(page);
  await expect(editor).toContainText("No columns selected yet");
  await expect(editor.locator("[data-duplicate-field]")).toHaveCount(0);
  await expect(editor.locator("[data-duplicate-json]")).toHaveValue("[]");
});

test("remove duplicates matches multiple columns and switches records to keep", async ({
  page,
  ownedAudit,
}, testInfo) => {
  const editor = await addRemoveDuplicatesStep(page);
  const keys = await addColumns(page, editor, 2);
  await expect(editor.locator("[data-duplicate-field]")).toHaveCount(2);

  const stored = JSON.parse(
    await editor.locator("[data-duplicate-json]").inputValue(),
  );
  expect(stored.map((item) => item.fieldName)).toEqual(
    keys.map((key) => key.split("::").pop()),
  );

  const details = page.locator("#selectedStepDetails");
  await expect(details).toContainText(sentence);
  await expect(details).toContainText(
    / and column ".+"|, file ".+" column ".+"|" and file "/,
  );
  await expect(details).toContainText("keeping the first record.");

  await chooseKeep(page, "Keep none");
  await expect(details).toContainText(
    "keeping none of the duplicated records.",
  );
  await chooseKeep(page, "Keep last");
  await expect(details).toContainText("keeping the last record.");

  await attachJson(testInfo, "remove-duplicates-fields.json", stored);
});

test("removing a duplicate column updates the list and sentence", async ({
  page,
  ownedAudit,
}) => {
  const editor = await addRemoveDuplicatesStep(page);
  const keys = await addColumns(page, editor, 2);
  const [firstField, secondField] = keys.map((key) => key.split("::").pop());

  await editor.locator("[data-remove-duplicate-field]").first().click();
  await expect(editor.locator("[data-duplicate-field]")).toHaveCount(1);
  await expect(editor).toContainText(secondField);

  const stored = JSON.parse(
    await editor.locator("[data-duplicate-json]").inputValue(),
  );
  expect(stored.map((item) => item.fieldName)).toEqual([secondField]);
  if (firstField !== secondField) {
    await expect(page.locator("#selectedStepDetails")).not.toContainText(
      `column "${firstField}"`,
    );
  }
  await expect(
    editor.locator("[data-remove-duplicate-field]").first(),
  ).toBeFocused();
});

test("legacy single-column duplicate steps migrate to the column list", async ({
  page,
  ownedAudit,
}) => {
  await openPage(page, "steps");
  const migrated = await page.evaluate(() => {
    if (typeof window.atlasSyncDuplicateFieldParams !== "function") return null;
    const params = {
      source_file: "legacy.csv",
      source_alias: "Legacy",
      field_name: "Employee ID",
      duplicate_action: "Keep last record",
    };
    window.atlasSyncDuplicateFieldParams(params);
    return params;
  });
  test.skip(!migrated, "Duplicate migration helper is not exposed");
  expect(JSON.parse(migrated.duplicate_fields_json)).toEqual([
    {
      sourceFile: "legacy.csv",
      sourceAlias: "Legacy",
      fieldName: "Employee ID",
    },
  ]);
  expect(migrated.field_name).toBe("Employee ID");
});
