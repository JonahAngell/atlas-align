/** Audit-level and step-level immutable revision history UI. */
function atlasHistoryClose() {
  const modal = document.querySelector(".audit-history-backdrop");
  const returnTarget = modal?._atlasReturnFocus;
  modal?.remove();
  returnTarget?.focus?.();
}
function atlasJsonLines(value) {
  return JSON.stringify(value, null, 2).split("\n");
}
function atlasSimpleDiff(before, after) {
  const a = atlasJsonLines(before),
    b = atlasJsonLines(after),
    max = Math.max(a.length, b.length),
    rows = [];
  for (let i = 0; i < max; i++) {
    const left = a[i] || "",
      right = b[i] || "";
    if (left !== right)
      rows.push(
        `<tr><td>${i + 1}</td><td><pre>${esc(left)}</pre></td><td><pre>${esc(right)}</pre></td></tr>`,
      );
  }
  return rows.length
    ? `<table class="revision-diff"><thead><tr><th>Line</th><th>Earlier</th><th>Later/current</th></tr></thead><tbody>${rows.join("")}</tbody></table>`
    : "<p>No differences.</p>";
}

function atlasStructuredComparisonHtml(comparison) {
  if (!comparison?.hasChanges) return "<p>No differences found.</p>";
  const sections = [];
  const add = (title, items) => {
    if (Array.isArray(items) && items.length)
      sections.push(
        `<section class="revision-comparison-group"><h3>${esc(title)}</h3><pre>${esc(JSON.stringify(items, null, 2))}</pre></section>`,
      );
  };
  add("Overview", comparison.changes?.overview);
  add("Assignments", comparison.changes?.assignments);
  add("Sources", comparison.changes?.sources);
  add("Fields", comparison.changes?.fields);
  add("Display Fields", comparison.changes?.displayFields);
  if (comparison.changes?.steps)
    for (const [key, value] of Object.entries(comparison.changes.steps))
      add(`Steps: ${key}`, value);
  add("Step", comparison.changes?.step);
  add("Attachment references", comparison.changes?.attachments);
  return `${sections.join("")}<details><summary>Technical comparison metadata</summary><pre>${esc(JSON.stringify({ before: comparison.before, after: comparison.after, summary: comparison.summary }, null, 2))}</pre></details>`;
}

async function atlasCommitRestoration(button, work) {
  if (button?.matches('[aria-busy="true"]')) return;
  const original = button?.textContent || "Restore";
  if (button) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Restoring...";
  }
  try {
    await work();
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.textContent = original;
    }
    status(
      error.status === 409
        ? `${error.message} Refresh the audit and generate a new preview.`
        : error.message,
      "bad",
    );
  }
}

function atlasShowHistoryModal(title, content) {
  atlasHistoryClose();
  const root = document.createElement("div");
  root.className = "audit-history-backdrop";
  root._atlasReturnFocus = document.activeElement;
  root.innerHTML = `<section class="audit-history-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button class="btn ghost" type="button" data-close-history>Close</button></header><div class="audit-history-content">${content}</div></section>`;
  document.body.append(root);
  root.querySelector("[data-close-history]")?.focus();
  root.addEventListener("click", (e) => {
    if (e.target === root || e.target.closest("[data-close-history]"))
      atlasHistoryClose();
  });
  return root;
}
async function atlasOpenAuditHistory() {
  if (!state.auditPersistence.auditId)
    return status("Save this audit before opening version history.", "warn");
  const payload = await atlasAuditApi(
    `/api/audits/${encodeURIComponent(state.audit.id)}/revisions`,
  );
  const rows = payload.revisions
    .map(
      (r) =>
        `<tr><td>${r.number}</td><td>${esc(r.changeType)}</td><td>${esc(r.changeSummary || "")}</td><td>${esc(r.createdByFullName || r.createdByUsername)}</td><td>${new Date(r.createdAt).toLocaleString()}</td><td><button class="btn secondary small" data-view-audit-revision="${esc(r.id)}">View</button> <button class="btn secondary small" data-compare-audit-revision="${esc(r.id)}">Compare</button> <button class="btn danger small" data-restore-audit-revision="${esc(r.id)}">Restore</button></td></tr>`,
    )
    .join("");
  const root = atlasShowHistoryModal(
    `Version History: ${state.audit.name}`,
    `<table class="revision-table"><thead><tr><th>Revision</th><th>Type</th><th>Summary</th><th>Saved by</th><th>Saved at</th><th>Actions</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No revisions.</td></tr>'}</tbody></table>`,
  );
  root.addEventListener("click", async (e) => {
    const view = e.target.closest("[data-view-audit-revision]");
    const compare = e.target.closest("[data-compare-audit-revision]");
    const restore = e.target.closest("[data-restore-audit-revision]");
    if (view)
      await atlasViewAuditRevision(view.dataset.viewAuditRevision, false);
    if (compare)
      await atlasViewAuditRevision(compare.dataset.compareAuditRevision, true);
    if (restore)
      await atlasRestoreAuditRevision(restore.dataset.restoreAuditRevision);
  });
}
async function atlasViewAuditRevision(id, compare) {
  if (!compare) {
    const revision = await atlasAuditApi(
      `/api/audits/${encodeURIComponent(state.audit.id)}/revisions/${id}`,
    );
    return atlasShowHistoryModal(
      `Audit revision ${revision.number}`,
      `<pre class="revision-json">${esc(JSON.stringify(revision.document, null, 2))}</pre>`,
    );
  }
  const comparison = await atlasAuditApi(
    `/api/audits/${encodeURIComponent(state.audit.id)}/previews/revisions/${id}`,
  );
  atlasShowHistoryModal(
    "Audit revision comparison",
    atlasStructuredComparisonHtml(comparison),
  );
}

