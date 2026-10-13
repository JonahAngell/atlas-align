import { expect } from "@playwright/test";
import { readAutosave } from "./indexeddb.js";
import {
  acceptNextConfirmation,
  activeAuditSnapshot,
  attachJson,
  openOwnedAudit,
  setOverview,
  waitForAtlasReady,
} from "./ui.js";
import { isAuditCreateResponse, responseJson } from "./api.js";
import { uniqueAuditName } from "./config.js";

export function reviewerConfig() {
  return {
    editableAuditId: String(
      process.env.PLAYWRIGHT_REVIEW_EDITABLE_AUDIT_ID || "",
    ).trim(),
    sessionId: String(process.env.PLAYWRIGHT_REVIEW_SESSION_ID || "").trim(),
    allowDecisionWrite:
      process.env.PLAYWRIGHT_REVIEW_ALLOW_DECISION_WRITE === "true",
  };
}

export function assertReviewerConfig(config) {
  const supplied = [config.editableAuditId, config.sessionId].filter(
    Boolean,
  ).length;
  expect(
    supplied,
    "Reviewer Mode audit and session overrides must be supplied together or both omitted",
  ).not.toBe(1);
}

export async function auditDocumentSnapshot(page, auditId) {
  const response = await page.request.get(
    `/api/audits/${encodeURIComponent(auditId)}`,
  );
  expect(
    response.ok(),
    `GET audit returned ${response.status()} ${response.statusText()}`,
  ).toBeTruthy();
  const payload = await response.json();
  return structuredClone(payload.audit || payload.document || payload);
}

export async function revisionSnapshot(page, auditId) {
  const response = await page.request.get(
    `/api/audits/${encodeURIComponent(auditId)}/revisions`,
  );
  expect(
    response.ok(),
    `GET revisions returned ${response.status()} ${response.statusText()}`,
  ).toBeTruthy();
  const payload = await response.json();
  const revisions = Array.isArray(payload?.revisions) ? payload.revisions : [];
  return revisions.map((revision) => ({
    id: revision.id ?? revision.revisionId ?? null,
    number: revision.revisionNumber ?? revision.number ?? null,
  }));
}

export async function editableStateSnapshot(page) {
  return page.evaluate(() => {
    const appState = typeof state !== "undefined" ? state : window.state;
    const persistence = appState?.auditPersistence || {};
    const coordinator =
      appState?.auditWriteCoordinator || appState?.databaseWrite || {};
    return {
      audit: structuredClone(appState?.audit || null),
      auditSelected: Boolean(appState?.auditSelected),
      persistenceAuditId: persistence.auditId || null,
      revisionId: persistence.revisionId || null,
      revisionNumber: persistence.revisionNumber || null,
      editGeneration: coordinator.editGeneration ?? null,
      acknowledgedGeneration: coordinator.acknowledgedGeneration ?? null,
      inFlight: Boolean(coordinator.inFlight),
      conflict: Boolean(coordinator.conflict),
      reviewContext: window.ATLASAuditReview?.context?.() || null,
    };
  });
}

export async function openConfiguredReview(page, config) {
  await page.goto("/");
  await waitForAtlasReady(page);
  await openOwnedAudit(page, config.editableAuditId);
  const editable = await activeAuditSnapshot(page);
  expect(editable?.id).toBe(config.editableAuditId);

  await page.evaluate(async (sessionId) => {
    if (typeof window.ATLASAuditReview?.open !== "function") {
      throw new Error("ATLAS Reviewer Mode API is unavailable");
    }
    await window.ATLASAuditReview.open({ sessionId });
  }, config.sessionId);

  await expect(page.locator("body")).toHaveClass(/atlas-reviewer-mode/);
  await expect(page.locator("#atlasReviewerModeShell")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.ATLASAuditReview?.isActive?.()))
    .toBe(true);
  const context = await page.evaluate(() =>
    window.ATLASAuditReview?.context?.(),
  );
  expect(context?.sessionId).toBe(config.sessionId);
  return { editable, context };
}

export async function closeReview(page) {
  await page.evaluate(async () => {
    if (window.ATLASAuditReview?.isActive?.()) {
      await window.ATLASAuditReview.close({
        saveDraft: false,
        restoreFocus: false,
      });
    }
  });
}

