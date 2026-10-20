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
