// -----------------------------------------------------------------------------
// Deep links
// -----------------------------------------------------------------------------
// Keeps the address bar in sync with the active audit and page so links can be
// shared, and opens the audit/page named by the URL on load and back/forward.
//
//   /                                    My Audits
//   /inbox, /recently-deleted-publications
//   /audits/{auditId}                    audit overview
//   /audits/{auditId}/{page}             audit page
//
// Keep these lists in sync with ATLAS_SPA_* in server.js.
const ATLAS_ROUTE_WORKSPACE_PAGES = new Set([
  "my-audits",
  "inbox",
  "recently-deleted-publications",
]);
const ATLAS_ROUTE_AUDIT_PAGES = new Set([
  "overview",
  "fields",
  "steps",
  "display-fields",
  "preview",
  "review",
  "export",
  "history",
]);
const ATLAS_ROUTE_AUDIT_ID = /^[A-Za-z0-9._~-]{1,128}$/;

/**
 * Parses a URL path into a route, or returns null when it names nothing valid.
 * @param {string} pathname - location.pathname.
 */
function atlasParseRoute(pathname) {
  const parts = String(pathname || "/")
    .split("/")
    .filter(Boolean);
  if (!parts.length) return { page: "my-audits" };
  if (parts.length === 1 && ATLAS_ROUTE_WORKSPACE_PAGES.has(parts[0]))
    return { page: parts[0] };
  if (parts[0] !== "audits" || parts.length < 2 || parts.length > 3)
    return null;
  let auditId;
  try {
    auditId = decodeURIComponent(parts[1]);
  } catch {
    return null;
  }
  const page = parts[2] || "overview";
  if (!ATLAS_ROUTE_AUDIT_ID.test(auditId) || !ATLAS_ROUTE_AUDIT_PAGES.has(page))
    return null;
  return { auditId, page };
}

/**
 * Returns the shareable path for a page in the current app state.
 * Workbook and unsaved audits have no shareable path and map to "/".
 * @param {string} page - Canonical page id.
 */
function atlasRoutePathFor(page) {
  if (page === "my-audits") return "/";
  if (ATLAS_ROUTE_WORKSPACE_PAGES.has(page)) return `/${page}`;
  const value = String(state.activeAuditValue || "");
  if (!value.startsWith("database:")) return "/";
  const auditId = value.slice("database:".length);
  if (!ATLAS_ROUTE_AUDIT_ID.test(auditId)) return "/";
  return `/audits/${encodeURIComponent(auditId)}/${page}`;
}

const atlasInitialRoute = atlasParseRoute(location.pathname);
let atlasRouteSyncEnabled = false;
let atlasApplyingRoute = false;

/**
 * Called by showSection after a page becomes active. Pushes a history entry
 * when the path changes, or replaces it while a URL-driven navigation runs.
 * @param {string} page - Canonical page id that was shown.
 */
function atlasSyncRouteForPage(page) {
  if (!atlasRouteSyncEnabled) return;
  if (window.ATLASAuditReview?.isActive?.()) return;
  const path = atlasRoutePathFor(page);
  if (path === location.pathname) return;
  if (atlasApplyingRoute) history.replaceState({ page }, "", path);
  else history.pushState({ page }, "", path);
}

/**
 * Explains why a linked audit could not be opened.
 * @param {any} error - Error thrown while loading the audit.
 */
function atlasRouteErrorMessage(error) {
  if (error?.status === 404)
    return "That audit link points to an audit that doesn't exist or was deleted. Showing My Audits instead; ask the sender for a new link.";
  if (error?.status === 403)
    return "You don't have access to the linked audit. Showing My Audits instead; ask the audit owner to share it with you.";
  return `The linked audit couldn't be opened (${error?.message || "unknown error"}). Showing My Audits instead; reload the page to try again.`;
}

/**
 * Opens the audit and page named by a route.
 * @param {{auditId?: string, page: string}} route - Parsed route.
 */
