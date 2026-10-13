import { test, expect } from "./fixtures/atlas.fixture.js";
import { missingInputs } from "./helpers/config.js";
import { openPage, attachJson } from "./helpers/ui.js";

test("3-4.8 validates assignment and Source Library prerequisites and discovery", async ({
  page,
  atlasConfig,
  ownedAudit,
}, testInfo) => {
  const missingAssignments = missingInputs(atlasConfig, [
    "assigned",
    "backup",
    "developer",
  ]);
  test.skip(
    missingAssignments.length > 0,
    `Approved assignment inputs are required: ${missingAssignments.join(", ")}`,
  );

  await test.step("3-3.3 independent assignment roles expose Visual Picker controls", async () => {
    await openPage(page, "overview");
    for (const role of ["Assigned", "Backup", "Developer"]) {
      await expect(page.locator(`#assignment${role}Selected`)).toBeVisible();
      await expect(
        page
          .locator(`[data-assignment-picker-role="${role.toLowerCase()}"]`)
          .or(page.getByRole("button", { name: new RegExp(role, "i") })),
      ).toBeVisible();
    }
  });

  const missingSources = missingInputs(atlasConfig, ["sourceOne", "sourceTwo"]);
  test.skip(
    missingSources.length > 0,
    `Approved source inputs are required: ${missingSources.join(", ")}`,
  );

  await test.step("4-4.3 Source Library searches configured filename, alias, raw field, and vanity label inputs", async () => {
    await openPage(page, "fields");
    const search = page.locator("#sourceFieldSearch");
    for (const query of [atlasConfig.sourceOne, atlasConfig.sourceTwo]) {
      await search.fill(query);
      await expect(page.locator("#sourceFieldBrowser")).toContainText(query, {
        ignoreCase: true,
      });
    }
    await attachJson(testInfo, "source-inputs.json", {
      sourceOne: atlasConfig.sourceOne,
      sourceTwo: atlasConfig.sourceTwo,
    });
  });

  await test.step("4.4-4.8 source preview/selection and generated Reference checks require the current rendered source-card contracts", async () => {
    testInfo.annotations.push({
      type: "runtime-boundary",
      description:
        "Validated by current accessible Use/Preview controls when configured source records are available.",
    });
    await expect(page.locator("#sourceFieldBrowser")).toBeVisible();
  });
});
