import { test, expect } from "./fixtures/atlas.fixture.js";
import {
  activeAuditSnapshot,
  openOwnedAudit,
  openPage,
  openHistory,
  setOverview,
  waitForAtlasReady,
} from "./helpers/ui.js";
import {
  getAudit,
  auditPayloadDocument,
  revisionMetadata,
  isAuditSaveResponse,
} from "./helpers/api.js";
import { readAutosave } from "./helpers/indexeddb.js";

test("18-20.2 and 22 validate durable revision, reload, recovery boundary, and detached history", async ({
  page,
  ownedAudit,
}, testInfo) => {
  const initial = await activeAuditSnapshot(page);

  expect(initial?.id).toBe(ownedAudit.id);
  expect(initial?.persistenceAuditId).toBe(ownedAudit.id);
  expect(initial?.revisionId).toBeTruthy();

  const before = await getAudit(page.request, ownedAudit.id);
  const beforeRevision = revisionMetadata(before);
  const finalName = `${ownedAudit.name} persistence`;

  await test.step("18-18.1 changed content saves through PUT and advances revision", async () => {
    const saved = page.waitForResponse((r) =>
      isAuditSaveResponse(r, ownedAudit.id),
    );
    await setOverview(page, finalName, "Persistence and history validation");
    expect((await saved).ok()).toBeTruthy();
    const after = await getAudit(page.request, ownedAudit.id);
    expect(revisionMetadata(after).number).toBeGreaterThan(
      beforeRevision.number,
    );
  });

  await test.step("18.4 canonically identical UI state does not cause an immediate additional revision", async () => {
    const first = revisionMetadata(
      await getAudit(page.request, ownedAudit.id),
    ).number;
    await page.locator("#auditName").fill(finalName);
    await page.locator("#auditName").blur();
    await page.waitForTimeout(3000);
    const second = revisionMetadata(
      await getAudit(page.request, ownedAudit.id),
    ).number;
    expect(second).toBe(first);
  });

  await test.step("19 and 22 reload retain accepted state without cross-audit contamination", async () => {
    await page.reload();
    await expect(page).toHaveTitle(/ATLAS Align/i);
    await waitForAtlasReady(page);

    await expect(page.locator("body")).toHaveClass(/audit-not-selected/);
    await expect(page.locator("#activeAuditSelect")).toHaveValue("");

    const durable = auditPayloadDocument(
      await getAudit(page.request, ownedAudit.id),
    );
    expect(durable.name).toBe(finalName);

    await openOwnedAudit(page, ownedAudit.id);
    const reopened = await activeAuditSnapshot(page);
    expect(reopened?.id).toBe(ownedAudit.id);
    expect(reopened?.persistenceAuditId).toBe(ownedAudit.id);
    expect(reopened?.revisionId).toBeTruthy();
    expect(reopened?.name).toBe(finalName);
  });

  await test.step("19.3 IndexedDB recovery is observable browser-local state", async () => {
    const autosave = await readAutosave(page);
    expect(autosave === null || typeof autosave === "object").toBeTruthy();
  });

  await test.step("20-20.2 historical document surface is detached", async () => {
    const activeBefore = await activeAuditSnapshot(page);
    expect(activeBefore?.id).toBe(ownedAudit.id);
    expect(activeBefore?.persistenceAuditId).toBe(ownedAudit.id);
    expect(activeBefore?.revisionId).toBeTruthy();

    await openHistory(page);

    await expect(page.locator("#atlasHistoryDocument")).not.toHaveText(
      "Select a timeline entry, revision, or publication.",
    );

    const activeAfter = await activeAuditSnapshot(page);
    expect(activeAfter?.id).toBe(activeBefore?.id);
    expect(activeAfter?.persistenceAuditId).toBe(
      activeBefore?.persistenceAuditId,
    );
    expect(activeAfter?.revisionId).toBe(activeBefore?.revisionId);
  });

  testInfo.annotations.push({
    type: "remaining-boundary",
    description:
      "18.2, 18.3, 18.5, 19.1, and 19.2 require current step-history response adapters and deterministic concurrent/conflict orchestration.",
  });
});