async function atlasApplyRoute(route) {
  atlasApplyingRoute = true;
  try {
    if (route.auditId) {
      const target = `database:${route.auditId}`;
      if (window.ATLASAuditReview?.isActive?.())
        await window.ATLASAuditReview.close({ restoreFocus: false });
      if (target !== state.activeAuditValue) {
        await switchActiveAudit(target);
        // Unsaved changes could not be saved, or another switch was running.
        if (state.activeAuditValue !== target) {
          history.replaceState(
            null,
            "",
            atlasRoutePathFor(atlasActivePage?.() || "my-audits"),
          );
          return false;
        }
      }
    }
    showSection(route.page);
    return true;
  } catch (error) {
    status(atlasRouteErrorMessage(error), "error");
    showSection("my-audits");
    history.replaceState(null, "", "/");
    return false;
  } finally {
    atlasApplyingRoute = false;
  }
}

/**
 * Starts URL syncing and opens the route the app was loaded with.
 * Called once at the end of init().
 */
async function atlasOpenInitialRoute() {
  atlasRouteSyncEnabled = true;
  if (!atlasInitialRoute) {
    status(
      "That link doesn't match a page in ATLAS Align. Showing My Audits instead; check the link and try again.",
      "warn",
    );
    history.replaceState(null, "", "/");
    return false;
  }
  if (atlasInitialRoute.page === "my-audits") {
    history.replaceState(null, "", "/");
    return true;
  }
  return atlasApplyRoute(atlasInitialRoute);
}

window.addEventListener("popstate", () => {
  if (!atlasRouteSyncEnabled) return;
  atlasApplyRoute(atlasParseRoute(location.pathname) || { page: "my-audits" });
});

// -----------------------------------------------------------------------------
// Audit identity: custom audit IDs and Copy Link
// -----------------------------------------------------------------------------
// A draft's ID changes locally. A saved audit is renamed on the server, which
// cascades the new ID to its revisions, steps, and approvals; links shared with
// the old ID stop working.
const ATLAS_AUDIT_ID_INPUT = /^[A-Za-z0-9]{1,64}$/;
let atlasRenamingAudit = false;

/**
 * Returns true when the current audit has a database revision.
 */
function atlasAuditIsSaved() {
  const persistence = state.auditPersistence || {};
  return Boolean(
    state.audit?.id &&
    persistence.auditId === state.audit.id &&
    persistence.revisionId,
  );
}

/**
 * Validates a user-entered audit ID. A blank value or the suggested
 * auto-generated ID is accepted as the suggestion.
 * @param {string} value - Text the user entered.
 * @param {string} suggested - Auto-generated ID offered as the default.
 * @returns {{id: string} | {error: string}}
 */
function atlasValidateAuditIdInput(value, suggested) {
  const id = String(value ?? "").trim();
  if (!id || id === suggested) return { id: suggested };
  if (id.length > 64)
    return {
      error: `Audit ID is ${id.length} characters long. Use 64 or fewer letters and numbers.`,
    };
  if (!ATLAS_AUDIT_ID_INPUT.test(id))
    return {
      error:
        "Audit ID can only contain letters and numbers. Remove spaces, dashes, and other symbols.",
    };
  return { id };
}

/**
 * Asks for an audit ID before creating an audit.
 * @param {string} suggested - Auto-generated ID used when the field is left as is.
 * @param {string} [problem] - Message explaining why the previous ID was rejected.
 * @returns {string | null} The chosen ID, or null when the user cancels.
 */
function atlasPromptAuditId(suggested, problem = "") {
  let message = problem;
  let current = suggested;
  for (;;) {
    const answer = window.prompt(
      `${message ? `${message}\n\n` : ""}Audit ID (letters and numbers only). Keep the suggested ID or type your own:`,
      current,
    );
    if (answer === null) return null;
    const result = atlasValidateAuditIdInput(answer, suggested);
    if (result.id) return result.id;
    message = result.error;
    current = answer;
  }
}

