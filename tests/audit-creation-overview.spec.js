import { test, expect } from "./fixtures/atlas.fixture.js";
import { activeAuditSnapshot, openPage, setOverview } from "./helpers/ui.js";
import {
  getAudit,
  auditPayloadDocument,
  revisionMetadata,
  isAuditSaveResponse,
} from "./helpers/api.js";

test("1-2.2 creates its own Draft audit and persists Overview values", async ({
  page,
  request,
  ownedAudit,
}) => {
  await test.step("1.1-1.4 new ID, POST creation, Revision 1, editable Draft", async () => {
    const snapshot = await activeAuditSnapshot(page);
    expect(
      snapshot,
      "Expected the accepted database audit to be active",
    ).not.toBeNull();
    expect(snapshot?.id).toBe(ownedAudit.id);
    expect(snapshot?.status).toBe("Draft");
    const durable = await getAudit(request, ownedAudit.id);
    expect(auditPayloadDocument(durable).id).toBe(ownedAudit.id);
    expect(revisionMetadata(durable).number).toBe(1);
    await expect(page.locator("#auditName")).toBeEditable();
  });

  const firstName = ownedAudit.name;
  const finalName = `${ownedAudit.name} revised`;
  const purpose =
    "Playwright audit lifecycle validation\nSecond persisted line";

  await test.step("2 sets unique name and multiline purpose", async () => {
    const save = page.waitForResponse((r) =>
      isAuditSaveResponse(r, ownedAudit.id),
    );
    await setOverview(page, firstName, purpose);
    await save;
  });

  await test.step("2.1-2.2 revised name replaces prior value and multiline purpose persists", async () => {
    const save = page.waitForResponse((r) =>
      isAuditSaveResponse(r, ownedAudit.id),
    );
    await setOverview(page, finalName, purpose);
    await save;
    await openPage(page, "fields");
    await openPage(page, "overview");
    await expect(page.locator("#auditName")).toHaveValue(finalName);
    await expect(page.locator("#auditPurpose")).toHaveValue(purpose);
    const durable = auditPayloadDocument(
      await getAudit(request, ownedAudit.id),
    );
    expect(durable.name).toBe(finalName);
    expect(durable.description ?? durable.purpose).toBe(purpose);
  });
});
