import { expect } from "@playwright/test";

export async function waitForAtlasReady(page) {
  await expect(page.locator('body[data-atlas-ready="true"]')).toBeVisible();
  await expect(page.locator("#page-my-audits.page.active")).toBeVisible();
  await expect(page.locator("#newAuditBtn")).toBeVisible();
}

export async function acceptNextConfirmation(page) {
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.accept();
  });
}

export async function openPage(page, section) {
  await page.evaluate(async (target) => {
    if (typeof window.atlasNavigateToSection === "function") {
      await window.atlasNavigateToSection(target);
      return;
    }

    if (typeof window.showSection === "function") {
      window.showSection(target);
      return;
    }

    throw new Error(`No supported ATLAS navigation function for ${target}`);
  }, section);

  await expect(
    page.locator(`.page.active:is([data-page="${section}"], #page-${section})`),
    `Expected ATLAS page "${section}" to become active`,
  ).toBeVisible();
}

export async function openHistory(page) {
  const openButton = page.getByRole("button", {
    name: "View Audit History",
    exact: true,
  });

  await expect(
    openButton,
    "Expected workflow History capability to become available",
  ).toBeVisible();

  await expect(openButton).toBeEnabled();

  await openButton.click();

  await expect(
    page.locator("#page-history.page.active"),
    "Expected Audit History to become active",
  ).toBeVisible();

  await expect(
    page.locator("#atlasHistoryTimeline [role='listitem']").first(),
    "Expected Audit History to load at least one timeline entry",
  ).toBeVisible();

  await expect(page.locator("#atlasHistoryStatus")).toContainText(/revision/i);
}

export async function activeAuditSnapshot(page) {
  return page.evaluate(() => {
    const appState = typeof state !== "undefined" ? state : window.state;

    const audit = appState?.audit;
    const persistence = appState?.auditPersistence || {};

    if (!audit) return null;

    return {
      id: audit.id,
      name: audit.name,
      description: audit.description ?? audit.purpose ?? "",
      status: audit.status,
      steps: structuredClone(audit.steps || []),
      sources: structuredClone(audit.sources || audit.selectedSources || []),
      displayFields: structuredClone(audit.displayFields || []),
      persistenceAuditId: persistence.auditId || null,
      revisionId: persistence.revisionId || null,
      revisionNumber: persistence.revisionNumber || null,
    };
  });
}

export async function openOwnedAudit(page, auditId) {
  const id = String(auditId || "").trim();
  expect(id, "A test-owned audit ID is required").toBeTruthy();

  const search = page.getByRole("searchbox", { name: "Search audits" });
  await search.fill(id);

  let openButton = page.locator(`[data-open-database-audit="${id}"]`);

  if ((await openButton.count()) === 0) {
    await page.locator('[data-my-audits-role="all"]').click();
    await search.fill(id);
  }

  openButton = page.locator(`[data-open-database-audit="${id}"]`);
  await expect(
    openButton,
    `Expected My Audits to contain owned audit ${id}`,
  ).toHaveCount(1);

  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === `/api/audits/${encodeURIComponent(id)}`
    );
  });

  await openButton.click();
  const response = await responsePromise;
  expect(response.ok(), `GET /api/audits/${id} must succeed`).toBeTruthy();

  await expect
    .poll(async () => {
      const snapshot = await activeAuditSnapshot(page);
      return {
        id: snapshot?.id || null,
        persistenceAuditId: snapshot?.persistenceAuditId || null,
        hasRevision: Boolean(snapshot?.revisionId),
      };
    })
    .toEqual({
      id,
      persistenceAuditId: id,
      hasRevision: true,
    });

  await expect(page.locator("#page-overview.page.active")).toBeVisible();
}

export async function setOverview(page, name, description) {
  const nameInput = page.locator("#auditName");
  const purposeInput = page.locator("#auditPurpose");
  await nameInput.fill(name);
  await nameInput.blur();
  await purposeInput.fill(description);
  await purposeInput.blur();
  await expect(nameInput).toHaveValue(name);
  await expect(purposeInput).toHaveValue(description);
}

export async function attachJson(testInfo, name, value) {
  await testInfo.attach(name, {
    body: Buffer.from(JSON.stringify(value, null, 2)),
    contentType: "application/json",
  });
}
