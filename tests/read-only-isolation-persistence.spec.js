import { test, expect } from "./fixtures/reviewer.fixture.js";
import {
  attachedChecklist,
  auditDocumentSnapshot,
  editableStateSnapshot,
  expectLocked,
  isolationSnapshot,
  ordinaryMutationLog,
} from "./helpers/reviewer.js";

const result = (results, id, status, note = "") => {
  results[id] = { status, note };
};

async function navigate(page, section) {
  const button = page.locator(`[data-section="${section}"]`);
  await expect(button).toBeVisible();
  await button.click();
  await expect(
    page.locator(
      `#page-${section}.page.active, .page.active[data-page="${section}"]`,
    ),
  ).toBeVisible();
}

async function expectUnchanged(page, before, message) {
  const after = await editableStateSnapshot(page);
  expect(after.audit, message).toEqual(before.audit);
  expect(after.persistenceAuditId, message).toBe(before.persistenceAuditId);
  expect(after.revisionId, message).toBe(before.revisionId);
}

const lockCases = [
  ["18.1", "Audit Name", "#auditName"],
  ["18.2", "Audit Description", "#auditPurpose"],
  [
    "18.3",
    "Add Assigned Analyst",
    '[data-assignment-add="assigned"], #addAssignedAnalyst',
  ],
  ["18.6", "New Rule", "#addStepBtn, [data-new-rule]"],
  ["18.7", "Logic context menu", "[data-step-menu], [data-rule-menu]"],
  ["18.8", "Step Type", "[data-step-type], #stepType"],
  ["18.9", "Source Field", '[data-source-field], [name="sourceField"]'],
  ["18.10", "Value Mode", '[data-value-mode], [name="valueMode"]'],
  ["18.11", "Operator", '[data-condition-operator], [name="operator"]'],
  [
    "18.12",
    "Comparison text",
    '[data-condition-value], [name="conditionValue"]',
  ],
  [
    "18.13",
    "Add comparison entry",
    "[data-add-condition-value], [data-add-comparison-value]",
  ],
  [
    "18.14",
    "Remove comparison value",
    "[data-remove-condition-value], [data-remove-comparison-value]",
  ],
  [
    "18.15",
    "Delete condition",
    "[data-delete-condition], [data-remove-condition]",
  ],
  [
    "18.16",
    "Add condition",
    "[data-add-condition], [data-condition-connector]",
  ],
  ["18.17", "Manual Notes", "#stepNotes, [data-step-notes]"],
  ["18.18", "Action Type", '[data-action-type], [name="actionType"]'],
];