export async function isolationSnapshot(page, auditId) {
  return {
    editable: await editableStateSnapshot(page),
    revisions: await revisionSnapshot(page, auditId),
    autosave: await readAutosave(page),
  };
}

export function ordinaryMutationLog(page, auditId) {
  const requests = [];
  const listener = (request) => {
    const url = new URL(request.url());
    const method = request.method();
    const auditPath = `/api/audits/${encodeURIComponent(auditId)}`;
    if (
      (method === "PUT" && url.pathname === auditPath) ||
      (method === "DELETE" && url.pathname === auditPath) ||
      (method === "POST" &&
        ["/api/audits", "/api/audits/import"].includes(url.pathname))
    )
      requests.push({ method, pathname: url.pathname });
  };
  page.on("request", listener);
  return {
    requests,
    stop: () => page.off("request", listener),
  };
}

export async function expectLocked(locator, label) {
  await expect(locator, `${label} must be present`).toHaveCount(1);
  const locked = await locator.evaluate((element) =>
    Boolean(
      element.disabled ||
      element.readOnly ||
      element.getAttribute("aria-disabled") === "true" ||
      element.closest('[aria-disabled="true"], [inert]'),
    ),
  );
  expect(
    locked,
    `${label} must be disabled, readonly, inert, or aria-disabled`,
  ).toBe(true);
}

export async function attachedChecklist(testInfo, results) {
  await testInfo.attach("read-only-isolation-checklist.json", {
    body: Buffer.from(JSON.stringify(results, null, 2)),
    contentType: "application/json",
  });
}

export function reviewerProvisioningConfig() {
  const editableAuditId = String(
    process.env.PLAYWRIGHT_REVIEW_EDITABLE_AUDIT_ID ?? "",
  ).trim();

  const sessionId = String(
    process.env.PLAYWRIGHT_REVIEW_SESSION_ID ?? "",
  ).trim();

  if (Boolean(editableAuditId) !== Boolean(sessionId)) {
    throw new Error(
      "PLAYWRIGHT_REVIEW_EDITABLE_AUDIT_ID and " +
        "PLAYWRIGHT_REVIEW_SESSION_ID must be supplied together",
    );
  }

  return {
    editableAuditId,
    sessionId,
    mode: editableAuditId && sessionId ? "configured" : "automatic",
    approverQuery: String(
      process.env.PLAYWRIGHT_REVIEW_APPROVER_QUERY ?? "",
    ).trim(),
    reviewerProfileQuery: String(
      process.env.PLAYWRIGHT_REVIEWER_PROFILE_QUERY ?? "",
    ).trim(),
    assignedAnalystQuery: String(
      process.env.PLAYWRIGHT_ASSIGNED_ANALYST_QUERY ?? "",
    ).trim(),
    logicStepCount: Math.max(
      18,
      Number.parseInt(
        process.env.PLAYWRIGHT_REVIEW_LOGIC_STEP_COUNT ?? "28",
        10,
      ) || 28,
    ),
  };
}

export function assertReviewerOverrides(config) {
  const supplied = [config.editableAuditId, config.sessionId].filter(
    Boolean,
  ).length;
  expect(
    supplied,
    "PLAYWRIGHT_REVIEW_EDITABLE_AUDIT_ID and PLAYWRIGHT_REVIEW_SESSION_ID must be supplied together or both omitted",
  ).not.toBe(1);
  if (config.mode === "automatic") {
    expect(
      config.approverQuery,
      "Automatic review provisioning requires PLAYWRIGHT_REVIEW_APPROVER_QUERY",
    ).toBeTruthy();
  }
}

async function chooseVisibleOption(page, pattern, label) {
  const candidate = page
    .getByRole("option", { name: pattern })
    .or(page.getByRole("menuitem", { name: pattern }))
    .or(page.getByRole("button", { name: pattern }))
    .filter({ visible: true })
    .first();
  await expect(candidate, `${label} must be available`).toBeVisible();
  await candidate.click();
}

