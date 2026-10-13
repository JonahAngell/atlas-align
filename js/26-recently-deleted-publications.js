/** Phase 7 administrative publication soft-deletion UI. Classic script. */
const atlasDeletedPublicationsState = {
  auditId: null,
  active: [],
  deleted: [],
  generation: 0,
  returnFocus: null,
};
function atlasPublicationAdminSummary() {
  return window.ATLASWorkflow?.summary || null;
}
function atlasPublicationAdminCanDelete() {
  return Boolean(window.ATLASWorkflow?.can?.("canDeletePublication"));
}
function atlasPublicationAdminCard(p, deleted) {
  return `<article class="recent-publication-card" data-publication-id="${esc(p.id)}"><h3>Version ${esc(p.versionNumber)}: ${esc(p.versionTitle || "Untitled")}</h3><div class="recent-publication-lifecycle">${esc(p.deletionStatus)}</div><div class="recent-publication-meta"><div><span class="hint">Audit</span><div>${esc(p.auditName || p.auditId)}</div></div><div><span class="hint">Publisher</span><div>${esc(p.publisherUsername || "Unknown")}</div></div><div><span class="hint">Published</span><div>${p.publishedAt ? esc(new Date(p.publishedAt).toLocaleString()) : "Unknown"}</div></div>${deleted ? `<div><span class="hint">Deleted by</span><div>${esc(p.deletedByUsername || "Unknown")}</div></div><div><span class="hint">Deleted</span><div>${p.deletedAt ? esc(new Date(p.deletedAt).toLocaleString()) : "Unknown"}</div></div><div><span class="hint">Reason</span><div>${esc(p.deletionReason || "")}</div></div>` : ""}</div><div class="recent-publication-actions"><button class="btn secondary small" type="button" data-admin-view-publication="${esc(p.versionNumber)}">View snapshot</button>${!deleted && atlasPublicationAdminCanDelete() ? `<button class="btn danger small" type="button" data-admin-delete-publication="${esc(p.versionNumber)}">Send to Recently Deleted</button>` : ""}</div></article>`;
}
function atlasRenderPublicationAdministration() {
  const active = document.getElementById("atlasActivePublicationsList"),
    deleted = document.getElementById("atlasDeletedPublicationsList");
  if (active)
    active.innerHTML =
      atlasDeletedPublicationsState.active
        .map((p) => atlasPublicationAdminCard(p, false))
        .join("") || '<p class="hint">No Active publications.</p>';
  if (deleted)
    deleted.innerHTML =
      atlasDeletedPublicationsState.deleted
        .map((p) => atlasPublicationAdminCard(p, true))
        .join("") || '<p class="hint">No Recently Deleted publications.</p>';
  document
    .querySelector('[data-section="recently-deleted-publications"]')
    ?.toggleAttribute("hidden", !atlasPublicationAdminCanDelete());
}
async function atlasLoadPublicationAdministration() {
  if (!window.ATLASWorkflow?.feature?.("publicationDeletion")) return;
  const w = atlasPublicationAdminSummary(),
    auditId = w?.auditId;
  if (!auditId || !atlasPublicationAdminCanDelete()) return;
  const generation = ++atlasDeletedPublicationsState.generation;
  atlasDeletedPublicationsState.auditId = auditId;
  document.getElementById("atlasDeletedPublicationsStatus").textContent =
    "Loading publications…";
  try {
    const [a, d] = await Promise.all([
      atlasAuditApi(
        `/api/audits/${encodeURIComponent(auditId)}/publications?limit=100&lifecycle=Active`,
      ),
      atlasAuditApi(
        `/api/audits/${encodeURIComponent(auditId)}/publications?limit=100&lifecycle=${encodeURIComponent("Recently Deleted")}`,
      ),
    ]);
    if (
      generation !== atlasDeletedPublicationsState.generation ||
      auditId !== atlasDeletedPublicationsState.auditId
    )
      return;
    atlasDeletedPublicationsState.active = a.publications || [];
    atlasDeletedPublicationsState.deleted = d.publications || [];
    atlasRenderPublicationAdministration();
    document.getElementById("atlasDeletedPublicationsStatus").textContent =
      "Publication lifecycle records loaded.";
  } catch (e) {
    document.getElementById("atlasDeletedPublicationsStatus").textContent =
      e.message;
  }
}
async function atlasViewAdministrativePublication(version) {
  const p = await atlasAuditApi(
    `/api/audits/${encodeURIComponent(atlasDeletedPublicationsState.auditId)}/publications/${encodeURIComponent(version)}`,
  );
  atlasShowHistoryModal(
    `Publication version ${version}`,
    `<dl><dt>Deletion status</dt><dd>${esc(p.deletion_status || p.deletionStatus)}</dd><dt>Deleted by</dt><dd>${esc(p.deleted_by_username || p.deletedByUsername || "")}</dd><dt>Deleted at</dt><dd>${esc(p.deleted_at || p.deletedAt || "")}</dd><dt>Reason</dt><dd>${esc(p.deletion_reason || p.deletionReason || "")}</dd></dl><pre class="revision-json">${esc(JSON.stringify(p.snapshot, null, 2))}</pre>`,
  );
}
async function atlasConfirmPublicationDeletion(version, button) {
  const w = atlasPublicationAdminSummary(),
    p = atlasDeletedPublicationsState.active.find(
      (x) => Number(x.versionNumber) === Number(version),
    );
  if (!w || !p) return;
  const root = atlasShowHistoryModal(
    "Send publication to Recently Deleted",
    `<p><strong>${esc(state.audit?.name || w.auditId)}, publication v${esc(p.versionNumber)}</strong></p><p>This is a soft deletion. The immutable snapshot and version number remain retained. Phase 7 does not restore or permanently delete publications.</p><label>Deletion reason<textarea data-publication-deletion-reason required></textarea></label><label><input type="checkbox" data-publication-deletion-confirm> I confirm this publication should be sent to Recently Deleted.</label><button class="btn danger" type="button" data-confirm-publication-deletion>Send to Recently Deleted</button>`,
  );
  root
    .querySelector("[data-confirm-publication-deletion]")
    ?.addEventListener("click", async (e) => {
      const reason = root
          .querySelector("[data-publication-deletion-reason]")
          .value.trim(),
        confirmed = root.querySelector(
          "[data-publication-deletion-confirm]",
        ).checked;
      if (!reason || !confirmed)
        return status(
          "A deletion reason and explicit confirmation are required.",
          "bad",
        );
      const target = e.currentTarget;
      target.disabled = true;
      target.setAttribute("aria-busy", "true");
      try {
        await atlasAuditApi(
          `/api/audits/${encodeURIComponent(w.auditId)}/publications/${encodeURIComponent(version)}`,
          {
            method: "DELETE",
            body: JSON.stringify({
              expectedPublicationId: p.id,
              expectedRevisionId: w.currentRevisionId,
              confirmation: true,
              reason,
            }),
          },
        );
        atlasHistoryClose();
        await window.ATLASWorkflow?.refresh?.();
        await atlasLoadPublicationAdministration();
        await window.ATLASHistory?.refresh?.(false);
        status(`Publication v${version} was sent to Recently Deleted.`, "ok");
      } catch (error) {
        target.disabled = false;
        target.removeAttribute("aria-busy");
        status(
          error.status === 409
            ? `${error.message} Refresh and review the publication again.`
            : error.message,
          "bad",
        );
      }
    });
}
document.addEventListener("click", (e) => {
  const view = e.target.closest("[data-admin-view-publication]"),
    del = e.target.closest("[data-admin-delete-publication]");
  if (view)
    atlasViewAdministrativePublication(view.dataset.adminViewPublication).catch(
      (x) => status(x.message, "bad"),
    );
  if (del)
    atlasConfirmPublicationDeletion(
      del.dataset.adminDeletePublication,
      del,
    ).catch((x) => status(x.message, "bad"));
});
document
  .getElementById("atlasDeletedPublicationsRefresh")
  ?.addEventListener("click", () => atlasLoadPublicationAdministration());
const atlasShowSectionBeforePublicationAdministration = showSection;
showSection = function (section) {
  atlasShowSectionBeforePublicationAdministration(section);
  if (pageForSection(section) === "recently-deleted-publications")
    atlasLoadPublicationAdministration();
};
window.ATLASPublicationAdministration = {
  refresh: atlasLoadPublicationAdministration,
  render: atlasRenderPublicationAdministration,
};