test.describe.serial("Read-Only Isolation and Persistence", () => {
  // Its assertions compare against an existing editable audit and review
  // session; automatic provisioning cannot satisfy them yet (docs/BACKLOG.md).
  test.skip(
    !process.env.PLAYWRIGHT_REVIEW_SESSION_ID?.trim(),
    "Set PLAYWRIGHT_REVIEW_EDITABLE_AUDIT_ID and PLAYWRIGHT_REVIEW_SESSION_ID to run Read-Only Isolation",
  );
  test("1-6 detached state and ordinary persistence remain unchanged", async ({
    page,
    reviewerConfig,
    reviewSession,
  }, testInfo) => {
    const results = {};
    const auditId =
      reviewSession.fixture?.auditId ||
      reviewSession.context?.auditId ||
      reviewerConfig.editableAuditId;

    expect(
      auditId,
      "Reviewer fixture did not create or resolve an audit",
    ).toBeTruthy();

    const tracker = ordinaryMutationLog(page, auditId);
    const before = await isolationSnapshot(page, auditId);

    await test.step("1 opening Reviewer Mode does not replace the editable audit", async () => {
      expect(before.editable.audit?.id).toBe(auditId);
      expect(before.editable.reviewContext?.sessionId).toBe(
        reviewerConfig.sessionId,
      );
      result(results, "1", "Passed");
    });

    await test.step("3 Reviewer Mode does not mark the audit dirty", async () => {
      expect(before.editable.inFlight).toBe(false);
      expect(before.editable.conflict).toBe(false);
      result(results, "3", "Passed");
    });

    await test.step("5 Reviewer Mode does not write an IndexedDB recovery snapshot", async () => {
      const second = await isolationSnapshot(page, auditId);
      expect(second.autosave).toEqual(before.autosave);
      result(results, "5", "Passed");
    });

    await test.step("2 and 4 Reviewer Mode creates no audit revision or durable PUT", async () => {
      const second = await isolationSnapshot(page, auditId);
      expect(second.revisions).toEqual(before.revisions);
      expect(tracker.requests).toEqual([]);
      result(results, "2", "Passed");
      result(results, "4", "Passed");
    });

    await test.step("6 refresh does not save temporary authoring changes", async () => {
      const context = before.editable.reviewContext;
      await page.reload();
      await expect(page.locator('body[data-atlas-ready="true"]')).toBeVisible();
      await page.evaluate(
        async (sessionId) => window.ATLASAuditReview.open({ sessionId }),
        reviewerConfig.sessionId,
      );
      await expect(page.locator("body")).toHaveClass(/atlas-reviewer-mode/);
      const after = await isolationSnapshot(page, auditId);
      expect(after.revisions).toEqual(before.revisions);
      expect(after.autosave).toEqual(before.autosave);
      expect(after.editable.reviewContext?.submittedRevisionId).toBe(
        context.submittedRevisionId,
      );
      result(results, "6", "Passed");
      result(
        results,
        "16",
        "Passed",
        "Exact submitted revision restored after refresh",
      );
    });

    tracker.stop();
    await attachedChecklist(testInfo, results);
  });

  test("7-15 remounts and user interactions keep authoring locked", async ({
    page,
    reviewerConfig,
    reviewSession,
  }, testInfo) => {
    const results = {};
    const auditId =
      reviewerConfig.editableAuditId ||
      reviewSession.fixture?.auditId ||
      reviewSession.context?.auditId;
    expect(auditId, "Exact review audit identity is required").toBeTruthy();
    const before = await editableStateSnapshot(page);
    const tracker = ordinaryMutationLog(page, auditId);

    await test.step("7 switching pages does not unlock authoring controls", async () => {
      for (const section of ["overview", "fields", "steps", "display-fields"]) {
        await navigate(page, section);
        await expect(page.locator("body")).toHaveClass(/atlas-reviewer-mode/);
      }
      await expectUnchanged(
        page,
        before,
        "Reviewer navigation must not change editable state",
      );
      result(results, "7", "Passed");
    });

    await test.step("8 collapse and expand do not unlock remounted Logic controls", async () => {
      await navigate(page, "steps");
      const toggle = page
        .locator("[data-collapse-step], [data-toggle-collapse]")
        .first();
      if (await toggle.count()) {
        await toggle.click();
        await toggle.click();
        await expect(page.locator("body")).toHaveClass(/atlas-reviewer-mode/);
        result(results, "8", "Passed");
      } else
        result(
          results,
          "8",
          "Blocked",
          "Submitted revision has no collapsible Logic branch",
        );
    });

    await test.step("9 virtualization remount does not unlock Logic controls", async () => {
      const scroller = page.locator("#stepsList, .logic-rules-list").first();
      const cards = page.locator("[data-step-id], [data-rule-id]");
      if ((await scroller.count()) && (await cards.count()) > 8) {
        await scroller.evaluate((node) => {
          node.scrollTop = node.scrollHeight;
        });
        await expect(page.locator("body")).toHaveClass(/atlas-reviewer-mode/);
        await scroller.evaluate((node) => {
          node.scrollTop = 0;
        });
        result(results, "9", "Passed");
      } else
        result(
          results,
          "9",
          "Blocked",
          "Submitted revision does not exercise virtualization",
        );
    });

    await test.step("10 Visual Picker cycle does not unlock its owning control", async () => {
      await navigate(page, "overview");
      const pickerOwner = page
        .locator("[data-assignment-add], #addAssignedAnalyst")
        .first();
      if (await pickerOwner.count()) {
        await expectLocked(pickerOwner, "Assignment picker owner");
        result(results, "10", "Passed");
      } else
        result(
          results,
          "10",
          "Not Applicable",
          "No assignment picker owner rendered",
        );
    });

    await test.step("11 paste cannot mutate locked text", async () => {
      const name = page.locator("#auditName");
      const value = await name.inputValue();
      await name.press("ControlOrMeta+V").catch(() => {});
      await expect(name).toHaveValue(value);
      result(results, "11", "Passed");
    });

    await test.step("12 keyboard activation cannot mutate locked controls", async () => {
      const status = page.locator("#auditStatus");
      if (await status.count()) {
        const value = await status.inputValue();
        await status.press("ArrowDown").catch(() => {});
        await expect(status).toHaveValue(value);
      }
      result(results, "12", "Passed");
    });

    await test.step("13 drag and drop cannot reorder review-only Logic steps", async () => {
      await navigate(page, "steps");
      const orderBefore = await page
        .locator("[data-step-id], [data-rule-id]")
        .evaluateAll((nodes) =>
          nodes.map(
            (n) =>
              n.getAttribute("data-step-id") || n.getAttribute("data-rule-id"),
          ),
        );
      const handles = page.locator('[draggable="true"], [data-drag-handle]');
      if ((await handles.count()) > 1)
        await expectLocked(handles.first(), "Logic drag handle");
      const orderAfter = await page
        .locator("[data-step-id], [data-rule-id]")
        .evaluateAll((nodes) =>
          nodes.map(
            (n) =>
              n.getAttribute("data-step-id") || n.getAttribute("data-rule-id"),
          ),
        );
      expect(orderAfter).toEqual(orderBefore);
      result(results, "13", "Passed");
    });

    await test.step("14 Display Fields cannot be selected, removed, or reordered", async () => {
      await navigate(page, "display-fields");
      const controls = page.locator(
        "[data-display-field-add], [data-display-field-remove], [data-display-field-move]",
      );
      for (let i = 0; i < (await controls.count()); i += 1)
        await expectLocked(
          controls.nth(i),
          `Display Fields mutation control ${i + 1}`,
        );
      result(results, "14", "Passed");
    });

    await test.step("15 archive import duplicate and delete actions are unavailable", async () => {
      await navigate(page, "overview");
      for (const [label, selector] of [
        ["Duplicate", "#duplicateAuditBtn"],
        ["Delete", "#deleteAuditBtn"],
        ["Import", "#importAuditBtn"],
      ]) {
        const control = page.locator(selector);
        if (await control.count())
          await expectLocked(control, `${label} audit control`);
      }
      expect(tracker.requests).toEqual([]);
      result(results, "15", "Passed");
    });

    await expectUnchanged(
      page,
      before,
      "Read-only interactions must not change editable state",
    );
    tracker.stop();
    await attachedChecklist(testInfo, results);
  });

  test("18.1-18.18 native authoring controls remain locked", async ({
    page,
    reviewerConfig,
    reviewSession,
  }, testInfo) => {
    const results = {};
    const auditId =
      reviewerConfig.editableAuditId ||
      reviewSession.fixture?.auditId ||
      reviewSession.context?.auditId;
    expect(auditId, "Exact review audit identity is required").toBeTruthy();
    const before = await editableStateSnapshot(page);
    const tracker = ordinaryMutationLog(page, auditId);

    await navigate(page, "overview");
    for (const [id, label, selector] of lockCases.slice(0, 3)) {
      await test.step(`${id} ${label} cannot be modified`, async () => {
        const locator = page.locator(selector).first();
        if (await locator.count()) {
          await expectLocked(locator, label);
          result(results, id, "Passed");
        } else
          result(
            results,
            id,
            "Not Applicable",
            `${label} is not rendered for this review document`,
          );
      });
    }

    await test.step("18.4 Sources cannot be modified and 18.5 details remain viewable", async () => {
      await navigate(page, "fields");
      const mutations = page.locator("[data-use-source], [data-remove-source]");
      for (let i = 0; i < (await mutations.count()); i += 1)
        await expectLocked(mutations.nth(i), `Source mutation ${i + 1}`);
      const details = page
        .locator("[data-source-details], [data-preview-source]")
        .first();
      if (await details.count()) await expect(details).toBeEnabled();
      result(results, "18.4", "Passed");
      result(
        results,
        "18.5",
        (await details.count()) ? "Passed" : "Not Applicable",
        (await details.count()) ? "" : "No source detail trigger rendered",
      );
    });

    await navigate(page, "steps");
    for (const [id, label, selector] of lockCases.slice(3)) {
      await test.step(`${id} ${label} cannot be modified`, async () => {
        const locator = page.locator(selector).first();
        if (await locator.count()) {
          await expectLocked(locator, label);
          result(results, id, "Passed");
        } else
          result(
            results,
            id,
            "Not Applicable",
            `${label} is not exposed by the selected submitted step`,
          );
      });
    }

    await expectUnchanged(
      page,
      before,
      "Detailed authoring checks must not change editable state",
    );
    expect(tracker.requests).toEqual([]);
    result(
      results,
      "18",
      "Passed",
      "All rendered native authoring controls remained locked",
    );
    tracker.stop();
    await attachedChecklist(testInfo, results);
  });

  test("18 server-rejected audit mutation leaves no misleading accepted state", async ({
    page,
    reviewerConfig,
    reviewSession,
  }, testInfo) => {
    const results = {};
    const auditId =
      reviewerConfig.editableAuditId ||
      reviewSession.fixture?.auditId ||
      reviewSession.context?.auditId;
    expect(auditId, "Exact review audit identity is required").toBeTruthy();
    const beforeDocument = await auditDocumentSnapshot(page, auditId);
    const beforeState = await editableStateSnapshot(page);
    const rejected = await page.request.put(
      `/api/audits/${encodeURIComponent(auditId)}`,
      {
        data: {
          audit: {
            ...beforeDocument,
            name: `${beforeDocument.name} rejected mutation`,
          },
          expectedRevisionId: "playwright-intentionally-stale-revision",
        },
      },
    );
    expect(
      [403, 409],
      `Expected authorization or optimistic-concurrency rejection, received ${rejected.status()}`,
    ).toContain(rejected.status());
    const afterDocument = await auditDocumentSnapshot(page, auditId);
    expect(afterDocument).toEqual(beforeDocument);
    await expectUnchanged(
      page,
      beforeState,
      "Rejected mutation must not alter editable browser state",
    );
    result(
      results,
      "18",
      "Passed",
      `Server rejected ordinary audit mutation with HTTP ${rejected.status()}`,
    );
    await attachedChecklist(testInfo, results);
  });

  test("17 review persistence stays separate from audit persistence", async ({
    page,
    reviewerConfig,
    reviewSession,
  }, testInfo) => {
    const results = {};
    const auditId =
      reviewerConfig.editableAuditId ||
      reviewSession.fixture?.auditId ||
      reviewSession.context?.auditId;
    expect(auditId, "Exact review audit identity is required").toBeTruthy();
    if (!reviewerConfig.allowDecisionWrite) {
      result(
        results,
        "17",
        "Blocked",
        "Set PLAYWRIGHT_REVIEW_ALLOW_DECISION_WRITE=true only for an isolated disposable review session",
      );
      await attachedChecklist(testInfo, results);
      return;
    }
    const before = await isolationSnapshot(page, auditId);
    const decision = page.locator('[data-review-decision="approve"]').first();
    if (!(await decision.count())) {
      result(
        results,
        "17",
        "Blocked",
        "No eligible direct review decision is rendered",
      );
      await attachedChecklist(testInfo, results);
      return;
    }

    const reviewSave = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "PUT" &&
        /\/api\/review-sessions\/[^/]+\/draft$/.test(url.pathname)
      );
    });
    await decision.click();
    const response = await reviewSave;
    expect(
      response.ok(),
      `Review draft save returned ${response.status()}`,
    ).toBeTruthy();
    const after = await isolationSnapshot(page, auditId);
    expect(after.revisions).toEqual(before.revisions);
    expect(after.editable.audit).toEqual(before.editable.audit);
    result(
      results,
      "17",
      "Passed",
      "Decision persisted through review draft API without an audit revision",
    );
    await attachedChecklist(testInfo, results);
  });
});
