import { test, expect } from "./fixtures/atlas.fixture.js";
import { openPage, attachJson } from "./helpers/ui.js";

const groups = [
  ["6-6.12", "Create Column"],
  ["7-7.16", "IF / THEN"],
  ["8-8.4", "ELSE"],
  ["9-9.10", "Join / Union Sources"],
  ["10-10.3", "Format Field"],
  ["11-11.2", "Sort Records"],
];

for (const [scenario, label] of groups) {
  test(`${scenario} discovers and records ${label} runtime controls`, async ({
    page,
    ownedAudit,
  }, testInfo) => {
    await openPage(page, "steps");
    await page.locator("#addStepBtn").click();
    const choice = page
      .getByRole("button", {
        name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      })
      .first();
    test.skip(
      !(await choice.isVisible()),
      `${label} is not exposed by the deployed UI`,
    );
    await choice.click();
    const controls = await page
      .locator(
        "#selectedStepDetails input, #selectedStepDetails textarea, #selectedStepDetails select, #selectedStepDetails button",
      )
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          tag: node.tagName.toLowerCase(),
          id: node.id || null,
          name: node.getAttribute("name"),
          label:
            node.getAttribute("aria-label") ||
            (node.textContent || "").trim() ||
            null,
          type: node.getAttribute("type"),
          options:
            node.tagName === "SELECT"
              ? [...node.options].map((option) => option.textContent.trim())
              : undefined,
        })),
      );
    expect(controls.length).toBeGreaterThan(0);
    await attachJson(testInfo, `scenario-${scenario}-controls.json`, controls);
  });
}
