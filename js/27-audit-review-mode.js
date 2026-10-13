(function initializeAtlasAuditReview() {
  const pageMap = {
    overview: "overview",
    sources: "fields",
    logic: "steps",
    "display-fields": "display-fields",
    issues: "review",
  };
  const pageLabels = {
    overview: "Audit Overview",
    sources: "Sources",
    logic: "Logic Builder",
    "display-fields": "Display Fields",
    issues: "Audit Issues",
  };
  let review = null,
    dirty = new Map(),
    savePromise = null,
    generation = 0,
    opener = null,
    filter = "all",
    threadTarget = null,
    threadContext = null,
    threadSubmission = null,
    finalSummary = null,
    hudCollapsed = false,
    hudPosition = null,
    dragState = null;
  const escHtml = (value) =>
    typeof esc === "function"
      ? esc(value)
      : String(value ?? "").replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            })[c],
        );
  const keyFor = (item) => `${item.sectionKey}|${item.stableItemKey}`;
  const direct = (item) => item.isDirect !== false;
  const items = () => review?.items || [];
  function decisionAuthority(item) {
    if (!item) return null;
    if (direct(item)) return item;
    if (item.itemType !== "logic-reference" || !item.linkedItemKey) return null;
    const linked = items().filter(
      (candidate) =>
        direct(candidate) &&
        candidate.sectionKey === "sources" &&
        candidate.canonicalObjectKey === item.linkedItemKey,
    );
    return linked.length === 1 ? linked[0] : null;
  }
  const effective = (item) => {
    const authority = decisionAuthority(item) || item;
    return dirty.get(keyFor(authority)) || authority;
  };
  const displayDocument = () =>
    review ? structuredClone(review.document) : null;
  function atlasCurrentRenderDocument() {
    return review?.document || state.audit;
  }
  function clearTransientReviewSurfaces() {
    document.getElementById("atlasReviewThreadPanel")?.remove();
    document.getElementById("atlasReviewNotePopover")?.remove();
    document
      .querySelectorAll(
        "[data-review-inline-decoration],[data-review-density],.review-target-highlight",
      )
      .forEach((node) => {
        node.classList.remove("review-target-highlight");
        if (
          node.matches("[data-review-inline-decoration],[data-review-density]")
        )
          node.remove();
      });
    threadTarget = null;
    threadContext = null;
    threadSubmission = null;
    window.ATLASAuditIssues?.invalidate?.();
  }
  function renderInlineReviewMode() {
    atlasMarkAllPagesDirty?.();
    atlasRenderActivePage?.({ force: true });
    renderShell();
    window.ATLASAuditIssues?.render?.();
    window.renderActiveAuditSelect?.();
    window.ATLASWorkflow?.applyLock?.();
  }
  window.atlasCurrentRenderDocument = atlasCurrentRenderDocument;
  function preferenceKey() {
    const identity =
      state?.currentUser?.username ||
      state?.currentUser?.email ||
      state?.currentUser?.id ||
      "anonymous";
    return `atlasAlignReviewerHud:${String(identity).toLowerCase()}`;
  }
  function clampHudPosition(position, shell) {
    if (!position || !shell) return null;
    const left = Number(position.left),
      top = Number(position.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
    return {
      left: Math.max(
        8,
        Math.min(left, window.innerWidth - shell.offsetWidth - 8),
      ),
      top: Math.max(
        8,
        Math.min(top, window.innerHeight - shell.offsetHeight - 8),
      ),
    };
  }
  function loadHudPreferences(shell) {
    try {
      const saved = JSON.parse(localStorage.getItem(preferenceKey()) || "null");
      hudCollapsed = saved?.collapsed === true;
      hudPosition = clampHudPosition(saved?.position, shell);
    } catch {
      hudCollapsed = false;
      hudPosition = null;
    }
  }
  function saveHudPreferences() {
    try {
      localStorage.setItem(
        preferenceKey(),
        JSON.stringify({ collapsed: hudCollapsed, position: hudPosition }),
      );
    } catch {
      // Presentation preferences are intentionally non-blocking.
    }
  }
  function applyHudState(shell) {
    shell.classList.toggle("is-collapsed", hudCollapsed);
    const body = shell?.querySelector("#atlasReviewerHudBody");
    if (body) body.hidden = hudCollapsed;
    if (hudPosition) {
      const position = clampHudPosition(hudPosition, shell);
      hudPosition = position;
      if (position) {
        shell.style.left = `${position.left}px`;
        shell.style.top = `${position.top}px`;
        shell.style.right = "auto";
        shell.style.bottom = "auto";
      }
    }
  }
  function sectionItems(section) {
    return items().filter((item) => item.sectionKey === section);
  }
  function counts(list = items()) {
    const rows = list.filter(direct),
      result = {
        total: rows.length,
        approved: 0,
        needsDiscussion: 0,
        requestChanges: 0,
        unreviewed: 0,
        decided: 0,
      };
    rows.forEach((item) => {
      const decision = effective(item).decision;
      if (decision === "Approve") result.approved++;
      else if (decision === "Needs discussion") result.needsDiscussion++;
      else if (decision === "Request changes") result.requestChanges++;
      else result.unreviewed++;
    });
    result.decided = result.total - result.unreviewed;
    result.percent = result.total
      ? Math.round((result.decided / result.total) * 100)
      : 100;
    return result;
  }
  function sectionForPage() {
    const page =
      typeof atlasActivePage === "function" ? atlasActivePage() : "overview";
    return (
      Object.keys(pageMap).find((key) => pageMap[key] === page) || "overview"
    );
  }
  function matches(item) {
    const itemDecision = effective(item).decision || "Unreviewed";
    if (filter === "all") return true;
    if (filter === "page") return item.sectionKey === sectionForPage();
    if (filter === "unreviewed")
      return !itemDecision || itemDecision === "Unreviewed";
    if (filter === "needs-discussion")
      return itemDecision === "Needs discussion";
    if (filter === "request-changes") return itemDecision === "Request changes";
    if (filter === "changed")
      return (
        item.changeType && !["unchanged", "initial"].includes(item.changeType)
      );
    if (filter === "deleted") return item.isDeleted === true;
    if (filter === "commented")
      return Boolean(
        item.discussionState || Number(item.discussionMessageCount) > 0,
      );
    if (filter === "open-discussions") return item.discussionState === "Open";
    if (filter === "resolved-discussions")
      return item.discussionState === "Resolved";
    return true;
  }
  function decisionControls(item) {
    const authority = decisionAuthority(item);
    const current = effective(item).decision || "Unreviewed";
    const tone =
      current === "Approve"
        ? "approve"
        : current === "Needs discussion"
          ? "discuss"
          : current === "Request changes"
            ? "change"
            : "unreviewed";
    if (review?.mode === "analyst-feedback" || !authority)
      return `<span class="review-inline-status review-inline-status-${tone}" role="status" aria-label="${escHtml(item.displayLabel)}: ${escHtml(current)}"><span aria-hidden="true"></span><b>${escHtml(current)}</b></span>`;
    const choices = [
      ["Request changes", "change"],
      ["Needs discussion", "discuss"],
      ["Approve", "approve"],
    ];
    return `<div class="review-inline-controls" data-review-controls role="group" aria-label="Decision for ${escHtml(item.displayLabel)}"><button type="button" class="review-inline-status review-inline-status-${tone}" data-review-toggle aria-label="${escHtml(item.displayLabel)}: ${escHtml(current)}. Show review choices" aria-expanded="false"><span aria-hidden="true"></span><b>${escHtml(current)}</b></button><div class="review-stoplights">${choices.map(([value, kind]) => `<button type="button" class="review-stoplight review-stoplight-${kind}" data-review-decision="${escHtml(value)}" data-review-id="${authority.id}" data-review-presentation-id="${item.id}" aria-pressed="${current === value}" aria-label="${escHtml(value)} for ${escHtml(item.displayLabel)}"><span aria-hidden="true"></span><b>${escHtml(value)}</b></button>`).join("")}</div></div>`;
  }

  function ensureShell() {
    let shell = document.getElementById("atlasReviewerModeShell");
    if (!shell) {
      shell = document.createElement("aside");
      shell.id = "atlasReviewerModeShell";
      shell.className = "reviewer-mode-shell";
      shell.setAttribute("aria-label", "Reviewer Mode progress");
      document.body.append(shell);
      loadHudPreferences(shell);
    }
    let panel = document.getElementById("atlasReviewThreadPanel");
    if (!panel) {
      panel = document.createElement("aside");
      panel.id = "atlasReviewThreadPanel";
      panel.className = "review-thread-panel";
      panel.hidden = true;
      document.body.append(panel);
    }
    document.body.classList.add("atlas-reviewer-mode");
    document.querySelectorAll("[data-page]").forEach((button) => {
      const section = Object.keys(pageMap).find(
        (key) => pageMap[key] === button.dataset.page,
      );
      if (section) button.dataset.reviewDensitySection = section;
    });
    return shell;
  }
  function reviewContextIsCurrent() {
    return Boolean(
      review &&
      review.session?.sessionStatus === "Draft" &&
      review.session?.auditId &&
      review.session?.requestId &&
      review.session?.submittedRevisionId,
    );
  }
  function structuredFinalActions() {
    if (!reviewContextIsCurrent() || review.mode === "analyst-feedback")
      return [];
    const features = finalSummary?.features || {};
    const summary = finalSummary?.finalSummary || finalSummary;
    const checking = !summary;
    return [
      {
        action: "approve",
        label: "Approve Audit",
        tone: "success",
        disabled:
          checking || !summary?.approvalEligible || !features.publication,
        description: checking
          ? "Checking the authoritative review status."
          : summary.approvalEligible
            ? features.publication
              ? "The review is complete and ready for final approval."
              : "Final approval is not available in this environment."
            : "Approve every direct review item and resolve every applicable Discussion before final approval.",
      },
      {
        action: "return",
        label: "Return to Analyst",
        tone: "danger",
        disabled: checking || !summary?.returnEligible || !features.decisions,
        description: checking
          ? "Checking the authoritative review status."
          : summary.returnEligible
            ? features.decisions
              ? "Return this Draft review to the assigned Analyst."
              : "Return is not available in this environment."
            : "This review is no longer eligible to be returned.",
      },
    ];
  }
  function adaptiveFinalAction() {
    const actions = structuredFinalActions();
    return actions.find((action) => !action.disabled) || actions[0] || null;
  }
  async function refreshFinalSummary() {
    if (!reviewContextIsCurrent() || review.mode === "analyst-feedback")
      return null;
    const token = generation;
    const sessionId = review.session.id;
    const payload = await atlasAuditApi(
      `/api/review-sessions/${sessionId}/final-summary`,
    );
    if (
      token !== generation ||
      String(review?.session?.id) !== String(sessionId)
    )
      return null;
    finalSummary = payload;
    renderShell();
    return payload;
  }
  function renderShell() {
    if (!reviewContextIsCurrent()) {
      document.getElementById("atlasReviewerModeShell")?.remove();
      document
        .querySelectorAll("[data-review-density]")
        .forEach((node) => node.remove());
      document
        .querySelectorAll("[data-review-inline-decoration]")
        .forEach((node) => node.remove());
      return;
    }
    const localOverall = counts(),
      authoritativeCounts = !dirty.size
        ? finalSummary?.finalSummary?.counts || finalSummary?.counts
        : null,
      overall = authoritativeCounts
        ? {
            total: Number(authoritativeCounts.total || 0),
            approved: Number(authoritativeCounts.approved || 0),
            needsDiscussion: Number(authoritativeCounts.needsDiscussion || 0),
            requestChanges: Number(authoritativeCounts.requestChanges || 0),
            unreviewed: Number(authoritativeCounts.reviewRequired || 0),
            decided:
              Number(authoritativeCounts.total || 0) -
              Number(authoritativeCounts.reviewRequired || 0),
            percent: Number(authoritativeCounts.total || 0)
              ? Math.round(
                  ((Number(authoritativeCounts.total || 0) -
                    Number(authoritativeCounts.reviewRequired || 0)) /
                    Number(authoritativeCounts.total || 0)) *
                    100,
                )
              : 100,
          }
        : localOverall,
      current = counts(sectionItems(sectionForPage()));
    const shell = ensureShell();
    const finalActions = structuredFinalActions();
    const summary = finalSummary?.finalSummary || finalSummary;
    const blocker =
      summary?.approvalEligible === false
        ? "Approval has unresolved blockers"
        : overall.unreviewed ||
            overall.needsDiscussion ||
            overall.requestChanges
          ? "Review is not ready for approval"
          : "Ready for final validation";
    shell.innerHTML = `<div class="reviewer-mode-summary" data-review-hud-drag-handle><div><strong>${review.mode === "analyst-feedback" ? "Review Feedback" : "Reviewer Mode"}</strong><small>${escHtml(review.document?.name || review.session.auditId)} · revision ${review.session.submittedRevisionId}</small></div><button type="button" data-review-shell-collapse aria-expanded="${!hudCollapsed}" aria-controls="atlasReviewerHudBody" aria-label="${hudCollapsed ? "Restore Reviewer Mode" : "Collapse Reviewer Mode"}">${hudCollapsed ? "+" : "−"}</button></div><div id="atlasReviewerHudBody" class="reviewer-mode-body"><div class="reviewer-mode-progress"><progress max="${overall.total || 1}" value="${overall.decided}"></progress><b>${overall.decided}/${overall.total} reviewed (${overall.percent}%)</b><span>Page ${current.decided}/${current.total}</span><span>${overall.approved} approved · ${overall.needsDiscussion} discussion · ${overall.requestChanges} changes · ${overall.unreviewed} unreviewed</span><span class="review-final-readiness">${escHtml(blocker)}</span><span id="atlasReviewSaveStatus" role="status">${dirty.size ? "Changes not yet saved" : "Draft saved"}</span></div><label>Filter<select data-review-filter>${[
      ["all", "All review items"],
      ["page", "Current page"],
      ["unreviewed", "Unreviewed"],
      ["needs-discussion", "Needs Discussion"],
      ["request-changes", "Request Changes"],
      ["changed", "Changed items"],
      ["commented", "Commented items"],
      ["deleted", "Deleted items"],
    ]
      .map(
        ([value, label]) =>
          `<option value="${value}" ${filter === value ? "selected" : ""}>${label}</option>`,
      )
      .join("")}</select></label><div class="reviewer-mode-results">${
      items()
        .filter(matches)
        .slice(0, 100)
        .map(
          (item) =>
            `<button type="button" data-review-target="${item.id}">${escHtml(item.displayLabel)}</button>`,
        )
        .join("") ||
      '<div class="review-filter-empty" role="status"><p>No matching review items.</p><button type="button" data-review-show-all>Show all items</button></div>'
    }</div><div class="reviewer-mode-actions">${finalActions.map((finalAction) => `<button type="button" class="review-final-action is-${finalAction.tone}" style="${finalAction.tone === "success" ? "background:var(--ok);color:#fff" : finalAction.tone === "danger" ? "background:var(--danger);color:#fff" : ""}" data-review-final-action="${finalAction.action}" title="${escHtml(finalAction.description)}" ${finalAction.disabled ? "disabled" : ""}>${escHtml(finalAction.label)}</button>`).join("")}<button type="button" data-review-final-summary>Review blockers</button><button type="button" data-review-exit>Exit Review</button></div></div>`;
    applyHudState(shell);
    renderDensity();
    renderPageDecorations();
    window.ATLASWorkflow?.applyLock?.();
  }
  function renderDensity() {
    document
      .querySelectorAll("[data-review-density]")
      .forEach((node) => node.remove());
    Object.entries(pageMap).forEach(([section, page]) => {
      const button = document.querySelector(`[data-page="${page}"]`);
      if (!button) return;
      const c = counts(sectionItems(section));
      const dominant = c.requestChanges
        ? "Changes requested"
        : c.needsDiscussion
          ? "Needs discussion"
          : c.unreviewed
            ? "Unreviewed"
            : c.total
              ? "Complete"
              : "Not applicable";
      button.insertAdjacentHTML(
        "beforeend",
        `<span data-review-density class="review-density" aria-label="${c.decided} of ${c.total} reviewed; ${dominant}">${c.percent}%</span>`,
      );
    });
  }
  function pageHost(section) {
    return (
      document.getElementById(`page-${pageMap[section]}`) ||
      document.querySelector(`[data-page-panel="${pageMap[section]}"]`)
    );
  }
  function reviewStablePart(item) {
    const value = String(item.stableItemKey || "");
    return value.includes(":") ? value.slice(value.indexOf(":") + 1) : value;
  }
  function normalizedReviewIdentity(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }
  function nativeReviewTargets(item) {
    const stable = reviewStablePart(item),
      escaped = CSS.escape(stable);
    if (item.sectionKey === "overview") {
      const selector =
        item.itemType === "assignment"
          ? {
              assigned: "#assignmentAssignedSelected",
              backup: "#assignmentBackupSelected",
              developer: "#assignmentDeveloperSelected",
            }[stable]
          : {
              "audit-name": "#auditName",
              "audit-description": "#auditPurpose",
              "audit-scope": "#auditScope",
            }[stable];
      const node = selector ? document.querySelector(selector) : null;
      return node
        ? [
            node.closest("label, .assignment-columns > div") ||
              node.parentElement,
          ]
        : [];
    }
    if (item.sectionKey === "sources")
      return [
        ...document.querySelectorAll(
          "[data-review-source-key], .selected-source-compact-card",
        ),
      ].filter((node) =>
        [
          node.dataset.reviewSourceKey,
          node.dataset.id,
          node.querySelector("[data-source-detail-name]")?.dataset
            .sourceDetailName,
        ].some(
          (value) =>
            normalizedReviewIdentity(value) ===
            normalizedReviewIdentity(stable),
        ),
      );
    if (item.sectionKey === "logic")
      return [
        ...document.querySelectorAll(`.logic-rule-card[data-id="${escaped}"]`),
      ];
    if (item.sectionKey === "display-fields") {
      if (item.itemType === "display-order") {
        const table = document.querySelector(".display-fields-table-wrap");
        return table ? [table] : [];
      }
      return [
        ...document.querySelectorAll(`[data-display-field-row="${escaped}"]`),
      ];
    }
    if (item.sectionKey === "issues")
      return [
        ...document.querySelectorAll(
          "[data-review-issue-key], [data-issue-id]",
        ),
      ].filter((node) =>
        [node.dataset.reviewIssueKey, node.dataset.issueId].some(
          (value) =>
            normalizedReviewIdentity(value) ===
            normalizedReviewIdentity(stable),
        ),
      );
    return [];
  }
  function decorateNativeObject(item, target) {
    if (
      !target ||
      target.querySelector(
        `:scope > [data-review-inline-decoration="${CSS.escape(String(item.id))}"]`,
      )
    )
      return;
    target.classList.add("review-inline-object");
    target.dataset.reviewItemId = String(item.id);
    target.dataset.reviewStableKey = item.stableItemKey;
    if (
      !target.hasAttribute("tabindex") &&
      !target.matches("input, textarea, button, select, a[href]")
    )
      target.tabIndex = 0;
    const decoration = document.createElement("div");
    decoration.className = "review-inline-decoration";
    decoration.dataset.reviewInlineDecoration = String(item.id);
    decoration.innerHTML = `${decisionControls(item)}<button type="button" class="review-inline-discussion" data-review-thread="${item.id}" aria-label="Open discussion for ${escHtml(item.displayLabel)}">Discussion</button>`;
    target.append(decoration);
  }
  function renderPageDecorations() {
    document
      .querySelectorAll("[data-review-inline-decoration]")
      .forEach((node) => node.remove());
    document.querySelectorAll(".review-inline-object").forEach((node) => {
      node.classList.remove("review-inline-object", "review-target-highlight");
      node.removeAttribute("data-review-item-id");
      node.removeAttribute("data-review-stable-key");
    });
    items()
      .filter((item) => !item.isDeleted)
      .forEach((item) =>
        nativeReviewTargets(item).forEach((target) =>
          decorateNativeObject(item, target),
        ),
      );
  }
  function closeReviewNotePopover() {
    const popover = document.getElementById("atlasReviewNotePopover"),
      returnTo = popover?._returnFocus,
      fallback = popover
        ? document.querySelector(
            `[data-review-decision][data-review-id="${CSS.escape(String(popover.dataset.reviewId || ""))}"][data-review-decision="${CSS.escape(String(popover.dataset.reviewNoteDecision || ""))}"]`,
          )
        : null;
    popover?.remove();
    (returnTo?.isConnected ? returnTo : fallback)?.focus?.();
  }
  function openReviewNotePopover(
    item,
    decision,
    trigger,
    displayLabel = item.displayLabel,
  ) {
    closeReviewNotePopover();
    const popover = document.createElement("aside");
    popover.id = "atlasReviewNotePopover";
    popover.className = "review-note-popover";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-labelledby", "atlasReviewNoteTitle");
    const decoration = trigger.closest("[data-review-inline-decoration]");
    if (!decoration) return;
    popover._returnFocus = trigger;
    popover.dataset.reviewId = String(item.id);
    popover.dataset.reviewNoteDecision = decision;
    popover.dataset.reviewPresentationId = String(
      trigger.dataset.reviewPresentationId || item.id,
    );
    popover.dataset.reviewGeneration = String(generation);
    popover.dataset.reviewSessionId = String(review?.session?.id || "");
    popover.innerHTML = `<form data-review-note-form><header><strong id="atlasReviewNoteTitle">${escHtml(decision)}: ${escHtml(displayLabel)}</strong><button type="button" data-review-note-cancel aria-label="Close reviewer note">×</button></header><label>Reviewer note<textarea name="reviewerNote" rows="3" required>${escHtml(effective(item).reviewerNote || "")}</textarea></label><div class="review-note-popover-actions"><button type="button" class="secondary" data-review-note-thread="${item.id}">Open Discussion</button><button type="button" data-review-note-save>Save decision</button></div></form>`;
    decoration.append(popover);
    popover.querySelector("textarea").focus();
  }
  function markDirty(itemId, patch) {
    const item = items().find((row) => String(row.id) === String(itemId));
    if (!item || !direct(item)) return;
    dirty.set(keyFor(item), { ...effective(item), ...patch });
    finalSummary = null;
    renderShell();
    queueSave();
  }
  function queueSave() {
    clearTimeout(queueSave.timer);
    queueSave.timer = setTimeout(
      () =>
        save(sectionForPage()).catch((error) => setStatus(error.message, true)),
      450,
    );
  }
  function setStatus(message, bad = false) {
    const node = document.getElementById("atlasReviewSaveStatus");
    if (node) {
      node.textContent = message;
      node.className = bad ? "bad" : "";
    }
  }
  async function save(resumeSection) {
    if (!review || !dirty.size) return review;
    if (savePromise) return savePromise;
    const savingEntries = [...dirty.entries()];
    const changes = savingEntries.map(([key, value]) => {
      const original = items().find((item) => keyFor(item) === key);
      return {
        sectionKey: original.sectionKey,
        stableItemKey: original.stableItemKey,
        decision: value.decision || null,
        reviewerNote: value.reviewerNote || "",
      };
    });
    const expected = review.session.draftVersion,
      activeGeneration = generation;
    setStatus("Saving…");
    savePromise = atlasAuditApi(
      `/api/review-sessions/${review.session.id}/draft`,
      {
        method: "PUT",
        body: JSON.stringify({
          expectedVersion: expected,
          resumeSection,
          resumeItemKey: changes[0]?.stableItemKey || null,
          changes,
        }),
      },
    )
      .then((next) => {
        if (activeGeneration !== generation) return review;
        review = next;
        savingEntries.forEach(([key, savedValue]) => {
          if (dirty.get(key) === savedValue) dirty.delete(key);
        });
        setStatus(dirty.size ? "New changes not yet saved" : "Draft saved");
        renderShell();
        refreshFinalSummary().catch((error) => setStatus(error.message, true));
        return review;
      })
      .catch(async (error) => {
        if (error.status === 409 && activeGeneration === generation)
          setStatus(
            "Draft changed elsewhere. Your unsaved decisions remain available; refresh before retrying.",
            true,
          );
        throw error;
      })
      .finally(() => {
        savePromise = null;
      });
    return savePromise;
  }
  async function navigate(itemId) {
    const item = items().find((row) => String(row.id) === String(itemId));
    if (!item) return;
    showSection(pageMap[item.sectionKey] || "overview");
    if (item.sectionKey === "logic" && !item.isDeleted)
      await window.atlasRevealLogicStep?.(
        String(item.stableItemKey).replace(/^logic-(?:step|reference):/, ""),
      );
    renderPageDecorations();
    requestAnimationFrame(() => {
      const target = document.querySelector(
        `[data-review-item-id="${CSS.escape(String(item.id))}"]`,
      );
      target?.scrollIntoView({
        block: "center",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
      target?.focus();
      target?.classList.add("review-target-highlight");
      setTimeout(
        () => target?.classList.remove("review-target-highlight"),
        1600,
      );
    });
  }
  async function openThread(itemId) {
    const item = items().find((row) => String(row.id) === String(itemId));
    if (!item) return;
    const token = ++generation;
    const payload = await atlasAuditApi(
      `/api/review-sessions/${review.session.id}/items/${item.id}/discussions`,
    );
    if (!review || token !== generation) return;
    threadTarget = item;
    const capabilities = payload.capabilities || {};
    threadContext = {
      generation: token,
      sessionId: String(review.session.id),
      itemId: String(item.id),
      operation: payload.thread ? "reply" : "create",
      threadId: payload.thread?.id == null ? null : String(payload.thread.id),
      canCreate: capabilities.canCreate === true,
      canReply: capabilities.canReply === true,
      readOnly: capabilities.readOnly === true,
      state: payload.thread?.state || null,
    };
    const panel = document.getElementById("atlasReviewThreadPanel");
    panel.hidden = false;
    const canMessage = payload.thread
      ? capabilities.canReply
      : capabilities.canCreate;
    const stateAction =
      payload.thread && capabilities.canResolve
        ? "resolve"
        : payload.thread && capabilities.canReopen
          ? "reopen"
          : null;
    panel.innerHTML = `<header><div><small>${escHtml(item.itemType)}</small><h2>${escHtml(item.displayLabel)}</h2>${payload.thread ? `<p class="review-thread-state" role="status">Discussion ${escHtml(payload.thread.state)} · ${payload.messages.length} message${payload.messages.length === 1 ? "" : "s"}</p>` : ""}</div><button type="button" data-review-thread-close aria-label="Close discussion">×</button></header>${item.isDeleted ? '<p class="review-deleted-context"><strong>Deleted object.</strong> This discussion is retained with its canonical history.</p>' : ""}${item.reviewerNote ? `<section class="review-legacy-note"><h3>Reviewer note</h3><p>${escHtml(item.reviewerNote)}</p></section>` : ""}<div class="review-thread-messages">${payload.messages.map((m) => `<article><strong>${escHtml(m.actorUsername)}</strong><span>${escHtml(m.actorContext || "Participant")}</span><time>${escHtml(m.createdAt)}</time><p>${escHtml(m.body)}</p></article>`).join("") || "<p>No discussion messages.</p>"}</div>${canMessage ? `<form data-review-thread-form data-review-thread-operation="${payload.thread ? "reply" : "create"}" data-review-session-id="${escHtml(review.session.id)}" data-review-item-id="${escHtml(item.id)}" data-review-thread-id="${escHtml(payload.thread?.id || "")}" data-review-generation="${token}"><label>Message<textarea name="body" required maxlength="10000"></textarea></label><p data-review-thread-submit-status role="status" hidden></p><button type="submit">${payload.thread ? "Reply" : "Start discussion"}</button></form>` : `<p class="review-thread-readonly" role="status">${capabilities.readOnly ? "This approved discussion is read-only." : payload.thread?.state === "Resolved" ? "This discussion is resolved. An authorized reviewer must reopen it before replies can be added." : "You do not have permission to add a message."}</p>`}${stateAction ? `<div class="review-thread-actions"><button type="button" data-review-thread-state="${stateAction}" data-thread-id="${payload.thread.id}" data-state-version="${payload.thread.stateVersion}">${stateAction === "resolve" ? "Resolve" : "Reopen"}</button></div>` : ""}`;
    panel.focus();
  }
  async function open(context = {}) {
    context = context || {};
    const sessionId = String(context.sessionId || "").trim();
    const auditId = String(context.auditId || "").trim();
    const requestId = Number(context.requestId);
    if (
      !sessionId &&
      (!auditId || !Number.isSafeInteger(requestId) || requestId <= 0)
    )
      throw new Error(
        "The approval review identity is invalid. Refresh and try again.",
      );
    const token = ++generation;
    opener = context.opener || document.activeElement;
    const endpoint = sessionId
      ? `/api/review-sessions/${encodeURIComponent(sessionId)}`
      : `/api/audits/${encodeURIComponent(auditId)}/approval-requests/${encodeURIComponent(requestId)}/review-session`;
    const options = sessionId
      ? undefined
      : {
          method: "POST",
          body: JSON.stringify({ inboxItemId: context.inboxItemId || null }),
        };
    const loaded = await atlasAuditApi(endpoint, options);
    if (token !== generation) return null;
    const loadedAuditId = String(loaded?.session?.auditId || "").trim();
    const loadedRequestId = Number(loaded?.session?.requestId);
    const loadedRevisionId = Number(loaded?.session?.submittedRevisionId);
    if (
      (!sessionId &&
        (loadedAuditId !== auditId || loadedRequestId !== requestId)) ||
      (context.submittedRevisionId != null &&
        loadedRevisionId !== Number(context.submittedRevisionId)) ||
      !loaded?.document ||
      String(loaded.document.id || loadedAuditId) !== loadedAuditId
    )
      throw new Error(
        "The server returned a review that does not match the selected request.",
      );
    if (loaded.session?.sessionStatus !== "Draft")
      throw new Error("This audit is not currently pending review.");
    clearTransientReviewSurfaces();
    review = loaded;
    finalSummary = null;
    dirty.clear();
    filter = "all";
    document.getElementById("atlasReviewWorkspace")?.remove();
    ensureShell();
    showSection(pageMap[review.session.resumeSection] || "overview");
    renderInlineReviewMode();
    await window.ATLASWorkflow?.refresh?.();
    await refreshFinalSummary();
    return review;
  }
  async function close(options = {}) {
    const saveDraft = options.saveDraft !== false;
    const restoreFocus = options.restoreFocus !== false;
    const hadReview = Boolean(review);
    clearTimeout(queueSave.timer);
    if (hadReview && saveDraft) {
      if (savePromise) await savePromise;
      while (dirty.size) await save(sectionForPage());
    }
    generation++;
    clearTransientReviewSurfaces();
    review = null;
    dirty.clear();
    filter = "all";
    threadTarget = null;
    finalSummary = null;
    dragState = null;
    document.body.classList.remove("atlas-reviewer-mode");
    window.ATLASReviewFeedback = Object.freeze([]);
    document.getElementById("atlasReviewerModeShell")?.remove();
    document.getElementById("atlasReviewThreadPanel")?.remove();
    document
      .querySelectorAll(
        "[data-review-inline-decoration],[data-review-density],.review-target-highlight",
      )
      .forEach((node) => {
        node.classList.remove("review-target-highlight");
        if (
          node.matches("[data-review-inline-decoration],[data-review-density]")
        )
          node.remove();
      });
    if (hadReview) {
      atlasMarkAllPagesDirty?.();
      atlasRenderActivePage?.({ force: true });
      window.renderActiveAuditSelect?.();
      window.ATLASAuditIssues?.render?.();
      window.ATLASWorkflow?.applyLock?.();
    }
    const focusTarget = opener;
    opener = null;
    if (restoreFocus) focusTarget?.focus?.();
  }
  async function performFinalAction(requestedAction = null) {
    if (!review) throw new Error("Reviewer Mode is not active.");
    clearTimeout(queueSave.timer);
    if (savePromise) await savePromise;
    while (dirty.size) await save(sectionForPage());
    const summaryPayload = await refreshFinalSummary();
    const actions = structuredFinalActions();
    const selectedAction = requestedAction || adaptiveFinalAction()?.action;
    const action = actions.find(
      (candidate) => candidate.action === selectedAction,
    );
    if (!summaryPayload || !action || action.disabled)
      throw new Error(
        action?.description || "No final review action is available.",
      );
    if (selectedAction === "return") {
      if (!confirm("Return this review to the assigned Analyst?")) return null;
      const result = await atlasAuditApi(
        `/api/review-sessions/${review.session.id}/return`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedVersion: review.session.draftVersion,
            early: false,
          }),
        },
      );
      window.ATLASInbox?.refresh?.();
      alert(`Audit returned to ${result.analyst.username}.`);
      await close({ saveDraft: false });
      await window.ATLASWorkflow?.refresh?.();
      return result;
    }
    if (selectedAction !== "approve")
      throw new Error("This audit is not eligible for final approval.");
    if (!confirm("Approve and publish this audit revision?")) return null;
    const versionTitle = prompt("Version title", review.document?.name || "");
    if (!String(versionTitle || "").trim())
      throw new Error("A version title is required to approve this audit.");
    const result = await atlasAuditApi(
      `/api/review-sessions/${review.session.id}/finalize-approval`,
      {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: review.session.draftVersion,
          versionTitle: String(versionTitle).trim(),
        }),
      },
    );
    window.ATLASInbox?.refresh?.();
    await close({ saveDraft: false });
    await window.ATLASWorkflow?.refresh?.();
    return result;
  }
  document.addEventListener("click", async (event) => {
    if (!review) return;
    const notePopover = event.target.closest("#atlasReviewNotePopover");
    if (notePopover) {
      const noteSave = event.target.closest("[data-review-note-save]");
      if (noteSave) {
        event.preventDefault();
        const form = noteSave.closest("[data-review-note-form]"),
          textarea = form?.querySelector('textarea[name="reviewerNote"]'),
          note = String(textarea?.value || "").trim(),
          item = items().find(
            (row) => String(row.id) === String(notePopover.dataset.reviewId),
          );
        if (!note) return textarea?.focus();
        if (
          !item ||
          !direct(item) ||
          Number(notePopover.dataset.reviewGeneration) !== generation ||
          notePopover.dataset.reviewSessionId !== String(review.session.id) ||
          !["Needs discussion", "Request changes", "Approve"].includes(
            notePopover.dataset.reviewNoteDecision,
          )
        ) {
          setStatus(
            "The review item changed. Reopen the Reviewer Note and try again.",
            true,
          );
          return closeReviewNotePopover();
        }
        noteSave.disabled = true;
        markDirty(item.id, {
          decision: notePopover.dataset.reviewNoteDecision,
          reviewerNote: note,
        });
        closeReviewNotePopover();
        renderPageDecorations();
        return;
      }
      if (event.target.closest("[data-review-note-cancel]"))
        return closeReviewNotePopover();
      const noteThread = event.target.closest("[data-review-note-thread]");
      if (noteThread) {
        event.preventDefault();
        const itemId = noteThread.dataset.reviewNoteThread;
        closeReviewNotePopover();
        return openThread(itemId);
      }
      return;
    }
    const decision = event.target.closest("button[data-review-decision]");
    if (decision) {
      const item = items().find(
        (row) => String(row.id) === String(decision.dataset.reviewId),
      );
      const presentationItem = items().find(
        (row) =>
          String(row.id) === String(decision.dataset.reviewPresentationId),
      );
      const nextDecision = decision.dataset.reviewDecision || null;
      if (!item) return;
      if (
        nextDecision === "Needs discussion" ||
        nextDecision === "Request changes" ||
        (nextDecision === "Approve" && item.severity === "warning")
      )
        return openReviewNotePopover(
          item,
          nextDecision,
          decision,
          presentationItem?.displayLabel || item.displayLabel,
        );
      markDirty(item.id, {
        decision: nextDecision,
        reviewerNote: effective(item).reviewerNote || null,
      });
      renderPageDecorations();
      return;
    }
    const toggle = event.target.closest("[data-review-toggle]");
    if (toggle) {
      const controls = toggle.closest("[data-review-controls]");
      const expanded = controls.classList.toggle("review-inline-controls-open");
      toggle.setAttribute("aria-expanded", String(expanded));
      return;
    }
    const target = event.target.closest("[data-review-target]");
    if (target) return navigate(target.dataset.reviewTarget);
    const thread = event.target.closest("[data-review-thread]");
    if (thread) return openThread(thread.dataset.reviewThread);
    if (event.target.closest("[data-review-show-all]")) {
      filter = "all";
      return renderShell();
    }
    const collapse = event.target.closest("[data-review-shell-collapse]");
    if (collapse) {
      hudCollapsed = !hudCollapsed;
      saveHudPreferences();
      return renderShell();
    }
    if (event.target.closest("[data-review-thread-close]")) {
      document.getElementById("atlasReviewThreadPanel").hidden = true;
      threadTarget = null;
      threadContext = null;
      return;
    }
    if (event.target.closest("[data-review-exit]")) return close();
    const finalActionButton = event.target.closest(
      "[data-review-final-action]",
    );
    if (finalActionButton) {
      finalActionButton.disabled = true;
      finalActionButton.setAttribute("aria-busy", "true");
      try {
        await performFinalAction(finalActionButton.dataset.reviewFinalAction);
      } catch (error) {
        setStatus(
          error.message || "The final review action could not be completed.",
          true,
        );
      } finally {
        if (finalActionButton.isConnected) {
          finalActionButton.disabled =
            adaptiveFinalAction()?.disabled !== false;
          finalActionButton.removeAttribute("aria-busy");
        }
      }
      return;
    }
    if (event.target.closest("[data-review-final-summary]")) {
      try {
        if (savePromise) await savePromise;
        while (dirty.size) await save(sectionForPage());
        const summaryPayload = await refreshFinalSummary();
        if (!summaryPayload) return;
        const summary = summaryPayload.finalSummary;
        alert(
          `Approved: ${summary.counts.approved}\nRequest changes: ${summary.counts.requestChanges}\nNeeds discussion: ${summary.counts.needsDiscussion}\nReview required: ${summary.counts.reviewRequired}`,
        );
      } catch (error) {
        setStatus(error.message, true);
      }
    }
  });
  document.addEventListener("input", (event) => {
    if (!review) return;
    if (event.target.matches("[data-review-note]"))
      markDirty(event.target.dataset.reviewNote, {
        reviewerNote: event.target.value,
      });
  });
  document.addEventListener("change", (event) => {
    if (!review || !event.target.matches("[data-review-filter]")) return;
    filter = event.target.value;
    renderShell();
  });
  document.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-review-hud-drag-handle]");
    if (
      !review ||
      !handle ||
      event.target.closest("button") ||
      event.button !== 0
    )
      return;
    const shell = document.getElementById("atlasReviewerModeShell"),
      rect = shell?.getBoundingClientRect();
    if (!shell || !rect) return;
    dragState = {
      pointerId: event.pointerId,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
    };
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  document.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const shell = document.getElementById("atlasReviewerModeShell");
    hudPosition = clampHudPosition(
      { left: event.clientX - dragState.dx, top: event.clientY - dragState.dy },
      shell,
    );
    applyHudState(shell);
  });
  document.addEventListener("pointerup", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    dragState = null;
    saveHudPreferences();
  });
  window.addEventListener("resize", () => {
    if (!review) return;
    const shell = document.getElementById("atlasReviewerModeShell");
    hudPosition = clampHudPosition(hudPosition, shell);
    applyHudState(shell);
    saveHudPreferences();
  });
  document.addEventListener("submit", async (event) => {
    if (!review) return;
    if (event.target.matches("[data-review-note-form]")) {
      event.preventDefault();
      event.target.querySelector("[data-review-note-save]")?.click();
      return;
    }
    if (!event.target.matches("[data-review-thread-form]")) return;
    event.preventDefault();
    const form = event.target;
    if (threadSubmission) return;
    const submit = form.querySelector('button[type="submit"]');
    const textarea = form.querySelector('textarea[name="body"]');
    const message = String(new FormData(form).get("body") || "").trim();
    if (!message) return textarea?.focus();
    const context = Object.freeze({
      generation: Number(form.dataset.reviewGeneration),
      sessionId: String(form.dataset.reviewSessionId || ""),
      itemId: String(form.dataset.reviewItemId || ""),
      operation: String(form.dataset.reviewThreadOperation || ""),
      threadId: String(form.dataset.reviewThreadId || ""),
    });
    const matchesCurrentContext = () =>
      Boolean(
        review &&
        context.generation === generation &&
        context.sessionId === String(review.session.id) &&
        context.itemId === String(threadTarget?.id || "") &&
        context.generation === threadContext?.generation &&
        context.operation === threadContext?.operation &&
        context.threadId === String(threadContext?.threadId || "") &&
        form.isConnected,
      );
    if (!matchesCurrentContext()) {
      setStatus("The Discussion changed. Reopen it and try again.", true);
      return;
    }
    if (
      (context.operation === "reply" &&
        (!context.threadId ||
          threadContext?.canReply !== true ||
          threadContext?.state !== "Open")) ||
      (context.operation === "create" && threadContext?.canCreate !== true)
    ) {
      setStatus("Discussion messaging is not currently available.", true);
      return;
    }
    const statusNode = form.querySelector("[data-review-thread-submit-status]");
    if (submit) {
      submit.disabled = true;
      submit.setAttribute("aria-busy", "true");
    }
    if (statusNode) {
      statusNode.hidden = false;
      statusNode.textContent =
        context.operation === "reply"
          ? "Posting reply…"
          : "Starting discussion…";
    }
    const request = (async () => {
      try {
        let payload;
        if (context.operation === "reply") {
          payload = await atlasAuditApi(
            `/api/review-discussions/${encodeURIComponent(context.threadId)}/messages`,
            { method: "POST", body: JSON.stringify({ body: message }) },
          );
        } else {
          try {
            payload = await atlasAuditApi(
              `/api/review-sessions/${encodeURIComponent(context.sessionId)}/items/${encodeURIComponent(context.itemId)}/discussions`,
              { method: "POST", body: JSON.stringify({ body: message }) },
            );
          } catch (error) {
            if (
              error.status !== 409 ||
              error.message !==
                "A discussion already exists for this review object."
            )
              throw error;
            const current = await atlasAuditApi(
              `/api/review-sessions/${encodeURIComponent(context.sessionId)}/items/${encodeURIComponent(context.itemId)}/discussions`,
            );
            if (
              !matchesCurrentContext() ||
              !current.thread?.id ||
              current.thread.state !== "Open" ||
              current.capabilities?.canReply !== true
            )
              throw new Error(
                "The Discussion changed. Refresh it before posting this message.",
              );
            payload = await atlasAuditApi(
              `/api/review-discussions/${encodeURIComponent(current.thread.id)}/messages`,
              { method: "POST", body: JSON.stringify({ body: message }) },
            );
          }
        }
        if (!matchesCurrentContext()) return payload;
        textarea.value = "";
        const current = await atlasAuditApi(
          `/api/review-sessions/${encodeURIComponent(context.sessionId)}/items/${encodeURIComponent(context.itemId)}/discussions`,
        );
        if (!matchesCurrentContext()) return payload;
        const target = items().find((row) => String(row.id) === context.itemId);
        if (target) {
          target.discussionState = current.thread?.state || null;
          target.discussionMessageCount = current.thread
            ? current.messages.length
            : null;
          renderShell();
        }
        if (matchesCurrentContext()) await openThread(context.itemId);
        return payload;
      } catch (error) {
        if (matchesCurrentContext()) {
          if (statusNode) {
            statusNode.hidden = false;
            statusNode.textContent = error.message;
          }
          setStatus(error.message, true);
        }
        return null;
      } finally {
        if (threadSubmission === request) threadSubmission = null;
        if (form.isConnected && matchesCurrentContext()) {
          if (submit) {
            submit.disabled = false;
            submit.removeAttribute("aria-busy");
          }
        }
      }
    })();
    threadSubmission = request;
    await request;
    return;
  });
  window.ATLASAuditReview = {
    open,
    close,
    isActive: () => Boolean(review),
    document: displayDocument,
    currentRenderDocument: atlasCurrentRenderDocument,
    context: () =>
      review
        ? {
            auditId: review.session.auditId,
            requestId: review.session.requestId,
            sessionId: review.session.id,
            submittedRevisionId: review.session.submittedRevisionId,
            filter,
          }
        : null,
    render: renderShell,
    navigate,
    refreshFinalSummary,
    finalAction: () => adaptiveFinalAction(),
    finalActions: () => structuredFinalActions(),
    performFinalAction,
    openReturnedFeedback: async (sessionId) => {
      const token = ++generation;
      const loaded = await atlasAuditApi(
        `/api/review-sessions/${encodeURIComponent(sessionId)}/returned-feedback`,
      );
      if (token !== generation) return null;
      clearTransientReviewSurfaces();
      review = {
        ...loaded,
        document: loaded.session.document,
        mode: "analyst-feedback",
      };
      window.ATLASReviewFeedback = Object.freeze([...(loaded.feedback || [])]);
      dirty.clear();
      filter = "all";
      ensureShell();
      const first = loaded.feedback?.[0];
      showSection(pageMap[first?.sectionKey] || "review");
      renderInlineReviewMode();
      if (first) navigate(first.reviewItemId);
      return loaded;
    },
  };
})();