/**
 * Shows an audit ID error under the overview field.
 * @param {string} message - What went wrong and how to fix it.
 */
function atlasShowAuditIdError(message) {
  if (!e.auditIdInput || !e.auditIdError) return;
  e.auditIdError.textContent = message;
  e.auditIdError.hidden = false;
  e.auditIdInput.setAttribute("aria-invalid", "true");
}

/**
 * Clears the audit ID error under the overview field.
 */
function atlasClearAuditIdError() {
  if (!e.auditIdInput || !e.auditIdError) return;
  e.auditIdError.textContent = "";
  e.auditIdError.hidden = true;
  e.auditIdInput.removeAttribute("aria-invalid");
}

/**
 * Renders the audit ID field and Copy Link button for the given audit.
 * @param {object} audit - Audit document being displayed.
 */
function atlasRenderAuditIdentity(audit) {
  const saved = atlasAuditIsSaved();
  const locked = saved && Boolean(atlasAuditIsWorkflowLocked?.());
  if (e.auditIdInput) {
    if (document.activeElement !== e.auditIdInput && !atlasRenamingAudit)
      e.auditIdInput.value = audit?.id || "";
    e.auditIdInput.readOnly =
      locked ||
      atlasRenamingAudit ||
      Boolean(atlasIsReviewerMode?.()) ||
      !audit?.id;
  }
  if (e.auditIdHint)
    e.auditIdHint.textContent = locked
      ? "The ID can't change while the audit is pending approval, locked after publishing, or read-only for you."
      : saved
        ? "Letters and numbers only. Changing the ID of a saved audit breaks links shared with the old ID."
        : "Letters and numbers only. The ID is kept when you save the audit.";
  const shareable = String(state.activeAuditValue || "").startsWith(
    "database:",
  );
  if (e.copyAuditLinkBtn) e.copyAuditLinkBtn.disabled = !shareable;
  if (e.copyAuditLinkHint) e.copyAuditLinkHint.hidden = shareable;
}

/**
 * Explains why the server refused to rename an audit.
 * @param {any} error - Error thrown by atlasAuditApi.
 */
function atlasRenameErrorMessage(error) {
  if (error?.status === 403)
    return "You don't have permission to change this audit's ID. Ask the audit owner to change it.";
  // 400, 404, and 409 messages already say what happened and what to do.
  if (error?.status >= 400 && error?.status < 500 && error.message)
    return error.message;
  return `The audit ID wasn't changed because the server couldn't complete the request (${error?.message || "no response"}). Try again.`;
}

/**
 * Renames a saved audit on the server and moves the app onto the new ID.
 * @param {string} newId - Validated new audit ID.
 */
