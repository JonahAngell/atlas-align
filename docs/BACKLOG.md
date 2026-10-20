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
