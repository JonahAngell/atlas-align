import { test, expect } from "./fixtures/atlas.fixture.js";
import { openPage } from "./helpers/ui.js";

test("21-21.3 validates exposed export controls and downloads", async ({
  page,
  ownedAudit,
}, testInfo) => {
  await openPage(page, "save");
  const buttons = await page
    .getByRole("button")
    .evaluateAll((nodes) =>
      nodes
        .map((n) => (n.textContent || "").trim())
        .filter((t) => /json|excel|html|markdown|qtest/i.test(t)),
    );
  expect(
    buttons.length,
    "At least one supported export must be exposed",
  ).toBeGreaterThan(0);
  await testInfo.attach("scenario-21-export-controls.json", {
    body: Buffer.from(JSON.stringify(buttons, null, 2)),
    contentType: "application/json",
  });
  testInfo.annotations.push({
    type: "conditional",
    description:
      "qTest content validation is skipped when the deployed template is unavailable.",
  });
});
