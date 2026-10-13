/* Phase 5 browser workflow and published-lock coordinator. Classic script. */
let atlasWorkflowSummary = null;
let atlasWorkflowAuditId = null;
let atlasWorkflowFeatures = Object.freeze({});
let atlasWorkflowLoadState = "idle";
let atlasWorkflowLoadError = null;
let atlasWorkflowLoadSequence = 0;
function atlasWorkflowFeature(name) {
  return Boolean(atlasWorkflowFeatures?.[name]);
}
function atlasApplyWorkflowFeatureVisibility() {
  const pageFlags = {
    inbox: "reads",
    history: "history",
    "recently-deleted-publications": "publicationDeletion",
  };
  for (const [section, flag] of Object.entries(pageFlags))
    document
      .querySelector(`[data-section="${section}"]`)
      ?.toggleAttribute("hidden", !atlasWorkflowFeature(flag));
}
function atlasActiveAuditId() {
  if (window.ATLASAuditReview?.isActive?.()) {
    const reviewAuditId = String(
      window.ATLASAuditReview?.context?.()?.auditId || "",
    ).trim();
    return reviewAuditId || null;
  }
  const persistence = state?.auditPersistence;
  const persistedAuditId = state?.auditPersistence?.auditId;
  if (!persistedAuditId || !persistence?.revisionId) return null;
  return persistedAuditId;
}
function atlasAuditIsPublishedLocked() {
  return Boolean(
    atlasWorkflowSummary &&
    atlasWorkflowSummary.auditId === atlasActiveAuditId() &&
    atlasWorkflowSummary.workflowStatus === "Published" &&
    atlasWorkflowSummary.publishedLocked,
  );
}
function atlasAuditIsWorkflowLocked() {
  if (window.ATLASAuditReview?.isActive?.()) return true;
  const summaryCurrent =
    atlasWorkflowSummary &&
    atlasWorkflowSummary.auditId === atlasActiveAuditId();
  if (summaryCurrent)
    return Boolean(
      atlasWorkflowSummary.workflowStatus === "Pending Approval" ||
      atlasAuditIsPublishedLocked() ||
      !atlasWorkflowCan("canEdit"),
    );
  return Boolean(
    state.auditPersistence?.auditId === atlasActiveAuditId() &&
    state.auditPersistence?.access &&
    !state.auditPersistence.access.canEdit,
  );
}
function atlasWorkflowCan(name) {
  return Boolean(atlasWorkflowSummary?.capabilities?.[name]);
}
async function atlasLoadWorkflowSummary() {
  const auditId = atlasActiveAuditId();
  const sequence = ++atlasWorkflowLoadSequence;
  if (!auditId) {
    atlasWorkflowSummary = null;
    atlasWorkflowAuditId = null;
    atlasWorkflowLoadState = "idle";
    atlasWorkflowLoadError = null;
    atlasRenderWorkflowCard();
    atlasApplyPublishedLock();
    return null;
  }
  atlasWorkflowSummary = null;
  atlasWorkflowAuditId = auditId;
  atlasWorkflowLoadState = "loading";
  atlasWorkflowLoadError = null;
  atlasRenderWorkflowCard();
  atlasApplyPublishedLock();
  try {
    const summary = await atlasAuditApi(
      `/api/audits/${encodeURIComponent(auditId)}/workflow`,
    );
    if (
      sequence !== atlasWorkflowLoadSequence ||
      auditId !== atlasActiveAuditId()
    )
      return null;
    atlasWorkflowSummary = summary;
    atlasWorkflowFeatures = Object.freeze({ ...(summary.features || {}) });
    atlasWorkflowAuditId = auditId;
    atlasWorkflowLoadState = "ready";
    atlasApplyWorkflowFeatureVisibility();
    atlasRenderWorkflowCard();
    atlasRenderPublicationFlow();
    atlasApplyPublishedLock();
    return summary;
  } catch (error) {
    if (
      sequence !== atlasWorkflowLoadSequence ||
      auditId !== atlasActiveAuditId()
    )
      return null;
    atlasWorkflowSummary = null;
    atlasWorkflowAuditId = auditId;
    atlasWorkflowLoadError = error;
    atlasWorkflowLoadState = error.status === 403 ? "unavailable" : "error";
    atlasRenderWorkflowCard();
    atlasRenderPublicationFlow();
    atlasApplyPublishedLock();
    status(error.message, "bad");
    return null;
  }
}
function atlasWorkflowText(value, fallback = "Not available") {
  return value == null || value === "" ? fallback : String(value);
}
function atlasRenderWorkflowCard() {
  const host = document.getElementById("atlasWorkflowCardBody");
  if (!host) return;
  const activeAuditId = atlasActiveAuditId();
  const w = atlasWorkflowSummary;
  if (
    atlasWorkflowAuditId === activeAuditId &&
    atlasWorkflowLoadState === "loading"
  ) {
    host.innerHTML = '<p class="hint" role="status">Loading workflow...</p>';
    return;
  }
  if (
    atlasWorkflowAuditId === activeAuditId &&
    atlasWorkflowLoadState === "unavailable"
  ) {
    host.innerHTML = `<p class="hint" role="status">Workflow is unavailable. ${esc(atlasWorkflowLoadError?.message || "This workflow feature is not enabled.")}</p>`;
    return;
  }
  if (
    atlasWorkflowAuditId === activeAuditId &&
    atlasWorkflowLoadState === "error"
  ) {
    host.innerHTML = `<p class="hint" role="status">Workflow could not be loaded. ${esc(atlasWorkflowLoadError?.message || "Try Refresh again.")}</p>`;
    return;
  }
  if (!w || w.auditId !== activeAuditId) {
    host.innerHTML =
      '<p class="hint">Load a database audit to view workflow details.</p>';
    return;
  }
  const analysts =
    state.audit?.assignments?.assignedAnalysts ||
    state.audit?.assignments?.assigned ||
    [];
  const analystNames =
    analysts
      .map((a) => a.fullName || a.displayName || a.username)
      .filter(Boolean)
      .join(", ") || "None assigned";
  host.innerHTML = `<div class="workflow-grid">
    <div><span class="hint">State</span><div class="workflow-value">${esc(w.workflowStatus)}</div></div>
    <div><span class="hint">Assigned Analysts</span><div class="workflow-value">${esc(analystNames)}</div></div>
    <div><span class="hint">Working revision</span><div class="workflow-value">${esc(w.currentRevisionNumber)} (ID ${esc(w.currentRevisionId)})</div></div>
    <div><span class="hint">Pending request</span><div class="workflow-value">${esc(atlasWorkflowText(w.currentRequestId))}</div></div>
    <div><span class="hint">Approval</span><div class="workflow-value">${esc(atlasWorkflowText(w.currentApprovalId))}</div></div>
    <div><span class="hint">Publication</span><div class="workflow-value">${esc(atlasWorkflowText(w.currentPublicationId))}</div></div>
    <div><span class="hint">Unpublished changes</span><div class="workflow-value">${w.workingFromPublicationId ? "Yes" : "No"}</div></div>
  </div><div class="workflow-actions">
    ${atlasWorkflowCan("canSubmit") ? '<button class="btn primary" data-workflow-action="submit" type="button">Submit for Approval</button>' : ""}
    ${atlasWorkflowCan("canViewApprovalRequest") && w.currentRequestId ? '<button class="btn secondary" data-workflow-action="view-request" type="button">View Approval Request</button>' : ""}
    ${atlasWorkflowCan("canRescindApprovalRequest") && w.currentRequestId ? '<button class="btn danger" data-workflow-action="rescind" type="button">Rescind Approval Request</button>' : ""}
    ${atlasWorkflowCan("canApprove") && w.currentRequestId ? '<button class="btn primary" data-workflow-action="approve" type="button">Approve Audit</button><button class="btn danger" data-workflow-action="return" type="button">Return to Analyst</button>' : ""}
    ${atlasWorkflowCan("canPublish") ? '<button class="btn primary" data-workflow-action="publish" type="button">Publish Version</button>' : ""}
    ${atlasWorkflowCan("canUnlock") ? '<button class="btn secondary" data-workflow-action="unlock" type="button">Unlock Audit</button>' : ""}
    ${atlasWorkflowCan("canViewHistory") ? '<button class="btn secondary" data-workflow-action="history" type="button">View Audit History</button><button class="btn secondary" data-workflow-action="publications" type="button">View Published Versions</button>' : ""}
    ${atlasWorkflowCan("canDeletePublication") ? '<button class="btn secondary" data-workflow-action="deleted-publications" type="button">Administer Deleted Publications</button>' : ""}
  </div>`;
}
function atlasWorkflowDialog(title, body, actions = "") {
  const host =
    document.getElementById("atlasWorkflowDialogHost") || document.body;
  const previous = document.activeElement;
  const wrap = document.createElement("div");
  wrap.className = "workflow-dialog-backdrop";
  wrap.innerHTML = `<section class="workflow-dialog" role="dialog" aria-modal="true" aria-labelledby="atlasWorkflowDialogTitle"><h2 id="atlasWorkflowDialogTitle">${esc(title)}</h2><div>${body}</div><div class="workflow-dialog-actions">${actions}<button class="btn secondary" data-close-workflow-dialog type="button">Close</button></div></section>`;
  host.appendChild(wrap);
  const close = () => {
    wrap.remove();
    previous?.focus?.();
  };
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.closest("[data-close-workflow-dialog]"))
      close();
  });
  wrap.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  wrap.querySelector("input,textarea,select,button")?.focus();
  return { wrap, close };
}
let atlasApprovalReviewGeneration = 0;
function atlasApprovalReviewContext(context = {}) {
  const auditId = String(context.auditId || "").trim();
  const requestId = Number(context.requestId);
  const inboxItemId =
    context.inboxItemId == null ? null : Number(context.inboxItemId);
  if (!auditId || !Number.isSafeInteger(requestId) || requestId <= 0)
    throw new Error(
      "The approval review identity is invalid. Refresh and try again.",
    );
  return { auditId, requestId, inboxItemId };
}
async function atlasWorkflowPreviewRequest(context = null, options = {}) {
  let bound = context;
  if (!bound) {
    const w = await atlasLoadWorkflowSummary();
    if (!w?.currentRequestId)
      throw new Error("No current approval request is available.");
    bound = { auditId: w.auditId, requestId: w.currentRequestId };
  }
  bound = atlasApprovalReviewContext(bound);
  const path = bound.inboxItemId
    ? `/api/inbox/${encodeURIComponent(bound.inboxItemId)}/approval-review`
    : `/api/audits/${encodeURIComponent(bound.auditId)}/previews/approval-requests/${encodeURIComponent(bound.requestId)}`;
  return atlasAuditApi(path, { signal: options.signal });
}
async function atlasShowApprovalReview(mode = "view", context = null) {
  if (mode === "view" && window.ATLASAuditReview?.open) {
    const activeGeneration = ++atlasApprovalReviewGeneration;
    let bound = context;
    if (!bound) {
      const workflow = await atlasLoadWorkflowSummary();
      if (activeGeneration !== atlasApprovalReviewGeneration)
        throw Object.assign(
          new Error("Review was superseded by a newer selection."),
          { name: "AbortError" },
        );
      if (!workflow?.auditId || !workflow?.currentRequestId)
        throw new Error("No current approval request is available.");
      bound = {
        auditId: workflow.auditId,
        requestId: workflow.currentRequestId,
      };
    }
    bound = atlasApprovalReviewContext(bound);
    if (bound.inboxItemId) {
      const preview = await atlasWorkflowPreviewRequest(bound);
      if (activeGeneration !== atlasApprovalReviewGeneration)
        throw Object.assign(
          new Error("Review was superseded by a newer selection."),
          { name: "AbortError" },
        );
      const validated = atlasApprovalReviewContext({
        ...(preview.review || {}),
        inboxItemId: preview.inboxItemId,
      });
      if (
        validated.inboxItemId !== bound.inboxItemId ||
        validated.auditId !== bound.auditId ||
        validated.requestId !== bound.requestId ||
        Number(preview.review?.submittedRevisionId) !==
          Number(preview.submittedRevision?.id)
      )
        throw new Error(
          "The Inbox review identity no longer matches this request. Refresh the Inbox and try again.",
        );
      bound = {
        ...validated,
        submittedRevisionId: Number(preview.review.submittedRevisionId),
      };
    }
    const opened = await window.ATLASAuditReview.open(bound);
    if (activeGeneration !== atlasApprovalReviewGeneration) {
      const current = window.ATLASAuditReview.context?.();
      if (
        opened &&
        current?.auditId === bound.auditId &&
        Number(current?.requestId) === Number(bound.requestId)
      )
        await window.ATLASAuditReview.close({
          saveDraft: false,
          restoreFocus: false,
        });
      throw Object.assign(
        new Error("Review was superseded by a newer selection."),
        { name: "AbortError" },
      );
    }
    return opened;
  }
  const generation = ++atlasApprovalReviewGeneration;
  const controller = new AbortController();
  const p = await atlasWorkflowPreviewRequest(context, {
    signal: controller.signal,
  });
  if (generation !== atlasApprovalReviewGeneration)
    throw Object.assign(
      new Error("Review was superseded by a newer selection."),
      { name: "AbortError" },
    );
  const bound = atlasApprovalReviewContext(p.review || context);
  const comparison =
    typeof atlasStructuredComparisonHtml === "function"
      ? atlasStructuredComparisonHtml(p)
      : `<pre>${esc(JSON.stringify(p, null, 2))}</pre>`;
  if (
    !p.submittedRevision?.document ||
    Number(p.review?.submittedRevisionId) !== Number(p.submittedRevision?.id)
  )
    throw new Error(
      "The submitted revision could not be validated for this request.",
    );
  const submitted = `<details><summary>Inspect submitted revision</summary><pre class="publication-snapshot">${esc(JSON.stringify(p.submittedRevision.document, null, 2))}</pre></details>`;
  const response =
    mode === "view"
      ? ""
      : `<label>${mode === "deny" ? "Denial response (required)" : "Reviewer comments"}<textarea id="atlasReviewerResponse" ${mode === "deny" ? "required" : ""}></textarea></label>`;
  const action =
    mode === "view"
      ? ""
      : `<button class="btn ${mode === "deny" ? "danger" : "primary"}" data-confirm-decision="${mode}" type="button">${mode === "deny" ? "Deny" : "Approve"}</button>`;
  const dialog = atlasWorkflowDialog(
    "Approval request review",
    `<p class="hint">Submitted revision ${esc(p.submittedRevision.number)}</p>${comparison}${submitted}${response}`,
    action,
  );
  dialog.wrap
    .querySelector("[data-confirm-decision]")
    ?.addEventListener("click", async (e) => {
      const text =
        dialog.wrap.querySelector("#atlasReviewerResponse")?.value.trim() || "";
      if (mode === "deny" && !text)
        return status("A denial response is required.", "bad");
      e.currentTarget.disabled = true;
      try {
        await atlasAuditApi(
          `/api/audits/${encodeURIComponent(bound.auditId)}/approval-requests/${encodeURIComponent(bound.requestId)}/${mode}`,
          {
            method: "POST",
            body: JSON.stringify({
              expectedRevisionId: p.review.currentRevisionId,
              reviewerResponse: text,
            }),
          },
        );
        dialog.close();
        if (bound.auditId === atlasActiveAuditId())
          await atlasLoadWorkflowSummary();
        window.ATLASInbox?.refresh?.();
        status(`Request ${mode === "approve" ? "approved" : "denied"}.`, "ok");
      } catch (error) {
        e.currentTarget.disabled = false;
        status(error.message, "bad");
      }
    });
  return dialog;
}
function atlasApproverPickerEntry(user) {
  const name = String(user.fullName || user.username || "Unknown user");
  return {
    key: String(user.id || user.username),
    label: name,
    rawName: user.username,
    sourceKey: "approvers",
    sourceLabel: "Eligible approvers",
    sourceColor: "#4f6fad",
    avatar: user.avatar,
    initials:
      typeof atlasUserInitials === "function"
        ? atlasUserInitials(user)
        : name.slice(0, 2).toUpperCase(),
    detail: user.username,
    badge: user.eligible ? "Approver" : "Ineligible",
    disabled: !user.eligible,
    disabledReason: user.ineligibilityReason,
    user,
  };
}
async function atlasLoadApproverCandidates(auditId, query = "") {
  const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
  const payload = await atlasAuditApi(
    `/api/audits/${encodeURIComponent(auditId)}/approver-candidates${suffix}`,
  );
  return Array.isArray(payload?.items) ? payload.items : [];
}
async function atlasOpenApproverPicker(w, onSelect) {
  const openWith = (users, message = "") =>
    ATLASVisualPicker.open({
      mode: "user",
      title: "Select an approver",
      guidance:
        "Choose an active atlas-admin-team member. Assigned Analysts are shown as ineligible.",
      searchPlaceholder: "Filter these approvers",
      entries: users.map(atlasApproverPickerEntry),
      hideLabelMode: false,
      actionLabel: "Search company",
      actionTitle: "Search everyone in the company",
      message,
      onAction: async (query) => {
        const term = String(query || "").trim();
        if (term.length < 2)
          return openWith(
            users,
            "Enter at least two characters to search the company directory.",
          );
        try {
          openWith(await atlasLoadApproverCandidates(w.auditId, term));
        } catch (error) {
          openWith(users, error.message);
        }
      },
      onSelect: (entry) => {
        const user = entry?.user || entry;
        if (!user?.id || !user?.username) {
          status(
            "The selected approver could not be resolved. Refresh the picker and try again.",
            "bad",
          );
          return;
        }
        onSelect(user);
        ATLASVisualPicker.close();
      },
    });
  openWith(await atlasLoadApproverCandidates(w.auditId));
}
async function atlasSubmitForApproval() {
  if (typeof atlasSaveIfDirty === "function") await atlasSaveIfDirty();
  const w = await atlasLoadWorkflowSummary();
  if (!w || !atlasWorkflowCan("canSubmit"))
    throw new Error("Submission is not currently available.");
  let selectedApprover = null;
  const dialog = atlasWorkflowDialog(
    "Submit for Approval",
    `<div><span class="label">Approver</span><button class="btn secondary full" id="atlasSubmitApproverPicker" type="button">Select approver</button><div id="atlasSubmitApproverSummary" class="hint" role="status">No approver selected.</div></div><label>Message<textarea id="atlasSubmitMessage"></textarea></label>`,
    '<button class="btn primary" data-confirm-submit type="button" disabled>Submit</button>',
  );
  const submit = dialog.wrap.querySelector("[data-confirm-submit]");
  dialog.wrap
    .querySelector("#atlasSubmitApproverPicker")
    .addEventListener("click", async () => {
      try {
        await atlasOpenApproverPicker(w, (user) => {
          selectedApprover = { id: user.id, username: user.username };
          dialog.wrap.querySelector("#atlasSubmitApproverSummary").textContent =
            `${user.fullName || user.username} (${user.username})`;
          submit.disabled = false;
        });
      } catch (error) {
        status(error.message, "bad");
      }
    });
  submit.addEventListener("click", async (event) => {
    if (!selectedApprover) return status("Select an approver.", "bad");
    event.currentTarget.disabled = true;
    try {
      await atlasAuditApi(
        `/api/audits/${encodeURIComponent(w.auditId)}/submit`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedRevisionId: w.currentRevisionId,
            selectedApprover,
            requesterMessage: dialog.wrap
              .querySelector("#atlasSubmitMessage")
              .value.trim(),
          }),
        },
      );
      dialog.close();
      await atlasLoadWorkflowSummary();
      window.ATLASInbox?.refresh?.();
      status("Audit submitted for approval.", "ok");
    } catch (error) {
      event.currentTarget.disabled = false;
      status(error.message, "bad");
    }
  });
}
async function atlasRescindApprovalRequest() {
  const w = await atlasLoadWorkflowSummary();
  if (!w?.currentRequestId || !atlasWorkflowCan("canRescindApprovalRequest"))
    throw new Error("Rescission is not currently available.");
  const dialog = atlasWorkflowDialog(
    "Rescind Approval Request",
    `<p>The approver's active review will close and this audit will become editable again.</p><label>Reason<textarea id="atlasRescindReason" required></textarea></label><label><input id="atlasRescindConfirm" type="checkbox"> I understand this request will become historical and cannot resume.</label>`,
    '<button class="btn danger" data-confirm-rescind type="button">Rescind Approval Request</button>',
  );
  dialog.wrap
    .querySelector("[data-confirm-rescind]")
    .addEventListener("click", async (event) => {
      const reason = dialog.wrap
        .querySelector("#atlasRescindReason")
        .value.trim();
      const confirmation = dialog.wrap.querySelector(
        "#atlasRescindConfirm",
      ).checked;
      if (!reason || !confirmation)
        return status("Provide a reason and confirm rescission.", "bad");
      event.currentTarget.disabled = true;
      try {
        await atlasAuditApi(
          `/api/audits/${encodeURIComponent(w.auditId)}/approval-requests/${encodeURIComponent(w.currentRequestId)}/rescind`,
          {
            method: "POST",
            body: JSON.stringify({
              expectedRevisionId: w.currentRevisionId,
              reason,
              confirmation,
            }),
          },
        );
        dialog.close();
        await atlasLoadDatabaseAudit(w.auditId);
        await atlasLoadWorkflowSummary();
        window.ATLASInbox?.refresh?.();
        status(
          "Approval request rescinded. The audit is editable again.",
          "ok",
        );
      } catch (error) {
        event.currentTarget.disabled = false;
        if (error.status === 409) await atlasLoadWorkflowSummary();
        status(error.message, "bad");
      }
    });
}
async function atlasUnlockAudit() {
  const w = await atlasLoadWorkflowSummary();
  const dialog = atlasWorkflowDialog(
    "Unlock published audit",
    `<p>The existing publication remains immutable. Unlocking creates a Draft Revision that requires fresh approval.</p><label>Unlock reason<input id="atlasUnlockReason" required></label><label><input id="atlasUnlockConfirm" type="checkbox"> I understand the publication remains immutable.</label>`,
    '<button class="btn danger" data-confirm-unlock type="button">Unlock Audit</button>',
  );
  dialog.wrap
    .querySelector("[data-confirm-unlock]")
    .addEventListener("click", async (e) => {
      const reason = dialog.wrap
        .querySelector("#atlasUnlockReason")
        .value.trim();
      if (
        !reason ||
        !dialog.wrap.querySelector("#atlasUnlockConfirm").checked
      ) {
        status("Provide a reason and confirm publication immutability.", "bad");
        return;
      }
      e.currentTarget.disabled = true;
      try {
        await atlasAuditApi(
          `/api/audits/${encodeURIComponent(w.auditId)}/unlock`,
          {
            method: "POST",
            body: JSON.stringify({
              expectedRevisionId: w.currentRevisionId,
              expectedPublicationId: w.currentPublicationId,
              reason,
            }),
          },
        );
        dialog.close();
        await atlasLoadWorkflowSummary();
        status("Audit unlocked as Draft Revision.", "ok");
      } catch (error) {
        e.currentTarget.disabled = false;
        status(error.message, "bad");
      }
    });
}
const ATLAS_WORKFLOW_LOCK_DESCRIPTION_ID = "atlasWorkflowLockDescription";
const ATLAS_WORKFLOW_LOCK_TOOLTIP_ID = "atlasWorkflowLockTooltip";
let atlasWorkflowLockTooltipTarget = null;
const ATLAS_WORKFLOW_ALLOWED_ACTIONS = new Set([
  "view-request",
  "rescind",
  "history",
  "publications",
]);
const ATLAS_REVIEW_ALLOWED_SELECTORS = [
  "[data-review-decision]",
  "[data-review-toggle]",
  "[data-review-thread]",
  "[data-review-note-form]",
  "[data-review-note-cancel]",
  "[data-review-target]",
  "[data-review-show-all]",
  "[data-review-filter]",
  "[data-review-shell-collapse]",
  "[data-review-thread-close]",
  "[data-review-final-action]",
  "[data-review-final-summary]",
  "[data-review-exit]",
  "[data-review-hud-drag-handle]",
];
const ATLAS_WORKFLOW_MUTATION_SELECTORS = [
  "#duplicateAuditBtn",
  "#newAuditBtn",
  "#myAuditsNewAuditBtn",
  "#deleteAuditBtn",
  "#auditName",
  "#auditPurpose",
  "#auditStatus",
  "[data-open-assignment-picker]",
  "[data-remove-assignment-role]",
  "#importSourceLibraryBtn",
  "[data-source-action]",
  "[data-source-palette-color]",
  "[data-source-custom-color]",
  "[data-add-source-to-audit]",
  "[data-remove-selected-source]",
  "#addStepBtn",
  "[data-new-rule-type]",
  "[data-add-step]",
  "[data-add-step-after]",
  "[data-add-child-step]",
  "[data-create-inverse-else-step]",
  "[data-delete-step]",
  "[data-duplicate-step]",
  "[data-duplicate-logic-step]",
  "[data-indent]",
  "[data-outdent]",
  "[data-rule-menu-toggle]",
  "[data-rule-menu-panel] button",
  ".compact-dragger",
  ".logic-rule-card[draggable]",
  "[data-step-parent]",
  "[data-step-branch]",
  "[data-guided-add-condition]",
  "[data-guided-remove-condition]",
  "[data-condition-connector]",
  "[data-condition-value]",
  "[data-editor-panel] input",
  "[data-editor-panel] select",
  "[data-editor-panel] textarea",
  "[data-editor-panel] button",
  "[data-live-editor-step-id] input",
  "[data-live-editor-step-id] select",
  "[data-live-editor-step-id] textarea",
  "[data-live-editor-step-id] button",
  "[data-open-mini-picker]",
  "[data-step-enabled]",
  "[data-step-notes]",
  "[data-step-notes-live]",
  "[data-live-parent]",
  "[data-live-branch]",
  "[data-live-step-type-select]",
  "#addDisplayFieldBtn",
  "[data-display-field-toggle]",
  "[data-display-field-row]",
  ".display-field-drag-handle",
  "[data-restore-audit-revision]",
  "[data-restore-step-revision]",
  "[data-import-audit]",
];
function atlasWorkflowLockMessage() {
  if (window.ATLASAuditReview?.isActive?.())
    return "Reviewer Mode: this submitted audit revision is read-only. Review decisions, discussions, navigation, and review actions remain available.";
  if (atlasWorkflowSummary?.workflowStatus === "Pending Approval")
    return "This audit is read-only and locked while an approval request is pending. An assigned analyst may rescind the request to resume editing.";
  if (atlasWorkflowSummary?.workflowStatus === "Published")
    return "Published audits are read-only. Unlock the audit to create a Draft Revision.";
  return "";
}
function atlasWorkflowAllowedAction(element) {
  const action = element?.closest?.("[data-workflow-action]")?.dataset
    ?.workflowAction;
  return ATLAS_WORKFLOW_ALLOWED_ACTIONS.has(action);
}
function atlasAuditMutationControl(element) {
  if (
    !element?.closest ||
    atlasWorkflowAllowedAction(element) ||
    ATLAS_REVIEW_ALLOWED_SELECTORS.some((selector) => element.closest(selector))
  )
    return false;
  return ATLAS_WORKFLOW_MUTATION_SELECTORS.some((selector) =>
    element.closest(selector),
  );
}
function atlasEnsureWorkflowLockDescription() {
  let description = document.getElementById(ATLAS_WORKFLOW_LOCK_DESCRIPTION_ID);
  if (!description) {
    description = document.createElement("span");
    description.id = ATLAS_WORKFLOW_LOCK_DESCRIPTION_ID;
    description.className = "sr-only";
    document.body.append(description);
  }
  description.textContent = atlasWorkflowLockMessage();
  return description;
}
function atlasEnsureWorkflowLockTooltip() {
  let tooltip = document.getElementById(ATLAS_WORKFLOW_LOCK_TOOLTIP_ID);
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = ATLAS_WORKFLOW_LOCK_TOOLTIP_ID;
    tooltip.className = "atlas-workflow-lock-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    document.body.append(tooltip);
  }
  tooltip.textContent = atlasWorkflowLockMessage();
  return tooltip;
}
function atlasPositionWorkflowLockTooltip() {
  const target = atlasWorkflowLockTooltipTarget;
  const tooltip = document.getElementById(ATLAS_WORKFLOW_LOCK_TOOLTIP_ID);
  if (!target?.isConnected || !tooltip || tooltip.hidden) return;
  const margin = 12;
  const gap = 8;
  tooltip.style.maxWidth = `${Math.max(160, window.innerWidth - margin * 2)}px`;
  tooltip.style.left = `${margin}px`;
  tooltip.style.top = `${margin}px`;
  const targetRect = target.getBoundingClientRect();
  const tipRect = tooltip.getBoundingClientRect();
  const candidates = [
    {
      placement: "bottom",
      left: targetRect.left + (targetRect.width - tipRect.width) / 2,
      top: targetRect.bottom + gap,
    },
    {
      placement: "top",
      left: targetRect.left + (targetRect.width - tipRect.width) / 2,
      top: targetRect.top - tipRect.height - gap,
    },
    {
      placement: "right",
      left: targetRect.right + gap,
      top: targetRect.top + (targetRect.height - tipRect.height) / 2,
    },
    {
      placement: "left",
      left: targetRect.left - tipRect.width - gap,
      top: targetRect.top + (targetRect.height - tipRect.height) / 2,
    },
  ];
  const fits = ({ left, top }) =>
    left >= margin &&
    top >= margin &&
    left + tipRect.width <= window.innerWidth - margin &&
    top + tipRect.height <= window.innerHeight - margin;
  const chosen = candidates.find(fits) || candidates[0];
  const left = Math.min(
    Math.max(margin, chosen.left),
    Math.max(margin, window.innerWidth - tipRect.width - margin),
  );
  const top = Math.min(
    Math.max(margin, chosen.top),
    Math.max(margin, window.innerHeight - tipRect.height - margin),
  );
  tooltip.dataset.placement = chosen.placement;
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}
function atlasShowWorkflowLockTooltip(target) {
  if (
    !atlasAuditIsWorkflowLocked() ||
    !atlasAuditMutationControl(target) ||
    !atlasWorkflowLockMessage()
  )
    return;
  atlasWorkflowLockTooltipTarget = target;
  const tooltip = atlasEnsureWorkflowLockTooltip();
  tooltip.hidden = false;
  if (typeof requestAnimationFrame === "function")
    requestAnimationFrame(atlasPositionWorkflowLockTooltip);
  else atlasPositionWorkflowLockTooltip();
}
function atlasHideWorkflowLockTooltip(target) {
  if (target && target !== atlasWorkflowLockTooltipTarget) return;
  atlasWorkflowLockTooltipTarget = null;
  const tooltip = document.getElementById(ATLAS_WORKFLOW_LOCK_TOOLTIP_ID);
  if (tooltip) tooltip.hidden = true;
}
function atlasLockMutationControl(element) {
  if (!element || element.dataset.atlasWorkflowLocked === "true") return;
  element.dataset.atlasWorkflowLocked = "true";
  element.dataset.atlasWorkflowWasDisabled = String(Boolean(element.disabled));
  element.dataset.atlasWorkflowHadAriaDisabled = String(
    element.hasAttribute("aria-disabled"),
  );
  element.dataset.atlasWorkflowAriaDisabled =
    element.getAttribute("aria-disabled") || "";
  element.dataset.atlasWorkflowHadDescribedby = String(
    element.hasAttribute("aria-describedby"),
  );
  element.dataset.atlasWorkflowDescribedby =
    element.getAttribute("aria-describedby") || "";
  element.dataset.atlasWorkflowHadTabindex = String(
    element.hasAttribute("tabindex"),
  );
  element.dataset.atlasWorkflowTabindex =
    element.getAttribute("tabindex") || "";
  element.dataset.atlasWorkflowHadDraggable = String(
    element.hasAttribute("draggable"),
  );
  element.dataset.atlasWorkflowDraggable =
    element.getAttribute("draggable") || "";
  if ("disabled" in element) element.disabled = true;
  element.setAttribute("aria-disabled", "true");
  element.setAttribute("aria-describedby", ATLAS_WORKFLOW_LOCK_DESCRIPTION_ID);
  element.dataset.atlasLockReason = atlasWorkflowLockMessage();
  element.classList.add("atlas-workflow-lock-control");
  if (element.draggable || element.hasAttribute("draggable")) {
    element.draggable = false;
    element.setAttribute("draggable", "false");
  }
}
function atlasRestoreMutationControl(element) {
  if (!element || element.dataset.atlasWorkflowLocked !== "true") return;
  if ("disabled" in element)
    element.disabled = element.dataset.atlasWorkflowWasDisabled === "true";
  if (element.dataset.atlasWorkflowHadAriaDisabled === "true")
    element.setAttribute(
      "aria-disabled",
      element.dataset.atlasWorkflowAriaDisabled,
    );
  else element.removeAttribute("aria-disabled");
  if (element.dataset.atlasWorkflowHadTabindex === "true")
    element.setAttribute("tabindex", element.dataset.atlasWorkflowTabindex);
  else element.removeAttribute("tabindex");
  if (element.dataset.atlasWorkflowHadDraggable === "true") {
    element.setAttribute("draggable", element.dataset.atlasWorkflowDraggable);
    element.draggable = element.dataset.atlasWorkflowDraggable === "true";
  } else {
    element.removeAttribute("draggable");
    element.draggable = false;
  }
  if (element.dataset.atlasWorkflowHadDescribedby === "true")
    element.setAttribute(
      "aria-describedby",
      element.dataset.atlasWorkflowDescribedby,
    );
  else element.removeAttribute("aria-describedby");
  delete element.dataset.atlasLockReason;
  element.classList.remove("atlas-workflow-lock-control");
  [
    "atlasWorkflowLocked",
    "atlasWorkflowWasDisabled",
    "atlasWorkflowHadAriaDisabled",
    "atlasWorkflowAriaDisabled",
    "atlasWorkflowHadDescribedby",
    "atlasWorkflowDescribedby",
    "atlasWorkflowHadTabindex",
    "atlasWorkflowTabindex",
    "atlasWorkflowHadDraggable",
    "atlasWorkflowDraggable",
  ].forEach((name) => delete element.dataset[name]);
}
function atlasWorkflowMutationControls() {
  return [
    ...new Set(
      ATLAS_WORKFLOW_MUTATION_SELECTORS.flatMap((selector) => [
        ...document.querySelectorAll(selector),
      ]),
    ),
  ].filter((element) => !atlasWorkflowAllowedAction(element));
}
function atlasApplyPublishedLock() {
  const locked = atlasAuditIsWorkflowLocked();
  const reviewerMode = Boolean(window.ATLASAuditReview?.isActive?.());
  const pendingApproval =
    atlasWorkflowSummary?.workflowStatus === "Pending Approval";
  document.body.classList.toggle("atlas-published-locked", locked);
  atlasEnsureWorkflowLockDescription();
  atlasEnsureWorkflowLockTooltip();
  if (locked && typeof atlasCloseRuleMenus === "function")
    atlasCloseRuleMenus();
  else atlasHideWorkflowLockTooltip();
  document
    .querySelectorAll("[data-atlas-workflow-locked='true']")
    .forEach((element) => {
      if (!locked || !atlasAuditMutationControl(element))
        atlasRestoreMutationControl(element);
    });
  if (locked) atlasWorkflowMutationControls().forEach(atlasLockMutationControl);
  document
    .querySelectorAll("[data-atlas-readonly-notice]")
    .forEach((el) => el.remove());
  if (locked) {
    [
      "page-overview",
      "page-fields",
      "page-steps",
      "page-display-fields",
    ].forEach((id) => {
      const page = document.getElementById(id);
      if (page) {
        const n = document.createElement("div");
        n.dataset.atlasReadonlyNotice = "";
        n.className = "workflow-readonly";
        n.setAttribute("role", "status");
        n.textContent = reviewerMode
          ? "Reviewer Mode: this submitted audit revision is read-only. Review decisions, discussions, navigation, and review actions remain available."
          : pendingApproval
            ? "Approval pending: this audit is read-only while the submitted revision is under review. An assigned analyst may rescind the request to resume editing."
            : atlasWorkflowSummary?.workflowStatus === "Published"
              ? "Published audit: this view is read-only. History, publications, navigation, and exports remain available."
              : "Read-only access: you can inspect, navigate, and export this audit, but the verified atlas-admin-team role is required for changes.";
        page.prepend(n);
      }
    });
  }
}
function atlasGuardPublishedMutation(event) {
  if (!atlasAuditIsWorkflowLocked()) return;
  if (atlasWorkflowAllowedAction(event.target)) return;
  if (!atlasAuditMutationControl(event.target)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const message = atlasWorkflowLockMessage();
  if (message) status(message, "bad");
}
document.addEventListener("click", atlasGuardPublishedMutation, true);
document.addEventListener("keydown", atlasGuardPublishedMutation, true);
document.addEventListener("input", atlasGuardPublishedMutation, true);
document.addEventListener("change", atlasGuardPublishedMutation, true);
document.addEventListener("dragstart", atlasGuardPublishedMutation, true);
document.addEventListener("dragover", atlasGuardPublishedMutation, true);
document.addEventListener("drop", atlasGuardPublishedMutation, true);
document.addEventListener(
  "pointerover",
  (event) => {
    const target = event.target?.closest?.(
      "[data-atlas-workflow-locked='true']",
    );
    if (target) atlasShowWorkflowLockTooltip(target);
  },
  true,
);
document.addEventListener(
  "pointerout",
  (event) => {
    if (atlasWorkflowLockTooltipTarget?.contains?.(event.relatedTarget)) return;
    atlasHideWorkflowLockTooltip(
      event.target?.closest?.("[data-atlas-workflow-locked='true']"),
    );
  },
  true,
);
document.addEventListener(
  "focusin",
  (event) => {
    const target = event.target?.closest?.(
      "[data-atlas-workflow-locked='true']",
    );
    if (target) atlasShowWorkflowLockTooltip(target);
  },
  true,
);
document.addEventListener(
  "focusout",
  (event) =>
    atlasHideWorkflowLockTooltip(
      event.target?.closest?.("[data-atlas-workflow-locked='true']"),
    ),
  true,
);
if (typeof window.addEventListener === "function") {
  window.addEventListener("resize", atlasPositionWorkflowLockTooltip);
  window.addEventListener("scroll", atlasPositionWorkflowLockTooltip, true);
}
async function atlasRunStructuredReviewAction(action) {
  const workflow = await atlasLoadWorkflowSummary();
  if (!workflow?.auditId || !workflow?.currentRequestId)
    throw new Error("No current approval request is available.");
  await atlasShowApprovalReview("view", {
    auditId: workflow.auditId,
    requestId: workflow.currentRequestId,
  });
  return window.ATLASAuditReview?.performFinalAction?.(action);
}
async function atlasHandleWorkflowAction(e) {
  const a = e.target.closest("[data-workflow-action]");
  if (!a) return;
  try {
    const action = a.dataset.workflowAction;
    if (action === "submit") await atlasSubmitForApproval();
    else if (action === "view-request") await atlasShowApprovalReview();
    else if (action === "rescind") await atlasRescindApprovalRequest();
    else if (action === "approve")
      await atlasRunStructuredReviewAction("approve");
    else if (action === "return")
      await atlasRunStructuredReviewAction("return");
    else if (action === "publish") showSection("save");
    else if (action === "unlock") await atlasUnlockAudit();
    else if (action === "history") await atlasOpenAuditHistory();
    else if (action === "publications")
      await window.ATLASHistory?.open?.("publication");
  } catch (error) {
    status(error.message, "bad");
  }
}
document.addEventListener("click", atlasHandleWorkflowAction);
document
  .getElementById("atlasWorkflowRefresh")
  ?.addEventListener("click", () => atlasLoadWorkflowSummary());
window.ATLASWorkflow = {
  refresh: atlasLoadWorkflowSummary,
  isPublishedLocked: atlasAuditIsPublishedLocked,
  isWorkflowLocked: atlasAuditIsWorkflowLocked,
  applyLock: atlasApplyPublishedLock,
  isMutationControl: atlasAuditMutationControl,
  isAllowedAction: atlasWorkflowAllowedAction,
  render: atlasRenderWorkflowCard,
  showApprovalReview: atlasShowApprovalReview,
  runStructuredReviewAction: atlasRunStructuredReviewAction,
  feature: atlasWorkflowFeature,
  can: atlasWorkflowCan,
  get summary() {
    return atlasWorkflowSummary;
  },
};
for (const name of [
  "scheduleAutosave",
  "saveAutosave",
  "atlasMarkDatabaseDirty",
  "atlasScheduleDatabaseWrite",
  "atlasPerformDatabaseWrite",
  "atlasSaveOnPageHide",
]) {
  const original = window[name];
  if (typeof original !== "function") continue;
  window[name] = function (...args) {
    if (atlasAuditIsWorkflowLocked())
      return name === "atlasPerformDatabaseWrite"
        ? Promise.resolve(null)
        : undefined;
    return original.apply(this, args);
  };
}
async function atlasRenderPublicationFlow() {
  const meta = document.getElementById("atlasPublicationMetadata"),
    snap = document.getElementById("atlasPublicationSnapshot"),
    form = document.getElementById("atlasPublicationForm");
  if (!meta || !snap || !form) return;
  const w = atlasWorkflowSummary;
  if (!w) {
    meta.innerHTML =
      '<p class="hint">Load an audit to view publication details.</p>';
    form.hidden = true;
    return;
  }
  form.hidden = !atlasWorkflowCan("canPublish");
  meta.innerHTML = `<div class="workflow-grid"><div><span class="hint">Approved revision</span><div class="workflow-value">${esc(atlasWorkflowText(w.currentRevisionNumber))} (ID ${esc(atlasWorkflowText(w.currentRevisionId))})</div></div><div><span class="hint">Approval</span><div class="workflow-value">${esc(atlasWorkflowText(w.currentApprovalId))}</div></div><div><span class="hint">Next version</span><div class="workflow-value">Assigned by server</div></div></div>`;
  if (atlasWorkflowCan("canPublish")) {
    try {
      const preview = await atlasAuditApi(
        `/api/audits/${encodeURIComponent(w.auditId)}/previews/approval-requests/${encodeURIComponent(w.currentRequestId)}`,
      );
      snap.textContent = JSON.stringify(
        preview.source?.document || preview.source || {},
        null,
        2,
      );
    } catch (error) {
      snap.textContent = error.message;
    }
  } else
    snap.textContent =
      "Publication is available only for an approved revision and eligible publisher.";
}
document
  .getElementById("atlasPublicationForm")
  ?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const w = await atlasLoadWorkflowSummary(),
      title = document.getElementById("atlasPublicationTitle").value.trim(),
      button = document.getElementById("atlasPublishButton");
    if (!title) {
      status("Version title is required.", "bad");
      return;
    }
    button.disabled = true;
    try {
      const result = await atlasAuditApi(
        `/api/audits/${encodeURIComponent(w.auditId)}/publish`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedRevisionId: w.currentRevisionId,
            expectedApprovalId: w.currentApprovalId,
            versionTitle: title,
            description: document
              .getElementById("atlasPublicationDescription")
              .value.trim(),
          }),
        },
      );
      await atlasLoadWorkflowSummary();
      status(
        `Published version ${result.publication?.versionNumber || "created"}.`,
        "ok",
      );
    } catch (error) {
      status(error.message, "bad");
    } finally {
      button.disabled = false;
    }
  });
if (typeof atlasApplyLoadedAudit === "function") {
  const atlasApplyLoadedAuditBeforeWorkflow = atlasApplyLoadedAudit;
  atlasApplyLoadedAudit = async function (...args) {
    const result = await atlasApplyLoadedAuditBeforeWorkflow.apply(this, args);
    await atlasLoadWorkflowSummary().catch(() => null);
    return result;
  };
}
const atlasShowSectionBeforeWorkflow = showSection;
showSection = function (section) {
  const result = atlasShowSectionBeforeWorkflow(section);
  if (
    (section === "overview" || section === "save") &&
    !window.ATLASAuditReview?.isActive?.()
  )
    atlasLoadWorkflowSummary().catch(() => null);
  if (section === "inbox") window.ATLASInbox?.refresh?.();
  return result;
};
