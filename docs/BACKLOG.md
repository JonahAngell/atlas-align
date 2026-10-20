# Backlog

Open items that are deliberately deferred. Each entry records what is known and what is needed to close it.

---

## Read-Only Isolation spec needs configured review inputs

**Status:** Skipped unless `PLAYWRIGHT_REVIEW_EDITABLE_AUDIT_ID` and `PLAYWRIGHT_REVIEW_SESSION_ID` are set. The rest of the Playwright suite runs in CI against a local server (`.github/workflows/playwright.yml`).

**Why:** `tests/read-only-isolation-persistence.spec.js` asserts that the reviewer's editable audit is the fixture audit and that the review session matches `PLAYWRIGHT_REVIEW_SESSION_ID`. Automatic provisioning (`provisionAutomaticReview` in `tests/helpers/reviewer.js`) now runs end to end locally: it builds a 28-step audit, submits it to `local.reviewer`, switches identity, and opens the review from the Inbox. But after the identity switch the reviewer has no editable audit selected, and the configured session ID is empty, so the first assertions cannot hold.

### Fix steps

1. Decide what automatic mode should assert: either the reviewer's editable audit is a second audit the reviewer owns, or step 1 compares against the fixture audit opened in Reviewer Mode.
2. Make `provisionAutomaticReview` return the review session ID and have the spec compare against it instead of `reviewerConfig.sessionId`.
3. Remove the `test.skip` at the top of the describe block and run the suite locally (see `README-local.md`).

---

## qTest export template missing

**Status:** Open. The qTest export is offered in the export menu (`js/16-page-shell.js:1387`) but fails.

**Why:** `exportQtestExcel()` loads `./templates/qtest-test-design-template.xlsx` (`QTEST_TEMPLATE_PATH` in `js/12-export-foundation.js`). That file has never been committed, and `server.js` does not serve a `templates/` directory. Users see "Could not load Qtest template workbook: 404".

**What the template must contain:** sheets named `Guide - Start Here` and `UAT - Disney3`; generated rows start at row 5 of the UAT sheet (`QTEST_FIRST_DATA_ROW`).

### Fix steps

1. Get the current qTest test-design template workbook from the qTest owners.
2. Commit it as `templates/qtest-test-design-template.xlsx`.
3. Serve it: add a `/templates` static mount in `server.js` with the same options as the other mounts, and `COPY --chown=1000:1000 templates ./templates` in the `Dockerfile`.
4. Export from an audit with logic steps and confirm the workbook opens in Excel with rows from row 5 of `UAT - Disney3`.

---

## Audit Issues: finish the five-phase rollout

**Status:** In progress. Source files for the early phases exist: the portable engine `js/22-audit-issue-engine.js`, the rule catalog `catalogs/audit-issue-rules.json`, the ATLAS adapter `js/23-atlas-audit-issues.js`, and the styles `css/audit-issues.css`. Completion of each phase has not been verified.

**Why:** The request set in `Audit Review Update/` replaces duplicated ad hoc validators (`js/08-step-templates-validation.js`, `js/15g-visual-ui-events.js`) with one canonical transient issue result shared by the floating panel and Readiness & Review.

**Phases** (each has a `*_feature_request_*.txt` and a matching `*_file_list_*.txt`):

1. Portable engine and data-driven rule schema. Field-relationship and application-specific rules are only represented as disabled metadata.
2. ATLAS evaluator migration into the canonical engine.
3. Floating Audit Issues panel, and Readiness & Review synced to the same result.
4. Jump and Fix actions through existing navigation and mutation paths, removal of duplicate legacy validators, and a release package. Publication stays advisory-only unless an existing gate applies.
5. Final validation and alignment of all parts.

### To close

- Check each phase's definition of done against the code and tests (`test/audit-issue-engine.test.js` and others).
- Confirm the legacy validators are removed, not just bypassed.
- Confirm Jump and Fix actions work in the browser.

---

## Workflow history and restoration-token behavior

**Status:** Deferred. `PROJECT_CONTEXT.md` states that history and restoration-token behavior remains deferred.

**Why:** History reconciliation, canonical comparison identity, preview sources, and restoration token and locking behavior are not documented as complete. Related modules exist (`js/19-audit-version-history.js`, `js/19a-audit-history-browser.js`, `src/audit-comparison.js`), but their contracts are not documented.

### To close

- Document the history and restoration contracts in `PROJECT_CONTEXT.md`.
- Add tests for restoration token and locking behavior.

---

## Workflow invalidation in the save transaction

**Status:** Deferred. `PROJECT_CONTEXT.md` says workflow details and workflow invalidation inside the save transaction are deferred to a later pass.

**Why:** Workflow state can be stale after a save until this pass is documented and verified.

### To close

- Document how workflow invalidation participates in the save transaction. Cover the failure path too.

---

## Documentation gaps

**Status:** Open. `PROJECT_CONTEXT.md` records that `README.md` and `package.json` still use field-library-focused wording that does not describe the current app scope.

### To close

- Update the README and package description to match the current app scope.

---

## Live verification not yet performed

**Status:** Open. The documentation pass in `PROJECT_CONTEXT.md` did not run these checks:

- Live PostgreSQL concurrency.
- Browser accessibility.
- Responsive behavior.
- Deployment behavior.

**Why:** The reviewed tests are mostly source and contract evidence, not live database or browser tests.

### To close

- Run the concurrency test against a live database.
- Run an accessibility audit and a responsive check in the browser.
- Verify the deployment path.

---