export async function createDeterministicNestedLogic(page, count = 28) {
  await page.evaluate(async () => {
    if (typeof window.atlasNavigateToSection === "function") {
      await window.atlasNavigateToSection("steps");
    } else if (typeof window.showSection === "function") {
      window.showSection("steps");
    }
  });
  await expect(page.locator("#page-steps.page.active")).toBeVisible();
  const add = page.locator("#addStepBtn");
  await expect(add).toBeVisible();

  const readStepIds = () =>
    page.evaluate(() => {
      const document =
        window.atlasCurrentRenderDocument?.() || window.state?.audit;
      return Array.isArray(document?.steps)
        ? document.steps.map((step) => step?.id).filter(Boolean)
        : [];
    });

  const create = async (typePattern) => {
    const beforeIds = await readStepIds();
    await add.click();
    await chooseVisibleOption(page, typePattern, `Logic step ${typePattern}`);
    await expect
      .poll(readStepIds, {
        message: `Expected ${typePattern} to add a Logic step`,
      })
      .toHaveLength(beforeIds.length + 1);
    const afterIds = await readStepIds();
    const createdId = afterIds.find((id) => !beforeIds.includes(id));
    expect(
      createdId,
      `Expected ${typePattern} to create a stable step ID`,
    ).toBeTruthy();
    return createdId;
  };

  const indentStep = async (stepId, expectedParentId) => {
    const card = page.locator(
      `#stepsList .logic-rule-card[data-id="${stepId}"]`,
    );
    await expect(
      card,
      `Created Logic step ${stepId} must be mounted`,
    ).toBeVisible();
    await card.locator(`[data-rule-menu-toggle="${stepId}"]`).click();
    const indent = page.locator(
      `[data-rule-menu-panel="${stepId}"] [data-indent]`,
    );
    await expect(
      indent,
      `Logic step ${stepId} must expose Indent in Step actions`,
    ).toBeVisible();
    await expect(indent).toBeEnabled();
    await indent.click();
    await expect
      .poll(async () => {
        const document = await page.evaluate(() =>
          structuredClone(
            window.atlasCurrentRenderDocument?.() || window.state?.audit,
          ),
        );
        return (
          document?.steps?.find((step) => step?.id === stepId)?.parentId || ""
        );
      })
      .toBe(expectedParentId);
  };

  await create(/IF\s*\/\s*THEN|IF\s*THEN/i);
  await create(/Create Column|Output/i);

  const initialCards = page.locator("#stepsList .logic-rule-card[data-id]");
  await expect(initialCards).toHaveCount(2);
  const expectedParentId = await initialCards.nth(0).getAttribute("data-id");
  const firstChildId = await initialCards.nth(1).getAttribute("data-id");
  expect(
    expectedParentId,
    "First Logic rule must have a stable ID",
  ).toBeTruthy();
  expect(firstChildId, "Second Logic rule must have a stable ID").toBeTruthy();
  await indentStep(firstChildId, expectedParentId);

  for (let i = 2; i < count; i += 1) {
    await create(/Create Column|Output|IF\s*\/\s*THEN|IF\s*THEN/i);
  }

  const structure = await page.evaluate(() => {
    const doc = window.atlasCurrentRenderDocument?.() || window.state?.audit;
    const steps = Array.isArray(doc?.steps) ? doc.steps : [];
    return {
      count: steps.length,
      nested: steps.filter((step) => step?.parentId).length,
      ids: steps.map((step) => step?.id).filter(Boolean),
    };
  });
  expect(
    structure.nested,
    "Fixture must contain nested Logic steps",
  ).toBeGreaterThan(0);
  expect(
    structure.count,
    "Fixture must contain virtualization-capable Logic content",
  ).toBeGreaterThanOrEqual(count);
  return structure;
}

export async function switchEffectiveProfile(page, query) {
  const expected = String(query || "").trim();
  expect(expected, "An effective-profile query is required").toBeTruthy();
  await page
    .getByRole("button", { name: /Signed in as|profile picker/i })
    .click();
  const dialog = page.getByRole("dialog", { name: /Switch user profile/i });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("searchbox", { name: /Search profiles/i })
    .fill(expected);
  const card = dialog
    .locator("[data-profile-id]")
    .filter({ hasText: expected })
    .first();
  await expect(card, `Expected profile matching ${expected}`).toBeVisible();
  const request = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      /\/api\/impersonation\/(start|switch)$/.test(url.pathname)
    );
  });
  await card.click();
  const response = await request;
  expect(response.ok(), "Effective identity switch must succeed").toBeTruthy();
  await page.waitForLoadState("domcontentloaded");
  await waitForAtlasReady(page);
  return response.json();
}