async function atlasRestoreAuditRevision(id) {
  const preview = await atlasAuditApi(
    `/api/audits/${encodeURIComponent(state.audit.id)}/previews/revisions/${id}/restoration`,
  );
  const root = atlasShowHistoryModal(
    "Restore audit revision",
    `${atlasStructuredComparisonHtml(preview)}<button class="btn primary" type="button" data-confirm-audit-restore>Restore reviewed revision</button>`,
  );
  root
    .querySelector("[data-confirm-audit-restore]")
    ?.addEventListener("click", async (event) =>
      atlasCommitRestoration(event.currentTarget, async () => {
        const payload = await atlasAuditApi(
          `/api/audits/${encodeURIComponent(state.audit.id)}/revisions/${id}/restore`,
          {
            method: "POST",
            body: JSON.stringify({
              expectedRevisionId: preview.restoration.currentRevisionId,
              previewToken: preview.restoration.previewToken,
            }),
          },
        );
        atlasApplyLoadedAudit(payload);
        atlasHistoryClose();
        status(
          preview.hasChanges
            ? `Restored audit revision ${payload.revision.number}.`
            : "The selected revision already matches the current audit.",
          "ok",
        );
      }),
    );
}

async function atlasOpenStepHistory() {
  const step = state.audit.steps?.find(
    (item) => item.id === state.selectedStepId,
  );
  if (!step) return status("Select a step first.", "warn");
  if (!state.auditPersistence.auditId)
    return status("Save this audit before opening step history.", "warn");
  const payload = await atlasAuditApi(
    `/api/audits/${encodeURIComponent(state.audit.id)}/steps/${encodeURIComponent(step.id)}/revisions`,
  );
  const rows = payload.revisions
    .map(
      (r) =>
        `<tr><td>${r.number}</td><td>${esc(r.operation)}</td><td>${esc(r.changeSummary || "")}</td><td>${esc(r.createdByFullName || r.createdByUsername)}</td><td>${new Date(r.createdAt).toLocaleString()}</td><td><button class="btn secondary small" data-compare-step-revision="${esc(r.id)}">Compare</button> <button class="btn danger small" data-restore-step-revision="${esc(r.id)}">Restore</button></td></tr>`,
    )
    .join("");
  const root = atlasShowHistoryModal(
    `Step History: ${step.title || step.id}`,
    `<table class="revision-table"><thead><tr><th>Revision</th><th>Operation</th><th>Summary</th><th>Changed by</th><th>Changed at</th><th>Actions</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No step revisions.</td></tr>'}</tbody></table>`,
  );
  root.addEventListener("click", async (e) => {
    const compare = e.target.closest("[data-compare-step-revision]");
    const restore = e.target.closest("[data-restore-step-revision]");
    if (compare)
      await atlasCompareStepRevision(step, compare.dataset.compareStepRevision);
    if (restore)
      await atlasRestoreStepRevision(step, restore.dataset.restoreStepRevision);
  });
}
async function atlasCompareStepRevision(current, id) {
  const comparison = await atlasAuditApi(
    `/api/audits/${encodeURIComponent(state.audit.id)}/previews/steps/${encodeURIComponent(current.id)}/revisions/${id}/restoration`,
  );
  atlasShowHistoryModal(
    "Step revision comparison",
    atlasStructuredComparisonHtml(comparison),
  );
}

async function atlasRestoreStepRevision(step, id) {
  const preview = await atlasAuditApi(
    `/api/audits/${encodeURIComponent(state.audit.id)}/previews/steps/${encodeURIComponent(step.id)}/revisions/${id}/restoration`,
  );
  const adjustment = preview.restoration.placementAdjustment
    ? `<p class="revision-warning">The former parent is unavailable. This step will be restored at the audit root.</p>`
    : "";
  const root = atlasShowHistoryModal(
    "Restore step revision",
    `${adjustment}${atlasStructuredComparisonHtml(preview)}<button class="btn primary" type="button" data-confirm-step-restore>Restore reviewed step</button>`,
  );
  root
    .querySelector("[data-confirm-step-restore]")
    ?.addEventListener("click", async (event) =>
      atlasCommitRestoration(event.currentTarget, async () => {
        const payload = await atlasAuditApi(
          `/api/audits/${encodeURIComponent(state.audit.id)}/steps/${encodeURIComponent(step.id)}/revisions/${id}/restore`,
          {
            method: "POST",
            body: JSON.stringify({
              expectedRevisionId: preview.restoration.currentRevisionId,
              previewToken: preview.restoration.previewToken,
            }),
          },
        );
        atlasApplyLoadedAudit(payload);
        atlasHistoryClose();
        status(
          preview.hasChanges
            ? `Restored step in audit revision ${payload.revision.number}.`
            : "The selected step already matches the current step.",
          "ok",
        );
      }),
    );
}

function atlasOpenConflictDialog(error) {
  atlasShowHistoryModal(
    "Save conflict",
    `<div class="revision-warning"><strong>A newer database revision exists.</strong><p>${esc(error.message)}</p><button class="btn primary" type="button" data-load-latest>Load latest revision</button> <button class="btn secondary" type="button" data-download-conflict>Download my draft JSON</button></div>`,
  );
  document
    .querySelector("[data-load-latest]")
    ?.addEventListener("click", async () => {
      await atlasLoadDatabaseAudit(state.audit.id);
      atlasHistoryClose();
      status("Loaded the latest database revision.", "ok");
    });
  document
    .querySelector("[data-download-conflict]")
    ?.addEventListener("click", () => exportCurrent?.());
}
