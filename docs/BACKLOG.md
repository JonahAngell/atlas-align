# Backlog

Open items that are deliberately deferred. Each entry records what is known and what is needed to close it.

---

## Playwright CI job disabled

**Status:** Disabled. The `playwright` job in `.github/workflows/playwright.yml` has `if: ${{ false }}`. The `test` job still runs.

**Why:** The job fails on every push because the Playwright config requires a public preview URL that CI does not provide.

### Recent failures

| Date (UTC)       | Run ID      | Branch / commit                                                    | Result  |
| ---------------- | ----------- | ------------------------------------------------------------------ | ------- |
| 2026-10-19 23:34 | 39342460207 | `main`, `build: regenerate styles bundle and bump version`         | failure |
| 2026-10-20 02:41 | 39360292073 | `feature-556-custom-source-logic-builder` (PR #2)                  | failure |
| 2026-10-20 02:46 | 39360739889 | `main`, `feat: sync logic builder catalog, styles, and page shell` | failure |

Error in every run (job `playwright`, step `Run Playwright tests`):

```
Error: PLAYWRIGHT_BASE_URL is required. Set it in .env to the public StudioShare Preview URL.
Process completed with exit code 1.
```

The `test` job (`npm ci`, `npm test`, `git diff --check`) passed in the same runs. The failure is configuration, not a test regression.

### Fix steps for a future update

1. Get the public StudioShare preview URL for this app. It is the Launch preview URL for the branch being tested.
2. Store it as a GitHub Actions repository variable or secret named `PLAYWRIGHT_BASE_URL`:
   - GitHub: **Settings > Secrets and variables > Actions**, then add `PLAYWRIGHT_BASE_URL`.
   - Or with the CLI: `gh variable set PLAYWRIGHT_BASE_URL --body "https://<preview-url>"`
3. Make sure the workflow passes it to the test step. Add this under the `Run Playwright tests` step:
   ```yaml
   env:
     PLAYWRIGHT_BASE_URL: ${{ vars.PLAYWRIGHT_BASE_URL }}
   ```
   Use `secrets.PLAYWRIGHT_BASE_URL` instead if it is stored as a secret.
4. Confirm the suite passes locally against the same URL before re-enabling CI:
   ```bash
   PLAYWRIGHT_BASE_URL="https://<preview-url>" npx playwright test
   ```
5. Re-enable the job by removing the `if: ${{ false }}` line and its comment from `.github/workflows/playwright.yml`.
6. Open a PR and confirm the `playwright` job is green before merging.

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
