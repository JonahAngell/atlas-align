import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source = fs.readFileSync(
  new URL("../js/27-audit-review-mode.js", import.meta.url),
  "utf8",
);
const stateSource = fs.readFileSync(
  new URL("../js/01-state-dom.js", import.meta.url),
  "utf8",
);
const persistence = fs.readFileSync(
  new URL("../js/04-persistence.js", import.meta.url),
  "utf8",
);
const database = fs.readFileSync(
  new URL("../js/18-audit-database.js", import.meta.url),
  "utf8",
);
const repository = fs.readFileSync(
  new URL("../src/audit-review-repository.js", import.meta.url),
  "utf8",
);

test("review lifecycle contract maps authoritative status and fails closed", () => {
  assert.match(repository, /sessionStatus: s\.rows\[0\]\.session_status/);
  assert.match(source, /if \(loaded\.session\?\.sessionStatus !== "Draft"\)/);
  assert.match(source, /review\.session\?\.sessionStatus === "Draft"/);
  assert.doesNotMatch(source, /sessionStatus\s*(?:\?\?|\|\|)\s*["']Draft["']/);
});

test("review mode remains detached from editable audit persistence", () => {
  assert.doesNotMatch(source, /state\.audit\s*=/);
  assert.match(stateSource, /function atlasDisplayDocument/);
  assert.match(persistence, /ATLASAuditReview\?\.isActive/);
  assert.match(database, /ATLASAuditReview\?\.isActive/);
});
test("Package 2D.3 uses existing-page Reviewer Mode", () => {
  assert.match(source, /atlasReviewerModeShell/);
  assert.match(source, /review-inline-decoration/);
  assert.doesNotMatch(source, /review-page-adapter|review-object-card/);
  assert.match(source, /showSection\(pageMap/);
  assert.doesNotMatch(source, /review-workspace|review-object-card/);
});
test("progress filters stoplights summaries and discussions are present", () => {
  for (const token of [
    "reviewer-mode-progress",
    "data-review-filter",
    "review-stoplights",
    "review-inline-status",
    "atlasReviewNotePopover",
    "atlasReviewThreadPanel",
    "open-discussions",
    "resolved-discussions",
  ])
    assert.ok(source.includes(token), token);
});
test("navigation is stable-id and virtualization aware", () => {
  assert.match(source, /atlasRevealLogicStep/);
  assert.match(source, /stableItemKey/);
  assert.match(source, /scrollIntoView/);
  assert.match(source, /generation/);
});

test("Reviewer Mode rejects null or incomplete identity without dereferencing it", () => {
  assert.match(source, /context = context \|\| \{\}/);
  assert.match(source, /The approval review identity is invalid/);
  assert.match(source, /Number\.isSafeInteger\(requestId\)/);
});

test("Reviewer Mode sends the repository draft change contract", () => {
  assert.match(source, /sectionKey: original\.sectionKey/);
  assert.match(source, /stableItemKey: original\.stableItemKey/);
  assert.match(
    source,
    /resumeItemKey: changes\[0\]\?\.stableItemKey \|\| null/,
  );
  assert.match(source, /changes,/);
  assert.doesNotMatch(source, /items: changes/);
});

test("Reviewer Mode cleanup is idempotent and terminal return skips a second draft save", () => {
  assert.match(source, /async function close\(options = \{\}\)/);
  assert.match(source, /const saveDraft = options\.saveDraft !== false/);
  assert.match(source, /generation\+\+/);
  assert.match(source, /review = null/);
  assert.match(source, /dirty\.clear\(\)/);
  assert.match(source, /threadTarget = null/);
  assert.match(source, /review-target-highlight/);
  assert.match(source, /close\(\{ saveDraft: false \}\)/);
});

test("Stage 2 HUD exposes synchronized progress, filters, final actions, and preferences", () => {
  assert.match(source, /atlasAlignReviewerHud:/);
  assert.match(source, /function clampHudPosition/);
  assert.match(source, /function loadHudPreferences/);
  assert.match(source, /function saveHudPreferences/);
  assert.match(source, /data-review-shell-collapse/);
  assert.match(source, /aria-expanded=/);
  assert.match(source, /data-review-hud-drag-handle/);
  assert.match(source, /data-review-final-action/);
  assert.match(source, /finalize-approval/);
  assert.match(source, /Commented/);
  assert.match(source, /Show all items/);
});

test("inline Reviewer Mode binds canonical items to native audit objects", () => {
  assert.match(source, /function nativeReviewTargets/);
  assert.match(source, /function decorateNativeObject/);
  assert.match(source, /data-review-inline-decoration/);
  assert.match(source, /review-inline-status/);
  assert.match(source, /Linked source decision|!direct\(item\)/);
  assert.match(source, /function openReviewNotePopover/);
});

test("draft conflict preserves local decisions for recovery", () => {
  assert.match(source, /Your unsaved decisions remain available/);
  assert.doesNotMatch(
    source,
    /review = await atlasAuditApi\(\s*`\/api\/review-sessions\/\$\{review\.session\.id\}`/,
  );
});

test("Reviewer Mode flushes in-flight and newly dirty work before navigation cleanup", () => {
  assert.match(source, /if \(savePromise\) await savePromise/);
  assert.match(source, /while \(dirty\.size\) await save/);
  assert.match(source, /clearTimeout\(queueSave\.timer\)/);
  assert.match(source, /restoreFocus !== false/);
});

test("audit switching and Workspace navigation close Reviewer Mode before context changes", () => {
  const library = fs.readFileSync(
    new URL("../js/11-repo-library.js", import.meta.url),
    "utf8",
  );
  const databaseSource = fs.readFileSync(
    new URL("../js/18-audit-database.js", import.meta.url),
    "utf8",
  );
  assert.match(library, /ATLASAuditReview\.close\(\{ restoreFocus: false \}\)/);
  assert.ok(
    library.indexOf("ATLASAuditReview.close") <
      library.indexOf(
        'atlasSaveIfDirty("audit change")',
        library.indexOf("async function switchActiveAudit"),
      ),
  );
  assert.match(databaseSource, /workspacePages\.has\(target\)/);
  assert.ok(
    databaseSource.indexOf(
      "ATLASAuditReview.close",
      databaseSource.indexOf("async function atlasNavigateToSection"),
    ) <
      databaseSource.indexOf(
        "showSection(target)",
        databaseSource.indexOf("async function atlasNavigateToSection"),
      ),
  );
});

test("adaptive final action is authoritative and audit-bound", () => {
  assert.match(source, /function reviewContextIsCurrent/);
  assert.match(source, /function adaptiveFinalAction/);
  assert.match(source, /function refreshFinalSummary/);
  assert.match(source, /summary\.approvalEligible/);
  assert.match(source, /earlyReturnEligible|returnEligible/);
  assert.match(source, /features\.publication/);
  assert.match(source, /features\.decisions/);
  assert.match(source, /data-review-final-action/);
  assert.doesNotMatch(source, /data-review-send-back/);
  assert.doesNotMatch(source, /data-review-approve/);
});

test("draft saves retain changes made while a request is in flight", () => {
  assert.match(source, /const savingEntries = \[\.\.\.dirty\.entries\(\)\]/);
  assert.match(
    source,
    /if \(dirty\.get\(key\) === savedValue\) dirty\.delete\(key\)/,
  );
});

test("Reviewer Mode resolves detached render content and clears prior transient surfaces", () => {
  assert.match(source, /function atlasCurrentRenderDocument/);
  assert.match(
    source,
    /window\.atlasCurrentRenderDocument = atlasCurrentRenderDocument/,
  );
  assert.match(source, /function clearTransientReviewSurfaces/);
  assert.match(source, /function renderInlineReviewMode/);
  assert.match(source, /clearTransientReviewSurfaces\(\);\s*review = loaded/);
  assert.match(source, /review = null/);
  assert.doesNotMatch(source, /state\.audit\s*=/);
});

test("Reviewer Mode reapplies and restores the shared workflow lock at lifecycle boundaries", () => {
  const calls = source.match(/ATLASWorkflow\?\.applyLock\?\.\(\)/g) || [];
  assert.ok(calls.length >= 3);
  assert.match(
    source,
    /function renderInlineReviewMode\([\s\S]*?ATLASWorkflow\?\.applyLock/,
  );
  assert.match(source, /await window\.ATLASWorkflow\?\.refresh\?\.\(\)/);
  assert.match(
    source,
    /function renderShell\([\s\S]*?renderPageDecorations\(\);[\s\S]*?ATLASWorkflow\?\.applyLock/,
  );
  assert.match(
    source,
    /async function close\([\s\S]*?ATLASWorkflow\?\.applyLock/,
  );
});

test("inline review CSS keeps direct stoplights and non-direct status accessible beside Discussion", () => {
  const css = fs.readFileSync(
    new URL("../css/audit-review.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /\.review-stoplights[\s\S]*?flex-wrap: nowrap/);
  assert.match(css, /\.review-inline-decoration[\s\S]*?flex-wrap: wrap/);
  assert.match(css, /\.review-inline-controls[\s\S]*?> \.review-inline-status/);
  assert.doesNotMatch(
    css,
    /\.review-inline-object:hover \.review-inline-status,/,
  );
  assert.match(css, /\.review-inline-discussion[\s\S]*?flex: 0 0 auto/);
});

test("generated References present and edit their linked direct Source decision", () => {
  assert.match(source, /function decisionAuthority\(item\)/);
  assert.match(source, /item\.itemType !== "logic-reference"/);
  assert.match(source, /candidate\.sectionKey === "sources"/);
  assert.match(source, /candidate\.canonicalObjectKey === item\.linkedItemKey/);
  assert.match(source, /linked\.length === 1 \? linked\[0\] : null/);
  assert.match(
    source,
    /data-review-id="\$\{escHtml\(authority\.id\)\}" data-review-presentation-id="\$\{escHtml\(item\.id\)\}"/,
  );
  assert.match(source, /const authority = decisionAuthority\(item\)/);
  assert.doesNotMatch(source, /data-review-id="\$\{item\.id\}" aria-pressed/);
});

test("linked Reference state resolves through the Source dirty override", () => {
  assert.match(
    source,
    /const authority = decisionAuthority\(item\) \|\| item;[\s\S]*?dirty\.get\(keyFor\(authority\)\) \|\| authority/,
  );
  assert.match(source, /if \(!item \|\| !direct\(item\)\) return/);
  assert.match(source, /renderPageDecorations\(\)/);
});

test("known Discussion replies route directly to the message endpoint", () => {
  assert.match(source, /operation: payload\.thread \? "reply" : "create"/);
  assert.match(source, /data-review-thread-operation=/);
  assert.match(
    source,
    /if \(context\.operation === "reply"\)[\s\S]*?\/api\/review-discussions\/\$\{encodeURIComponent\(context\.threadId\)\}\/messages/,
  );
  assert.doesNotMatch(
    source,
    /atlasAuditApi\(\s*`\/api\/review-sessions\/\$\{review\.session\.id\}\/items\/\$\{threadTarget\.id\}\/discussions`/,
  );
});

test("Discussion submission binds immutable context and blocks duplicate activation", () => {
  assert.match(source, /threadSubmission = null/);
  assert.match(source, /if \(threadSubmission\) return/);
  assert.match(source, /const context = Object\.freeze\(\{/);
  assert.match(source, /context\.generation === generation/);
  assert.match(source, /context\.sessionId === String\(review\.session\.id\)/);
  assert.match(
    source,
    /context\.itemId === String\(threadTarget\?\.id \|\| ""\)/,
  );
  assert.match(source, /submit\.setAttribute\("aria-busy", "true"\)/);
});

test("Discussion creation race recovery is narrow and capability checked", () => {
  assert.match(
    source,
    /error\.status !== 409 \|\|[\s\S]*?A discussion already exists for this review object\./,
  );
  assert.match(source, /current\.thread\.state !== "Open"/);
  assert.match(source, /current\.capabilities\?\.canReply !== true/);
  assert.match(
    source,
    /\/api\/review-discussions\/\$\{encodeURIComponent\(current\.thread\.id\)\}\/messages/,
  );
});

test("Discussion failures preserve text and restore the current form", () => {
  const discussionSubmit = source.slice(
    source.indexOf(
      'if (!event.target.matches("[data-review-thread-form]")) return;',
    ),
    source.indexOf(
      "window.ATLASAuditReview =",
      source.indexOf(
        'if (!event.target.matches("[data-review-thread-form]")) return;',
      ),
    ),
  );
  assert.ok(
    discussionSubmit.indexOf('textarea.value = ""') >
      discussionSubmit.indexOf("await atlasAuditApi"),
  );
  assert.match(discussionSubmit, /catch \(error\) \{/);
  assert.match(discussionSubmit, /statusNode\.textContent = error\.message/);
  assert.match(discussionSubmit, /submit\.disabled = false/);
  assert.match(discussionSubmit, /submit\.removeAttribute\("aria-busy"\)/);
});

test("Reviewer Note editor is anchored to the active inline decoration", () => {
  assert.match(
    source,
    /trigger\.closest\("\[data-review-inline-decoration\]"\)/,
  );
  assert.match(source, /decoration\.append\(popover\)/);
  assert.doesNotMatch(source, /document\.body\.append\(popover\)/);
  assert.doesNotMatch(source, /popover\.style\.(?:left|top)/);
});

test("Reviewer Note Save decision uses an explicit action", () => {
  assert.match(source, /data-review-note-save/);
  assert.match(source, /type="button" data-review-note-save/);
  assert.match(
    source,
    /const noteSave = event\.target\.closest\("\[data-review-note-save\]"\)/,
  );
  assert.match(source, /noteSave\.disabled = true/);
  assert.match(
    source,
    /if \(event\.target\.matches\("\[data-review-note-form\]"\)\) \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?\[data-review-note-save\]/,
  );
  assert.doesNotMatch(source, /<button type="submit">Save decision<\/button>/);
});

test("Reviewer Note Save validates immutable review context and direct authority", () => {
  assert.match(
    source,
    /popover\.dataset\.reviewGeneration = String\(generation\)/,
  );
  assert.match(
    source,
    /popover\.dataset\.reviewSessionId = String\(review\?\.session\?\.id \|\| ""\)/,
  );
  assert.match(
    source,
    /String\(row\.id\) === String\(notePopover\.dataset\.reviewId\)/,
  );
  assert.match(source, /!direct\(item\)/);
  assert.match(
    source,
    /Number\(notePopover\.dataset\.reviewGeneration\) !== generation/,
  );
  assert.match(
    source,
    /notePopover\.dataset\.reviewSessionId !== String\(review\.session\.id\)/,
  );
  assert.match(source, /markDirty\(item\.id, \{/);
});

test("Reviewer Note actions are independent and focus has a replacement fallback", () => {
  assert.match(source, /data-review-note-thread=/);
  assert.match(
    source,
    /const noteThread = event\.target\.closest\("\[data-review-note-thread\]"\)/,
  );
  assert.match(
    source,
    /closeReviewNotePopover\(\);[\s\S]*?return openThread\(itemId\)/,
  );
  assert.match(source, /returnTo\?\.isConnected \? returnTo : fallback/);
});

test("Reviewer Note context is isolated from actionable decision selectors", () => {
  assert.match(source, /popover\.dataset\.reviewNoteDecision = decision/);
  assert.doesNotMatch(source, /popover\.dataset\.reviewDecision = decision/);
  assert.match(source, /notePopover\.dataset\.reviewNoteDecision/);
});

test("Reviewer Note is an isolated interaction boundary before generic decisions", () => {
  const boundaryIndex = source.indexOf(
    'event.target.closest("#atlasReviewNotePopover")',
  );
  const decisionIndex = source.indexOf(
    'event.target.closest("button[data-review-decision]")',
  );
  assert.ok(boundaryIndex >= 0);
  assert.ok(decisionIndex > boundaryIndex);
  assert.match(
    source.slice(boundaryIndex, decisionIndex),
    /if \(notePopover\) \{[\s\S]*?data-review-note-save[\s\S]*?data-review-note-cancel[\s\S]*?data-review-note-thread[\s\S]*?return;[\s\S]*?\}/,
  );
  assert.doesNotMatch(
    source,
    /event\.target\.closest\("\[data-review-decision\]"\)/,
  );
});

test("Reviewer Note Save reads isolated context and retains direct-authority safeguards", () => {
  assert.match(source, /decision: notePopover\.dataset\.reviewNoteDecision/);
  assert.match(source, /!direct\(item\)/);
  assert.match(
    source,
    /Number\(notePopover\.dataset\.reviewGeneration\) !== generation/,
  );
  assert.match(
    source,
    /notePopover\.dataset\.reviewSessionId !== String\(review\.session\.id\)/,
  );
  assert.match(source, /noteSave\.disabled = true/);
  assert.match(source, /markDirty\(item\.id, \{/);
});

test("Reviewer Mode exposes the shared structured final-action adapter", () => {
  assert.match(source, /async function performFinalAction/);
  assert.match(source, /performFinalAction,/);
  assert.match(source, /refreshFinalSummary,/);
  assert.match(source, /finalAction: \(\) => adaptiveFinalAction\(\)/);
  assert.match(source, /finalActions: \(\) => structuredFinalActions\(\)/);
  assert.match(source, /function structuredFinalActions/);
  assert.match(
    source,
    /Approve every direct review item and resolve every applicable Discussion/,
  );
  assert.match(source, /early: false/);
});
test("HUD uses authoritative persisted counts when no dirty values remain", () => {
  assert.match(source, /authoritativeCounts = !dirty\.size/);
  assert.match(source, /finalSummary\?\.finalSummary\?\.counts/);
  assert.match(source, /reviewRequired/);
});

test("terminal review actions refresh authoritative workflow capabilities after closing", () => {
  const terminal = source.slice(
    source.indexOf("async function performFinalAction"),
    source.indexOf(
      "document.addEventListener",
      source.indexOf("async function performFinalAction"),
    ),
  );
  const refreshes = terminal.match(/ATLASWorkflow\?\.refresh\?\.\(\)/g) || [];
  assert.ok(refreshes.length >= 2);
});