export async function restoreOriginalProfile(page) {
  const picker = page.getByRole("button", {
    name: /Signed in as|profile picker/i,
  });
  if (!(await picker.isVisible().catch(() => false))) return false;
  await picker.click();
  const dialog = page.getByRole("dialog", { name: /Switch user profile/i });
  const back = dialog.getByRole("button", { name: /Return to my Profile/i });
  if (!(await back.isVisible().catch(() => false))) return false;
  const request = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      /\/api\/impersonation\/(return|stop)$/.test(url.pathname)
    );
  });
  await back.click();
  const response = await request;
  expect(
    response.ok(),
    "Original effective identity restoration must succeed",
  ).toBeTruthy();
  await page.waitForLoadState("domcontentloaded");
  await waitForAtlasReady(page);
  return true;
}

export async function expectLockedAndMutationResistant(locator, label, mutate) {
  await expectLocked(locator, label);
  const before = await locator.evaluate((element) => ({
    value: "value" in element ? element.value : null,
    checked: "checked" in element ? element.checked : null,
    text: element.textContent,
  }));
  let interactionError = null;
  try {
    await mutate(locator);
  } catch (error) {
    interactionError = String(error?.message || error);
  }
  const after = await locator.evaluate((element) => ({
    value: "value" in element ? element.value : null,
    checked: "checked" in element ? element.checked : null,
    text: element.textContent,
  }));
  expect(after, `${label} changed after a locked interaction`).toEqual(before);
  return { interactionError };
}

async function selectPersonFromPicker(page, trigger, query, label) {
  const value = String(query || "").trim();
  expect(value, `${label} query is required`).toBeTruthy();
  await expect(
    trigger,
    `${label} picker trigger must be visible`,
  ).toBeVisible();
  await trigger.click();

  const dialog = page.getByRole("dialog").last();
  await expect(dialog, `${label} picker must open`).toBeVisible();
  const search = dialog
    .getByRole("searchbox")
    .or(dialog.locator('input[type="search"]'))
    .first();
  await expect(
    search,
    `${label} picker search must be available`,
  ).toBeVisible();
  await search.fill(value);

  const option = dialog
    .getByRole("option", { name: new RegExp(value, "i") })
    .or(
      dialog
        .locator("[data-profile-id], [data-user-id], [data-picker-option]")
        .filter({ hasText: value }),
    )
    .first();
  await expect(option, `${label} ${value} must be selectable`).toBeVisible();
  await option.click();

  const apply = dialog
    .getByRole("button", { name: /Add|Apply|Select|Save/i })
    .last();
  if (await apply.isVisible().catch(() => false)) await apply.click();
  await expect(dialog).toBeHidden();
}

async function createAutomaticAudit(page, config, testInfo) {
  await page.goto("/");
  await waitForAtlasReady(page);

  const createButton = page.locator("#newAuditBtn");
  await expect(
    createButton,
    "Automatic provisioning requires audit creation capability",
  ).toBeEnabled();

  await acceptNextConfirmation(page);
  const createResponse = page.waitForResponse(isAuditCreateResponse);
  await createButton.click();
  const payload = await responseJson(await createResponse);

  await expect
    .poll(async () => (await activeAuditSnapshot(page))?.revisionId)
    .toBeTruthy();
  const snapshot = await activeAuditSnapshot(page);
  const auditId = String(payload.audit?.id || payload.id || snapshot?.id || "");
  expect(auditId, "POST /api/audits must establish an audit ID").toBeTruthy();

  const name = `${uniqueAuditName("PW Read Only", testInfo.workerIndex)} nested`;
  await setOverview(page, name, "Self-provisioned read-only isolation fixture");
  const logic = await createDeterministicNestedLogic(
    page,
    config.logicStepCount,
  );
  const fixture = { auditId, name, logic, testOwned: true };
  await attachJson(testInfo, "self-provisioned-audit.json", fixture);
  return fixture;
}

async function assignAutomaticAnalyst(page, config) {
  await page.evaluate(async () => {
    if (typeof window.atlasNavigateToSection === "function") {
      await window.atlasNavigateToSection("overview");
    } else if (typeof window.showSection === "function") {
      window.showSection("overview");
    }
  });
  await expect(page.locator("#page-overview.page.active")).toBeVisible();

  const trigger = page
    .locator('[data-assignment-picker-role="assigned"]')
    .or(page.getByRole("button", { name: /Add Assigned Analyst/i }))
    .first();
  await selectPersonFromPicker(
    page,
    trigger,
    config.assignedAnalystQuery,
    "Assigned Analyst",
  );
}

