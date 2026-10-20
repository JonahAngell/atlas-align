/* Phase 5 recipient-isolated Inbox UI. Classic script. */
(function () {
  let items = [],
    beforeId = null,
    filter = "all",
    loading = false;
  const escText = (v) =>
    typeof esc === "function" ? esc(String(v ?? "")) : String(v ?? "");
  let countGeneration = 0;
  async function refreshUnreadCount() {
    const generation = ++countGeneration;
    try {
      const payload = await atlasAuditApi("/api/inbox/unread-count");
      if (generation !== countGeneration) return;
      const count = Number(payload?.unreadCount),
        button = document.getElementById("atlasTopbarInbox"),
        badge = document.getElementById("atlasTopbarInboxBadge");
      if (!button || !badge || !Number.isFinite(count) || count < 0) return;
      button.setAttribute(
        "aria-label",
        count
          ? `Inbox, ${count} unread message${count === 1 ? "" : "s"}`
          : "Inbox, no unread messages",
      );
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.hidden = count === 0;
      document.querySelectorAll("[data-atlas-inbox-count]").forEach((node) => {
        node.textContent = count > 99 ? "99+" : String(count);
        node.hidden = count === 0;
      });
    } catch (_error) {
      document
        .getElementById("atlasTopbarInbox")
        ?.setAttribute("aria-label", "Inbox, unread count unavailable");
      const badge = document.getElementById("atlasTopbarInboxBadge");
      if (badge) badge.hidden = true;
    }
  }
  function matches(i) {
    if (filter === "unread") return i.readState === "Unread";
    if (filter === "actionable") return i.itemStatus === "Actionable";
    if (filter === "history") return i.itemStatus !== "Actionable";
    return true;
  }
  function workflowLabel(value) {
    const labels = {
      "Pending Approval": "Submitted for Review",
      Published: "Complete",
      "Draft Revision": "Draft Revision",
    };
    return labels[value] || value || "Workflow update";
  }
  function reviewCounts(item) {
    const counts = item.displayMetadata?.counts;
    if (!counts || typeof counts !== "object") return "";
    const values = [
      ["Changes Requested", counts.requestChanges],
      ["Needs Discussion", counts.needsDiscussion],
      ["Review Required", counts.reviewRequired],
    ].filter(
      ([, value]) => Number.isFinite(Number(value)) && Number(value) >= 0,
    );
    return values.length
      ? `<ul class="inbox-review-counts" aria-label="Review Progress">${values.map(([label, value]) => `<li><strong>${Number(value)}</strong><span>${label}</span></li>`).join("")}</ul>`
      : "";
  }
  function itemMessage(item) {
    const meta = item.displayMetadata || {};
    if (item.itemType === "Approval Request")
      return meta.message || "Review and decide the submitted audit revision.";
    if (item.itemType === "Returned Review") {
      const counts = meta.counts || {};
      return `Returned with ${Number(counts.requestChanges || 0)} requested change${Number(counts.requestChanges || 0) === 1 ? "" : "s"} and ${Number(counts.needsDiscussion || 0)} discussion item${Number(counts.needsDiscussion || 0) === 1 ? "" : "s"}.`;
    }
    if (meta.decision) return `Approval decision: ${meta.decision}.`;
    return meta.summary || "Open this workflow message for details.";
  }
  function render() {
    const host = document.getElementById("atlasInboxList");
    if (!host) return;
    const visible = items.filter(matches);
    const actionable = items.filter(
      (item) => item.itemStatus === "Actionable",
    ).length;
    const unread = items.filter((item) => item.readState === "Unread").length;
    const countEl = document.getElementById("atlasInboxCounts");
    if (countEl)
      countEl.textContent = `${actionable} action required · ${unread} unread`;
    host.innerHTML = visible.length
      ? visible
          .map((i) => {
            const unreadItem = i.readState === "Unread";
            const sender =
              i.senderUsername || i.approverUsername || "ATLAS workflow";
            return `<article class="inbox-item inbox-message-card" data-read-state="${escText(i.readState)}" data-item-status="${escText(i.itemStatus)}" data-audit-id="${escText(i.auditId)}" data-request-id="${escText(i.approvalRequestId)}"><div class="inbox-card-heading"><span class="inbox-unread-dot" aria-hidden="true"></span><span class="sr-only">${unreadItem ? "Unread message. " : "Read message. "}</span><span class="inbox-workflow-badge">${escText(workflowLabel(i.workflowStatus || i.itemStatus))}</span></div><h2 class="inbox-item-title">${escText(i.auditName || "Audit workflow message")}</h2><p class="inbox-sender">From ${escText(sender)}</p><p class="inbox-message">${escText(itemMessage(i))}</p>${reviewCounts(i)}<div class="inbox-card-footer"><span class="inbox-item-meta">${escText(i.createdAt || "")}</span>${i.itemStatus === "Actionable" || i.itemType === "Returned Review" ? `<button class="btn secondary" data-open-inbox-item="${escText(i.id)}" type="button" aria-label="Open ${escText(i.itemType)} for ${escText(i.auditName || "audit")}">Open</button>` : `<span class="hint">Historical</span>`}</div></article>`;
          })
          .join("")
      : '<p class="hint">No messages match this filter.</p>';
    document.getElementById("atlasInboxMore").hidden = items.length < 50;
  }
  async function load(reset = true) {
    if (loading) return;
    loading = true;
    const statusEl = document.getElementById("atlasInboxStatus");
    if (statusEl) statusEl.textContent = "Loading Inbox…";
    try {
      if (reset) {
        items = [];
        beforeId = null;
      }
      const q = beforeId
        ? `?limit=50&beforeId=${encodeURIComponent(beforeId)}`
        : "?limit=50";
      const payload = await atlasAuditApi(`/api/inbox${q}`);
      const batch = Array.isArray(payload?.items) ? payload.items : [];
      items.push(...batch);
      beforeId = batch.length ? batch[batch.length - 1].id : beforeId;
      render();
      if (statusEl)
        statusEl.textContent = `${items.length} message${items.length === 1 ? "" : "s"} loaded.`;
      refreshUnreadCount();
    } catch (error) {
      if (statusEl) statusEl.textContent = error.message;
    } finally {
      loading = false;
    }
  }
  let openGeneration = 0;
  async function open(id, button) {
    const generation = ++openGeneration;
    const item = items.find((x) => String(x.id) === String(id));
    if (!item)
      throw new Error("Inbox item is no longer available. Refresh the Inbox.");
    if (item.itemStatus !== "Actionable" && item.itemType !== "Returned Review")
      throw new Error(
        "This Inbox item is historical and is no longer actionable.",
      );
    const original = button?.textContent || "Open";
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = "Opening...";
    }
    const statusEl = document.getElementById("atlasInboxStatus");
    if (statusEl) statusEl.textContent = "Opening approval review...";
    try {
      if (item.readState !== "Read") {
        const marked = await atlasAuditApi(
          `/api/inbox/${encodeURIComponent(id)}/read`,
          { method: "POST", body: "{}" },
        );
        if (generation !== openGeneration) return;
        if (marked) item.readState = "Read";
        render();
        refreshUnreadCount();
      }
      if (
        item.itemType === "Returned Review" &&
        item.displayMetadata?.reviewSessionId
      ) {
        await window.ATLASAuditReview?.openReturnedFeedback?.(
          item.displayMetadata.reviewSessionId,
        );
      } else {
        await window.ATLASWorkflow?.showApprovalReview?.("view", {
          inboxItemId: Number(item.id),
          auditId: item.auditId,
          requestId: Number(item.approvalRequestId),
        });
      }
      if (generation !== openGeneration) return;
      if (statusEl) statusEl.textContent = "Approval review opened.";
    } catch (error) {
      if (generation !== openGeneration || error.name === "AbortError") return;
      if (statusEl)
        statusEl.textContent = `${error.message} Refresh the Inbox and try again.`;
      throw error;
    } finally {
      if (generation === openGeneration && button?.isConnected) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        button.textContent = original;
      }
    }
  }
  document.addEventListener("click", (e) => {
    const f = e.target.closest("[data-inbox-filter]");
    if (f) {
      filter = f.dataset.inboxFilter;
      document
        .querySelectorAll("[data-inbox-filter]")
        .forEach(
          (x) =>
            (x.className = `btn small ${x === f ? "primary" : "secondary"}`),
        );
      render();
      return;
    }
    const o = e.target.closest("[data-open-inbox-item]");
    if (o)
      open(o.dataset.openInboxItem, o).catch((error) =>
        status(error.message, "bad"),
      );
  });
  document
    .getElementById("atlasInboxRefresh")
    ?.addEventListener("click", () => load(true));
  document
    .getElementById("atlasInboxMore")
    ?.addEventListener("click", () => load(false));
  document
    .getElementById("atlasTopbarInbox")
    ?.addEventListener("click", () => showSection("inbox"));
  window.ATLASInbox = { refresh: () => load(true), refreshUnreadCount };
  refreshUnreadCount();
  load(true);
})();