async function atlasRenameSavedAudit(newId) {
  const input = e.auditIdInput;
  const oldId = state.audit.id;
  if (
    !window.confirm(
      `Change the audit ID from ${oldId} to ${newId}?\n\nLinks shared with the old ID will stop working. Send coworkers the new link after the change.`,
    )
  ) {
    input.value = oldId;
    return false;
  }
  atlasRenamingAudit = true;
  input.setAttribute("aria-busy", "true");
  atlasRenderAuditIdentity(state.audit);
  try {
    if (!(await atlasSaveIfDirty("change audit ID"))) {
      atlasShowAuditIdError(
        "Your latest edits couldn't be saved, so the ID wasn't changed. Resolve the save problem shown above, then change the ID again.",
      );
      return false;
    }
    if (state.audit?.id !== oldId) return false;
    const payload = await atlasAuditApi(
      `/api/audits/${encodeURIComponent(oldId)}/rename`,
      {
        method: "POST",
        body: JSON.stringify({
          newId,
          expectedRevisionId: state.auditPersistence.revisionId,
        }),
      },
    );
    const renamedId = payload?.audit?.id || newId;
    if (state.audit?.id === oldId) {
      state.audit.id = renamedId;
      state.auditPersistence.auditId = renamedId;
      state.auditPersistence.revisionId =
        payload?.revision?.id ?? state.auditPersistence.revisionId;
      state.auditPersistence.revisionNumber =
        payload?.revision?.number ?? state.auditPersistence.revisionNumber;
      state.auditPersistence.access =
        payload?.access || state.auditPersistence.access;
      state.activeAuditValue = `database:${renamedId}`;
      updateActiveAuditBaseline?.();
    }
    state.databaseAudits = (state.databaseAudits || []).filter(
      (item) => item.id !== oldId,
    );
    atlasPatchDatabaseAuditListEntry?.(payload, state.audit);
    const path = atlasRoutePathFor(atlasActivePage?.() || "overview");
    if (path !== location.pathname) history.replaceState(null, "", path);
    atlasClearAuditIdError();
    window.ATLASWorkflow?.refresh?.();
    status(
      `Audit ID changed to ${renamedId}. Links that use ${oldId} no longer work; copy the new link to share it.`,
      "ok",
    );
    return true;
  } catch (error) {
    input.value = oldId;
    atlasShowAuditIdError(atlasRenameErrorMessage(error));
    if (error?.code === "AUDIT_PENDING_APPROVAL_LOCKED")
      window.ATLASWorkflow?.refresh?.();
    return false;
  } finally {
    atlasRenamingAudit = false;
    input.removeAttribute("aria-busy");
    atlasRenderAuditIdentity(state.audit);
  }
}

/**
 * Applies an edited audit ID: locally for a draft, on the server for a saved
 * audit.
 */
async function atlasHandleAuditIdChange() {
  const input = e.auditIdInput;
  if (!input || input.readOnly || !state.audit) return;
  const result = atlasValidateAuditIdInput(input.value, state.audit.id);
  if (result.error) return atlasShowAuditIdError(result.error);
  atlasClearAuditIdError();
  input.value = result.id;
  if (result.id === state.audit.id) return;
  if (atlasAuditIsSaved()) return atlasRenameSavedAudit(result.id);
  state.audit.id = result.id;
  state.auditPersistence.auditId = null;
  state.auditPersistence.revisionId = null;
  state.activeAuditValue = `draft:${result.id}`;
  renderActiveAuditSelect?.();
  scheduleAutosave?.();
  status(`Audit ID changed to ${result.id}. Save the audit to keep it.`, "ok");
}

/**
 * Returns the full shareable URL for the active audit page, or "" when the
 * audit has not been saved to the database.
 * @param {string} page - Canonical page id that is showing.
 */
function atlasAuditLinkFor(page) {
  const auditPage = ATLAS_ROUTE_AUDIT_PAGES.has(page) ? page : "overview";
  const path = atlasRoutePathFor(auditPage);
  return path === "/" ? "" : `${location.origin}${path}`;
}

/**
 * Copies text with the Clipboard API, falling back to a hidden textarea.
 * @param {string} text - Text to copy.
 */
async function atlasCopyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the textarea fallback.
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

/**
 * Copies a link to the active audit page.
 */
async function atlasCopyAuditLink() {
  const link = atlasAuditLinkFor(atlasActivePage?.() || "overview");
  if (!link)
    return status(
      "This audit has no link yet because it isn't saved to the database. Save the audit, then copy the link.",
      "warn",
    );
  if (await atlasCopyText(link))
    return status(
      "Link copied. Anyone with access to this audit can open it.",
      "ok",
    );
  status(
    `Your browser blocked clipboard access. Copy this link manually: ${link}`,
    "warn",
  );
}

if (typeof e !== "undefined") {
  e.auditIdInput?.addEventListener("change", atlasHandleAuditIdChange);
  e.auditIdInput?.addEventListener("input", () => {
    if (e.auditIdInput.getAttribute("aria-invalid") === "true")
      atlasClearAuditIdError();
  });
  e.copyAuditLinkBtn?.addEventListener("click", () => {
    atlasCopyAuditLink();
  });
}