async function submitAutomaticAudit(page, fixture, config) {
  const synchronized = await page.evaluate(async () => {
    if (typeof atlasSaveIfDirty !== "function") {
      throw new Error("ATLAS durable-save boundary is unavailable");
    }
    const saved = await atlasSaveIfDirty("automatic review provisioning");
    if (!saved) return false;
    await window.ATLASWorkflow?.refresh?.();
    return true;
  });
  expect(
    synchronized,
    "Fixture audit changes must be durably saved before submission",
  ).toBe(true);

  const submitButton = page
    .locator('[data-workflow-action="submit"]')
    .or(page.getByRole("button", { name: /Submit for Approval/i }))
    .first();
  await expect(
    submitButton,
    "Fixture audit must become eligible for submission",
  ).toBeEnabled();
  await submitButton.click();

  const dialog = page.getByRole("dialog").last();
  await expect(dialog, "Submission dialog must open").toBeVisible();
  await selectPersonFromPicker(
    page,
    dialog.locator("#atlasSubmitApproverPicker"),
    config.approverQuery,
    "Approver",
  );

  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      url.pathname ===
        `/api/audits/${encodeURIComponent(fixture.auditId)}/submit`
    );
  });
  await dialog.locator("[data-confirm-submit]").click();
  const payload = await responseJson(await responsePromise);
  const request = payload.request || payload.approvalRequest || payload;
  const requestId = String(
    request.id || request.requestId || payload.requestId || "",
  );
  const submittedRevisionId = String(
    request.submittedRevisionId || payload.submittedRevisionId || "",
  );
  expect(
    requestId,
    "Submission response must contain request identity",
  ).toBeTruthy();
  expect(
    submittedRevisionId,
    "Submission response must contain submitted revision identity",
  ).toBeTruthy();
  Object.assign(fixture, { requestId, submittedRevisionId });
}

async function openAutomaticReview(page, fixture, config) {
  const reviewerQuery = config.reviewerProfileQuery || config.approverQuery;
  await switchEffectiveProfile(page, reviewerQuery);

  const inboxButton = page.getByRole("button", { name: /^Inbox/i });
  await expect(inboxButton, "Reviewer Inbox must be available").toBeEnabled();
  await inboxButton.click();

  const item = page
    .locator(`[data-request-id="${fixture.requestId}"]`)
    .or(page.locator(`[data-audit-id="${fixture.auditId}"]`))
    .first();
  await expect(
    item,
    "Exact fixture approval request must appear in Reviewer Inbox",
  ).toBeVisible();

  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      url.pathname ===
        `/api/audits/${encodeURIComponent(fixture.auditId)}/approval-requests/${encodeURIComponent(fixture.requestId)}/review-session`
    );
  });
  await item
    .getByRole("button", { name: /Review|Open/i })
    .first()
    .click();
  const payload = await responseJson(await responsePromise);
  const session = payload.session || payload.reviewSession || payload;
  const sessionId = String(
    session.id || session.sessionId || payload.sessionId || "",
  );
  expect(
    sessionId,
    "Review-session response must contain session identity",
  ).toBeTruthy();

  await expect(page.locator("body")).toHaveClass(/atlas-reviewer-mode/);
  const context = await page.evaluate(() =>
    window.ATLASAuditReview?.context?.(),
  );
  expect(String(context?.sessionId || "")).toBe(sessionId);
  expect(String(context?.auditId || "")).toBe(String(fixture.auditId));
  return { editable: null, context, fixture, payload };
}

export async function provisionAutomaticReview(page, config, testInfo) {
  expect(config.mode, "Automatic provisioner requires automatic mode").toBe(
    "automatic",
  );
  expect(
    config.assignedAnalystQuery,
    "Automatic review provisioning requires PLAYWRIGHT_ASSIGNED_ANALYST_QUERY",
  ).toBeTruthy();
  expect(
    config.approverQuery,
    "Automatic review provisioning requires PLAYWRIGHT_REVIEW_APPROVER_QUERY",
  ).toBeTruthy();

  const fixture = await createAutomaticAudit(page, config, testInfo);
  await assignAutomaticAnalyst(page, config);
  await submitAutomaticAudit(page, fixture, config);
  return openAutomaticReview(page, fixture, config);
}
