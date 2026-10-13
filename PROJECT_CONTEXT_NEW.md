# ATLAS Align Project Context

## Document Purpose and Maintenance

This document records the current functional and architectural contracts of ATLAS Align. It is organized by behavior and ownership rather than by exhaustive file or function inventory. Current source code, migrations, SQL, and tests are authoritative; the prior `PROJECT_CONTEXT.md` is historical reference only.

This document is the finalized current-state context rebuilt across five source-reviewed passes. Update it when a documented contract or authoritative owner changes, not for private-helper churn.

## Application Overview

**Application:** ATLAS Align  
**Application version:** `v2.7.6`  
**Authoritative version source:** `ATLAS_APP_VERSION` in `js/00-config-utils.js`

ATLAS Align is a browser application for defining and maintaining audit requirements. In the reviewed scope, users can locate audits, create or duplicate an audit, switch among database audits, import audit JSON, recover an in-progress browser draft, save revisioned audit documents to PostgreSQL, archive audits, and administer archived audits through Deleted Items.

The reviewed implementation uses:

- HTML partials and feature CSS for the browser UI.
- Ordered classic JavaScript scripts with a shared global runtime.
- Node.js 22 or later with Express 4.
- PostgreSQL through `pg`.
- Docker for production packaging and Docker Compose for local app/database execution.
- StudioShare Launch configuration under `.launch/`, including OPA policy and database migrations.

`package.json` is named `atlas-field-library-backend` and its description still focuses on the field-library backend. That package metadata does not fully describe the broader ATLAS Align application shipped by the current Dockerfile and browser source.

## Architecture and Runtime

### Deployment and process model

`server.js` is the application entry point. The production Docker image installs runtime dependencies, copies `server.js`, `src/`, `sql/`, root browser assets, `css/`, `sections/`, `js/`, `vendor/`, `tutorials/`, catalogs, and `logic_phrase_catalog.json`, exposes port 8080, and starts `node server.js`.

Local Docker Compose starts:

- PostgreSQL 17 with the database, user, and password defined for local use.
- The application container with `DATABASE_URL`, `PORT`, and `STUDIOSHARE_API_URL` supplied as environment variables.
- Migrations and local seed/init scripts mounted into the database container.

The Launch application identifier is defined in `.launch/config`. Launch-managed deployment behavior beyond the reviewed repository configuration is not documented in this pass.

### Server and static assets

`server.js` configures Express, PostgreSQL access, authentication-aware API routes, repository integrations, and browser asset delivery. The root page is served from `index.html`. Root CSS and catalog assets have explicit routes, and the server exposes static browser directories before the application fallback behavior. Missing asset requests must not be treated as valid application HTML.

### Browser startup and partial loading

`index.html` provides the shell and a temporary `#page-sections-root`. `js/00-html-partials-loader.js` runs before all application modules and synchronously loads the ordered page partial list from `sections/`.

A partial is inserted only when:

- The request returns an HTTP 2xx status.
- A supplied content type is compatible with `text/html`.
- The response begins with markup after trimming.

Failure throws and prevents normal bootstrap. Synchronous loading is required by the current architecture because `js/01-state-dom.js` caches DOM references during script evaluation and `js/06-events-bootstrap.js` calls `init()` when evaluated.

### Classic-script load order

Browser modules are ordinary scripts, not ES modules. Their order in `index.html` is an active dependency contract:

1. Partial loading, configuration, and shared state are established first.
2. Base hierarchy, rendering, capture, persistence, tutorials, catalogs, imports, pickers, repositories, and export helpers follow.
3. The ordered `15a` through `15h` UI layers specialize or replace earlier global functions.
4. Page shell, identity, database, history, workflow, review, Inbox, Display Fields, and Audit Issues modules load later.
5. `js/06-events-bootstrap.js` loads last and starts the application.

Later scripts may wrap or replace globals defined earlier. Maintenance must verify the final loaded implementation before changing a duplicated function name. `js/15-visual-ui-upgrades.js` exists in the repository tree but is not loaded by the reviewed `index.html`.

### Shared state and rendering

`js/01-state-dom.js` owns the shared `state` object, cached DOM references, active-audit selection, theme and display preferences, audit baselines, unsaved-change detection, and section navigation helpers.

`js/02-logic-rendering.js` provides the base render boundary and targeted render scheduler. Targeted requests merge boolean surface flags into one scheduled flush; a later request in the same batch does not remove work already requested. `renderAll()` remains the broad full-state render boundary. Feature modules loaded later can provide the final implementations for individual surfaces.

Database audit loads use a monotonically increasing request sequence in `js/18-audit-database.js`. Only the latest accepted response is applied, preventing an older overlapping request from replacing a more recent selection.

### CSS source and generated output

Editable CSS lives in feature-oriented files under `css/`. Individual top-level rules and at-rules are tracked as source units, while `css/manifest.json` controls their final cascade order. File location expresses feature ownership; manifest position controls precedence.

`build-css.mjs` validates source-unit markers and CSS structure, discovers eligible unmarked rules, updates the manifest when appropriate, and atomically generates root `styles.css`. Root `styles.css` is deployable generated output and must not be edited directly.

Relevant maintenance commands are:

- `node build-css.mjs --check`
- `node build-css.mjs`
- `node build-css.mjs --check --no-discover`
- `node build-css.mjs --check --accept-deletions` for an intentional deletion preview
- `node build-css.mjs --accept-deletions` to apply confirmed deletions

These commands were identified from source and were not executed during this documentation pass.

### Application version ownership

`const ATLAS_APP_VERSION = "v2.7.6"` in `js/00-config-utils.js` is the browser application's authoritative version. `atlasRenderAppVersion()` populates elements marked with `data-atlas-app-version`.

`tools/sync-app-version.mjs` reads that declaration and maintains explicitly configured Markdown version targets. The associated package scripts are:

- `npm run version:bump`
- `npm run version:sync`
- `npm run version:check`
- `npm run version:hook`

The tracked pre-commit hook and version tests protect this contract. The application version is independent of the npm package version (`1.0.0`), schema versions, revisions, migration timestamps, database versions, and dependency versions.

## Functional Areas

### Audit Library and Persistence

#### Purpose

The Audit Library is the entry point for locating and managing shared audit documents. PostgreSQL is the durable audit store. IndexedDB is retained for crash recovery and browser-local compatibility, not as the system of record for shared audits.

#### User-visible capabilities

The reviewed implementation supports:

- Opening My Audits at startup.
- Listing active database audits and filtering/searching the list.
- Role-oriented Audit Library views, including assigned, backup, developer, other, all, and capability-gated Deleted Items.
- Creating a new audit.
- Duplicating the active audit as a new audit identity.
- Loading or switching to another database audit.
- Importing one or more audit documents from JSON.
- Viewing database revision metadata in list and selector surfaces.
- Deleting an active audit into Recently Deleted.
- Restoring or permanently deleting an archived audit through authorized Deleted Items controls.

#### Creation, duplication, loading, switching, and import

New and duplicated audits receive new audit IDs and are created through `POST /api/audits`. Duplication clones the audit, renames it with a `Copy` suffix, assigns new step IDs, and removes copied parent links before creation.

Persisted audits are loaded through `GET /api/audits/:auditId`. An accepted response applies the audit, revision metadata, persistence access, selection state, and target page as one load operation. The browser retains an audit baseline for dirty-state checks.

Switching and other navigation paths call the durable-save coordinator when necessary before replacing the active audit. If the save fails or a conflict remains unresolved, the operation does not silently discard the current database changes.

JSON import is normalized and validated by `src/audit-repository.js`. If an existing audit with the same ID has identical canonical document content, import returns `unchanged`. Otherwise import uses the ordinary revisioned save path with change type `import` and the current revision as its optimistic concurrency token.

#### IndexedDB crash recovery

`js/04-persistence.js` uses IndexedDB database `atlasAlignAuditLogicBuilder`, version 1, store `flows`, and autosave record ID `autosave`.

`scheduleAutosave()` waits 500 ms after the latest edit, captures current controls, clones the audit, and writes the recovery record. The record includes the audit snapshot, theme, and timestamp. Restore loads that snapshot as a draft, restores theme and selection state, establishes a baseline, and refreshes the active-audit selector.

Browser recovery is suppressed while Reviewer Mode reports itself active and while autosave is explicitly paused. Clearing local application data removes IndexedDB and app-prefixed local/session storage, but does not alter repository files or downloaded exports.

#### Durable PostgreSQL write coordination

`js/18-audit-database.js` coordinates durable writes per active audit:

- Ordinary edits use a 2,500 ms trailing delay.
- A dirty audit has a 20,000 ms maximum delay before a write is requested.
- The coordinator tracks edit and acknowledged generations, one in-flight request, conflict state, dirty start time, and pending reason.
- New audits use `POST /api/audits`; persisted audits use `PUT /api/audits/:auditId` with `expectedRevisionId`.
- If edits occur during an in-flight write, the generation comparison causes a subsequent write rather than treating newer changes as acknowledged.
- Save acknowledgement updates revision metadata and Audit Library/status surfaces without broadly reapplying the returned audit document.
- Reviewer Mode suppresses normal durable audit writes.

A general HTTP 409 places the coordinator into conflict state, stores the current server revision ID when supplied, and opens the conflict UI. The typed `AUDIT_PENDING_APPROVAL_LOCKED` conflict stops pending writes and refreshes workflow state. Workflow details are deferred to a later pass.

#### Repository save contract

`src/audit-repository.js` validates and clones each submitted document, opens a transaction, and locks the `atlas_audits` row with `SELECT ... FOR UPDATE` when the audit exists.

For a persisted audit:

- `expectedRevisionId` must match `current_revision_id` when supplied.
- A normal save whose canonical SHA-256 matches the current document rolls back without creating a revision.
- A changed document receives the next audit revision number, a parent revision link, the JSONB document, its SHA-256, change metadata, and actor metadata.
- Step records are upserted from the submitted document.
- Step revisions are created only for created, changed, moved, restored, or deleted steps; unchanged steps do not receive a new step revision.
- The audit row is updated to point to the new current revision.
- Related profile persistence and workflow invalidation may participate in the save transaction, but those systems are deferred to later passes.

Creation inserts the audit row and revision 1 in the same repository transaction. SQL is loaded from `sql/audit-repository/` through `src/sql.js` and executed with positional parameters.

#### Archive and Deleted Items

The browser archive action is intentionally coordinated:

1. It requires a selected persisted audit and `canArchive` access.
2. It requests explicit confirmation.
3. It pauses browser autosave and blocks duplicate activation.
4. It flushes pending durable changes.
5. It rejects the operation if the active audit changes before the request.
6. It sends `DELETE /api/audits/:auditId` with `expectedRevisionId`.
7. After success, it removes the recovery record, refreshes the database list, clears the active audit, and returns to My Audits.

The repository archive query updates `archived_at` and `archived_by_username` only when the audit is not already archived and the expected current revision still matches. A mismatch or already-archived record returns a 409.

Archived audits are excluded from normal `list-audits.sql` and `get-audit.sql` queries. `list-archived-audits.sql` returns archived records ordered by archive time, then name and ID.

Deleted Items administration is capability-gated through `canManageDeletedAudits`. Restore and permanent deletion are exposed through administrator routes under `/api/admin/audits/`.

Restore opens a transaction, locks an archived audit row with `FOR UPDATE`, clears archive metadata, updates actor/timestamp metadata, and commits. It does not create a new content revision in this archived-audit restore path.

Permanent deletion opens a transaction, locks the archived audit row, and first inserts an `atlas_audit_deletion_events` record with `event_type = 'permanent_delete'`, audit identity, actor identity, and current revision metadata. It then clears current-revision foreign-key pointers and deletes step revisions, step records, audit revisions, and the audit row before committing. If the audit is not archived, the operation returns no deletion result. Any error rolls back the transaction.

#### Frontend ownership

- `sections/my-audits.html`: My Audits structure and controls.
- `css/my-audits.css`: Audit Library layout and presentation.
- `js/04-persistence.js`: IndexedDB recovery and compatibility adapters.
- `js/11-repo-library.js`: normalization and active-audit switching foundations.
- `js/15a-audit-library-ui.js`, `js/16-page-shell.js`, and `js/20-database-only-audits.js`: final list, selector, role, and database-only presentation behavior.
- `js/18-audit-database.js`: API client, load application, write coordination, JSON imports, and archive lifecycle.
- `js/06-events-bootstrap.js`: top-level create, duplicate, filter, switch, and import event wiring.

#### Backend, database, and SQL ownership

- `server.js`: routes, middleware, authenticated user integration, access checks, and repository invocation.
- `src/audit-repository.js`: validation, hashing, audit/step revision persistence, archive, import, archived restore, and permanent deletion transactions.
- `src/audit-authorization.js`: audit capability calculation and enforcement boundary.
- `.launch/migrations/20260820200000_create_audit_version_tables.sql`: base revisioned audit storage.
- `.launch/migrations/20260831145500_create_audit_deletion_events.sql`: retained permanent-deletion event storage.
- `sql/audit-repository/*.sql`: parameterized audit, revision, step, archive, restore, and delete statements.

#### Public interfaces and integration points

Core routes verified in the reviewed source include:

- `GET /api/audits`
- `POST /api/audits`
- `GET /api/audits/:auditId`
- `PUT /api/audits/:auditId`
- `DELETE /api/audits/:auditId`
- Administrator archived-audit list, restore, and permanent-delete routes under `/api/admin/audits/`

Revision-history and content-restoration routes also exist, but their full behavior belongs in the later History and Restoration pass.

#### Persistence and security constraints

- PostgreSQL is the durable shared audit store.
- IndexedDB recovery is browser-local and can be cleared independently.
- API mutation routes require the server-resolved current user.
- OPA denies by default, permits authenticated non-admin API traffic, and restricts reviewed administrator paths by role. Application route middleware remains responsible for detailed audit capabilities.
- Optimistic revision checks prevent silent overwrites.
- Row locks serialize save, archived restore, and permanent-delete decisions at the repository boundary.
- Permanent deletion is restricted to an already archived audit and records a deletion event before content removal.

#### Relevant tests

The reviewed bundle includes:

- `test/audit-repository.test.js`: static and contract coverage for repository saves, revisions, restoration relationships, parameterized SQL loading, archive, and related workflow safeguards.
- `test/my-audits-render.test.js`: My Audits rendering and fail-closed Deleted Items capability behavior.
- `test/render-scheduling.test.js`: targeted render-request merging and scheduling contracts.
- `test/logic-builder-initialization.test.js`: startup and navigation initialization contracts relevant to the shared shell.
- `test/app-version-sync.test.js` and `test/app-version-git-hook.test.js`: version synchronization and hook behavior.
- `test/schema.test.js`: schema helper behavior.

These files were reviewed as source evidence. No test command, CSS build, application startup, browser check, or database integration test was executed during this documentation pass.

#### Known limitations and unverified behavior

- Live PostgreSQL concurrency, browser accessibility, responsive behavior, and deployment behavior were not executed or observed in this pass.
- The reviewed tests are primarily source/contract evidence; this document does not claim they all exercise a live database.
- History and restoration-token behavior remains deferred. Workflow, review, publication, Inbox, and discussion behavior is documented in the current pass.
- `README.md` and `package.json` retain field-library-focused wording that does not fully describe the current application scope.

### Audit Definition and Requirements

ATLAS Align's authoring flow moves from Audit Overview metadata and assignments, through Sources and Logic Builder, to Display Fields and Requirements Preview. Audit Issues and Readiness Review evaluate the same active audit and provide navigation or bounded remediation without becoming a separate persistence model.

#### Audit Overview

**Purpose and capabilities.** Audit Overview owns the revisioned audit identity and descriptive fields exposed in `sections/audit-overview.html`, including the audit name, description/purpose, status presentation, and assignment editor. Assignment collections are stored in the audit document under three independent roles: `assigned`, `backup`, and `developer`.

**Assignment editing.** `js/16-page-shell.js` normalizes assignment collections and owns add/remove mutations, membership checks, rendering, and autosave integration. Mutations apply to the active audit only after role and audit identity checks, refresh assignment-dependent surfaces, invalidate canonical Audit Issues, and use the existing audit autosave/durable-write path.

**User discovery and hydration.** The browser combines persisted profile results with directory searches through the user-profile API. Recent profiles are cached by stable profile identity. Directory results are transient until a validated assigned user is included in an audit save; the backend then upserts the assigned profiles through `src/user-profile-repository.js`. Hydration is audit-keyed and deduplicated so a response for an earlier audit is not applied to the current audit.

**Shared Visual Picker integration.** Audit Overview uses an assignment-specific adapter over `ATLASVisualPicker`. The shared picker owns modal behavior, search, grouping, selection, focus, and accessibility. The assignment adapter owns role eligibility, user retrieval, stale-audit validation, mutation, issue invalidation, and persistence. `ATLASAssignmentEditor` is the stable cross-module integration used by Audit Issues for missing-assignment fixes.

**Ownership.** Structure and styling are in `sections/audit-overview.html` and `css/audit-overview.css`; assignment behavior is in `js/16-page-shell.js`; common picker behavior is in `sections/visual-picker.html`, `css/visual-picker.css`, and `js/15h-visual-picker.js`; profile persistence and directory routes are in `src/user-profile-repository.js`, `src/user-profile-routes.js`, and `server.js`; schema support is in `.launch/migrations/20260826131500_create_atlas_user_profiles.sql`.

#### Source Library and field catalog

**Canonical source identity.** `atlasResolveSourceIdentity()` in `js/10-field-picker.js` is the browser source-identity boundary. It resolves current and legacy names against catalog entries while keeping these concepts separate:

- Stable source key used for identity and deduplication.
- Physical source filename.
- Source alias used for analyst/developer presentation.
- Display name and catalog metadata used by the UI.

Aliases and display labels are lookup values, not replacements for canonical identity. Source-derived lookup and usage indexes are transient caches and are invalidated when sources or catalog data change. The audit document and loaded catalog remain authoritative.

**Browsing and selection.** `js/13-catalog-field-browser.js` and the final source UI in `js/15b-source-library-ui.js` provide searchable, grouped source/field browsing, selected-source rendering, source colors, usage indicators, and add/remove actions. Selected sources are persisted in the audit document. Removing a source passes through owning source-mutation logic so dependent state, rendering, validation, and autosave are refreshed together.

**Generated Reference steps.** `syncAutoReferenceSteps()` and its later wrappers synchronize one generated Reference representation for selected sources. Generated References are derived from selected source state, marked as generated/locked, and are not edited as ordinary manual logic rules. Later Logic Builder code guards parenting and cleanup around these generated steps.

**Source usage.** `js/15b-source-library-ui.js` builds transient source-usage indexes from the current audit and Logic Builder field references. Usage indicators do not independently persist selection or field identity.

**Database loading and replacement.** `js/17-source-database.js` loads source-library data and access metadata from authenticated API routes and exposes administrator CSV replacement through the existing Sources UI. `src/source-library-authorization.js` normalizes role slugs and returns the server-side access decision. The replacement capability requires the verified `atlas-align-admin` role; browser visibility does not replace backend enforcement.

**Field-library import transaction.** `src/field-library.js` validates the entire CSV before opening the replacement transaction. The reviewed SQL and repository establish this sequence:

1. Insert an import-history record with filename, expected row count, SHA-256, and actor metadata.
2. Create a temporary staging table with the live field-library structure.
3. Insert validated rows into the stage in parameterized batches of 500.
4. Count staged rows and require an exact match with the parsed row count.
5. Truncate the live field library.
6. Copy staged rows into the live table.
7. Mark the import record completed and commit.

An error rolls back the transaction, including the live-table replacement. The SQL in `sql/field-library/` is the query-level authority for staging, count verification, truncation, copy, and import completion. Migrations `20260820112100_create_atlas_field_library.sql` and `20260820150000_add_import_user_identity.sql` define the base tables and actor attribution.

#### Logic Builder

**Hierarchy and ordering.** `js/02-hierarchy.js` owns stable step parent/child relationships, branch types, grouped sibling ordering, numbering, indentation, parent eligibility, child creation, movement, and outdent behavior. The audit's complete `steps` collection remains authoritative. Manual movement is constrained to eligible siblings and order groups.

**Rule categories and guided builders.** The active authoring implementation is layered through `js/14-catalog-driven-builder.js` and the later-loaded `15a` through `15g` scripts. Current guided behavior covers Reference, JOIN/UNION, IF/THEN and ELSE branches, comparisons, create-column/output actions, calculations, string transforms, and the supported catalog-normalized legacy step forms. `logic_phrase_catalog.json` provides standardized phrase templates and option catalogs. `js/15-visual-ui-upgrades.js` exists in the repository tree but is not loaded by the reviewed `index.html`; the split `15a`-`15h` files are active.

**Conditions and branches.** Conditions support operator-specific value modes, multiple values, field-to-field comparison, and structured math on the comparison side. IF/THEN editing uses the final tabbed builder from `js/15g-visual-ui-events.js`. Linked inverse ELSE steps are synchronized from the source IF conditions unless the step explicitly opts out with `params.inverse_else === "Yes"`; legacy inverse steps are migrated through the same later layer.

**JOIN and UNION.** `js/15f-join-picker.js` owns the active JOIN picker, supported join presentation, Venn/union visualization, and JOIN developer-logic rendering. JOIN field/source choices remain tied to selected audit sources and resolved source identity. UNION handling remains distinct from JOIN relationship behavior.

**Calculations, rounding, and string transformation.** Structured math supports ordered operations with field or static operands. Calculation actions identify a target column and numeric source field and support rounding modes `none`, `nearest`, `up`, and `down` with configured decimal places. String-transform actions support `first_characters`, `last_characters`, and `character_count`; source field, target column, and positive character-count requirements are validated by the authoring and issue layers.

**Created fields.** Create-column results become picker entries with origin `created`. Their identity includes the creating step (`creatorStepId`) so same-label fields remain distinguishable. Eligibility is limited by source lineage and step order. Renames propagate to structured references; removed creators and forward references are raised as canonical Audit Issues rather than silently rebound.

**Field-picker eligibility.** The final picker path in `js/15g-visual-ui-events.js` merges catalog fields and eligible created fields. Selected source controls the current display/recognition context, while a separate transient eligibility policy controls what may be chosen. Multi-source IF condition and IF action controls can use all selected audit sources; intentionally source-bound controls retain their narrower scope. A blank field does not imply a selected source.

**Rendering and virtualization.** Content-only commits update state and dependent previews/validation without rebuilding the selected-step editor DOM, preserving the focused control, caret, selection, and in-progress value. Structural changes use the shared scheduled structural render path. The final rule list is virtualized by `js/15g-visual-ui-events.js`: it mounts a measured visible window plus overscan, caches measurements transiently, omits collapsed descendants only from presentation, expands ancestors before reveal/focus, and temporarily expands the mounted range during drag without changing persisted hierarchy data.

**Generated text.** `js/07-phrase-catalog.js` produces Analyst Logic from catalog templates and normalized step parameters. `js/02-logic-rendering.js` and later wrappers produce Developer Logic for conditions, joins, source-field operations, calculations, rounding, and string transformations. Saved steps and canonical field references remain the input; rendered text is not a separate source of audit identity.

#### Display Fields and Requirements Preview

**Display Fields.** `js/21-display-fields.js` owns canonical row composition, persisted display selection, display ordering, accessible movement, page rendering, and the Display Fields adapter over `ATLASVisualPicker`. Catalog fields and created/calculated fields use distinct canonical identity paths. Created-field identity retains creator context, while catalog identity uses resolved source identity plus field identity.

Logic-derived usage and display selection are independent. A field referenced by logic can appear as used without automatically becoming displayed; a display-only field can be selected from an included source. Display preferences persist in `audit.displayFields`, while catalog rows and logic-use sets are recomputed.

**Requirements Preview.** `js/02-logic-rendering.js` builds one canonical source-aware Fields inventory from logic references and Display Field selections. `requirementsFieldRowsWithDisplaySelection()` in `js/21-display-fields.js` is the later-loaded integration that applies persisted selection and ordering. Requirements Preview renders Fields before audit logic and supports nested hierarchy or complete-statement mode. Notes inclusion is a presentation/export option.

The same canonical field-row composition feeds downstream requirements exports. Export file generation is deferred to the later Imports, Exports, and Supporting Tools pass, but exports must consume the authoring model rather than recalculate a competing field inventory.

**Shared picker boundary.** `ATLASVisualPicker` remains persistence-free. Feature adapters supply entries, grouping, labels, selection state, and callbacks. Display Fields owns audit mutation and ordering; assignments own user mutation; source and logic workflows own their own commits. The picker preference for raw versus vanity labels is independent from the Logic Builder's app-wide field-display preference after the user explicitly changes it.

#### Authoring-flow invariants

- Audit Overview establishes descriptive metadata and assignments.
- Sources establishes canonical source inclusion and catalog context; generated References reflect selected sources.
- Logic Builder records hierarchical rules and field references against those sources and preceding created fields.
- Display Fields independently records final-output inclusion and order.
- Requirements Preview composes canonical Fields and Logic views from the same audit document.
- Audit Issues evaluates that document without becoming a second persistent issue store.
- Readiness Review and the floating dialog render the same canonical issue result and route users back to the owning authoring surface.

### Validation and Readiness

#### Portable AuditIssueEngine

`js/22-audit-issue-engine.js` is a classic-script IIFE that exposes `AuditIssueEngine` without reading ATLAS state, DOM, navigation, persistence, APIs, or authorization. Named evaluator, jump-action, and fix-action registries are supplied by the caller. Public entry points are:

- `AuditIssueEngine.create(options)` for an independent engine.
- `AuditIssueEngine.validateRules(rules, registries)` for catalog validation.
- `AuditIssueEngine.severities` for supported severity names.
- Engine instance `evaluate()`, `validateRules()`, `aggregate()`, and `severities`.

The engine validates rule IDs, enabled flags, severity, categories, named handlers, and action references. Evaluation isolates evaluator failures, normalizes and deduplicates issues, sorts deterministically, aggregates status/counts, and deep-freezes returned results.

#### Declarative catalog and ATLAS adapter

`catalogs/audit-issue-rules.json` contains declarative metadata and named handler references only; catalog strings are never executed as code. `js/23-atlas-audit-issues.js` owns the ATLAS adapter. It builds a normalized context without mutating the audit, registers current evaluators/actions, loads and validates the catalog, and maintains a transient cache keyed by audit signature and invalidation generation.

The stable adapter surface includes `ATLASAuditIssues.buildContext(audit)`, `current()`, `invalidate()`, `legacyIssues()`, `loadCatalog()`, and `catalogReady`. `atlasLogicIssues()` and `atlasMarkLogicIssuesDirty()` remain compatibility entry points backed by the canonical adapter result. `validateAudit()` in `js/08-step-templates-validation.js` maps the canonical result into its legacy shape rather than maintaining a competing active issue collection.

#### Coverage and severity

The reviewed catalog/adapter covers audit setup, required assignment roles, selected sources and References, hierarchy, conditions, actions, joins, calculations, string transforms, created-field relationships, workbook warnings, Display Fields, and cross-source field relationships. Supported severities are `ok`, `warning`, and `critical`; aggregation is derived from the immutable issue collection.

Cross-source relationship validation treats only complete, enabled, resolved supported JOIN steps as connecting sources. Direct or indirect JOIN paths satisfy connectivity. UNION, disabled, incomplete, unsupported, or ambiguous steps do not establish a JOIN path.

#### Presentation, navigation, and fixes

`sections/audit-issues.html` and `css/audit-issues.css` own the floating control/dialog. `sections/readiness-review.html` and `css/readiness-review.css` own the full-page summary, category state, filters, and issue list. Both surfaces consume the same canonical result and share filter/focus lifecycle in the ATLAS adapter.

Jump actions route to Audit Overview, Sources, Logic Builder, Display Fields, or Readiness Review. Each action rechecks the active audit ID and stable issue key immediately before navigation. Logic Builder jumps use `atlasRevealLogicStep()` so collapsed or virtualized targets are expanded and mounted before focus.

Fix actions are intentionally registry-controlled. Current bounded fixes are:

- Missing Audit Description: accessible adapter-owned edit flow.
- Missing assignment: delegates to `ATLASAssignmentEditor`.
- Missing source: delegates to the source adapter over `ATLASVisualPicker`.

Each fix revalidates audit identity and stable issue identity before mutation, then invalidates the canonical result and relies on the owning workflow's ordinary persistence. Ambiguous or structurally complex findings, including JOIN, hierarchy, condition, calculation, string-transform, created-field, removed-reference, and Display Field problems, remain Jump-only unless a verified bounded adapter is registered.

#### Ownership and tests

- Engine: `js/22-audit-issue-engine.js`, tested by `test/audit-issue-engine.test.js`.
- Rules and ATLAS integration: `catalogs/audit-issue-rules.json` and `js/23-atlas-audit-issues.js`, tested by `test/atlas-audit-issues.test.js`.
- Legacy compatibility: `js/08-step-templates-validation.js` and final wrappers in the loaded `15g` layer.
- Presentation: `sections/audit-issues.html`, `css/audit-issues.css`, `sections/readiness-review.html`, and `css/readiness-review.css`.

The test files were reviewed as source evidence. No tests, browser checks, accessibility checks, or builds were executed during this pass.

### Workflow, Review, and Publication

ATLAS Align implements a revision-bound approval and publication workflow across `src/audit-workflow-repository.js`, `src/audit-review-repository.js`, `src/audit-discussion-repository.js`, authenticated routes in `server.js`, and the browser modules `js/24-audit-workflow-ui.js`, `js/25-inbox.js`, `js/26-recently-deleted-publications.js`, and `js/27-audit-review-mode.js`.

#### Authorities and terminology

The relational workflow is authoritative for transitions. Five working states are stored in `atlas_audits.workflow_status`:

- **Draft:** Editable initial or returned work.
- **Pending Approval:** The current revision is bound to one active approval request and is locked against ordinary audit-document edits.
- **Approved:** The exact submitted revision has an active approval.
- **Published:** The approved revision has an immutable publication snapshot and the audit is published-locked.
- **Draft Revision:** Editable work opened from a publication, or work returned from review for changes.

These states are distinct from:

- **Audit-document `status`:** revisioned JSON metadata. Submission snapshots it as `Ready for Review`; final review publication snapshots it as `Complete`.
- **Approval-request outcome:** `Pending`, `Approved`, `Denied`, `Invalidated`, or `Rescinded`. Denial and rescission are outcomes, not workflow states.
- **Review-session status:** the session starts as `Draft` and can be finalized as returned, approved, or rescinded according to the repository and migrations.
- **Publication deletion status:** `Active` or `Recently Deleted`; Recently Deleted is not an audit workflow state.
- **Inbox state:** actionability (`Actionable` or resolved/informational status) and read state (`Unread` or `Read`) are projections, not approval authority.
- **UI labels:** Review Feedback, Early Send Back, Send Back, and similar text describe user actions or views, not additional relational states.

`getAuditWorkflowSummary()` returns workflow status, current revision ID/number, revision cycle, published lock, current request/approval/publication pointers, `workingFromPublicationId`, and server-calculated capabilities. Browser modules render and gate actions from this summary, but server authorization and transaction validation remain authoritative.

#### Submission, approval authority, and locking

Submission is available only to a current Assigned Analyst on an exact current revision in Draft or Draft Revision. The selected approver is verified through the current user service and must be active, hold `atlas-admin-team`, and not be an Assigned Analyst on the same audit.

`submitAuditForApproval()` performs one transaction that:

1. Locks the audit row.
2. Verifies `expectedRevisionId`.
3. Recalculates submit capability from the locked audit.
4. Revalidates the chosen approver.
5. Creates a revision-bound approval request containing a submitted document whose document `status` is `Ready for Review`.
6. Creates an actionable Inbox projection for the selected approver.
7. Sets the audit to Pending Approval and points it at the request.
8. Records `approval.submission_requested` activity.

Pending Approval is read-only for ordinary audit mutation. `src/audit-repository.js` rejects saves with `AUDIT_PENDING_APPROVAL_LOCKED`. The browser lock coordinator in `js/24-audit-workflow-ui.js` classifies mutation controls, preserves their previous disabled/ARIA/tab/draggable state, blocks capture-phase mutation events, and provides one accessible lock explanation. Review/request viewing, history, publication viewing, and authorized rescission remain available.

Approval authority is request-specific and revision-specific. Opening Reviewer Mode does not transfer authority to the Inbox item. Repository checks require the selected reviewer/approver, exact request, submitted revision, current audit pointer, eligible role, and Assigned Analyst exclusion to remain valid.

Denial through the direct workflow decision path resolves the request as denied and returns the audit to Draft. Reviewer Mode's structured return path returns the audit to Draft Revision, preserving review feedback and resubmission context. Both are request outcomes rather than a Rejected state.

An Assigned Analyst may rescind an active pending request only with a nonblank reason and exact revision/request identity. The transaction locks the audit, approval request, and any draft review session; marks the request Rescinded; closes the draft review session when present; resolves actionable Inbox items; restores Draft or Draft Revision according to `working_from_publication_id`; and records `approval.request_rescinded`. A stale, decided, mismatched, or noncurrent request returns a conflict without partial changes.

#### Publication lifecycle

A publication is an immutable numbered snapshot in `atlas_audit_publications`. It records the source revision and approval, document JSON and hash, assignment snapshot, version title/number, and approving/publishing actors. The audit row holds the current publication pointer and published-lock state.

Two verified publication paths exist:

- The workflow repository can publish an exact active approval through `publishAuditRevision()`. It locks the audit and approval, revalidates the publishing user, allocates the next per-audit version, inserts the snapshot, updates the audit to Published, and records `audit.published`.
- Reviewer Mode finalization creates the approval and publication together after every applicable review item is approved and every applicable discussion is resolved. This path snapshots the submitted document with document `status` set to `Complete`.

Version allocation uses the next value derived for the audit inside the publication transaction. Publications are not edited in place. Older publications remain immutable across later Draft Revision cycles and republishing.

Published audits are locked against ordinary edits. Unlock requires an exact current revision and publication, an eligible non-assigned `atlas-admin-team` user, and a nonblank reason. The transaction locks the audit, share-locks the current revision, creates a new child revision with the same document/hash and an `unlock` change, sets the audit to Draft Revision with `workingFromPublicationId`, and records `audit.published_unlocked`. A later submit, review, approval, and publication creates a new numbered snapshot; it does not rewrite the prior one.

Publication deletion is separate from audit archive/deletion. An authenticated `atlas-align-admin` supplies explicit confirmation, reason, exact current revision, expected publication ID, and version number. The repository locks the audit and publication, changes the publication lifecycle to Recently Deleted, and records `publication.sent_to_recently_deleted`. It does not archive or permanently delete the audit document or its revisions. `sections/recently-deleted-publications.html`, `css/recently-deleted-publications.css`, and `js/26-recently-deleted-publications.js` own the administrative browser surface.

#### Inbox projections

`atlas_inbox_items` is a recipient-specific projection of workflow events. It is not the authority for decisions, review permissions, or discussion access.

- Listing and unread-count SQL isolate rows by `recipient_user_id`, falling back to a case-insensitive recipient username only when the stored user ID is null.
- `mark-inbox-item-read.sql` applies the same ownership predicate before changing `Unread` to `Read`.
- The list query joins the current audit and approval request to return audit name, current workflow status, requester username as sender context, selected approver username, item status, read state, display metadata, and creation time.
- Pagination is descending by Inbox ID with an optional `beforeId`; repository limits are clamped to 1 through 100.
- Submission creates an actionable Approval Request item for the selected approver.
- Return creates a returned-review item for the assigned analyst with review-session, submitted-revision, count, and outcome metadata.
- Final approval resolves approval items and creates an informational decision item for the requester with publication and review context.

`js/25-inbox.js` renders cards, marks owned items read, opens server-provided approval-review context, and routes returned feedback or decision information to the appropriate experience. Unread counts are synchronized with the topbar after Inbox refresh/read operations. The server rechecks request, revision, reviewer, and capability context when opening or acting; Inbox possession alone grants nothing.

#### Reviewer Mode and review sessions

Reviewer Mode is a read-only, detached rendering of the submitted revision through existing Audit Overview, Sources, Logic Builder, Display Fields, and Audit Issues pages. `js/27-audit-review-mode.js` coordinates the detached review document, page adapters, inline review controls, floating HUD, progress/navigation, final summary, Review Feedback, and analyst feedback mode.

The detached document is display state, not `state.audit` editing state. While review is active, ordinary capture, IndexedDB recovery/autosave, database dirty marking, audit revision writes, and broad authoring mutations are suppressed. Existing page renderers may read review context, but native authoring controls remain locked.

`openAuditReview()` transactionally locks and validates approval authority, opens or reuses the review session bound to the approval request, submitted revision, and reviewer, constructs canonical review items from the submitted document and applicable baseline, upserts the item rows, applies eligible carry-forward decisions, and links items to durable canonical review objects.

A review item is identified within a session by `section_key` plus `stable_item_key` and also records a cross-cycle `canonical_object_key` with `identity_version`. Items include section/type, display label, semantic fingerprint, canonical order, parent/linked keys, direct/generated status, severity, deleted flag, change type/reasons, and prior/submitted summaries. Deleted candidates remain review items even when they have no inline object to decorate; they remain reachable through HUD, feedback, and discussion surfaces.

Change classification comes from `src/audit-comparison.js` and review-item construction. The submitted revision is compared with the applicable baseline to classify direct, derived, changed, unchanged, added, and deleted review objects. Canonical Audit Issues may be included as frozen review objects, but live authoring Audit Issues are not Review Feedback and do not replace review decisions or discussions.

Draft review decisions are `Approve`, `Request changes`, or `Needs discussion`. Direct items can be decided; generated items cannot be decided independently. Notes are required for Request changes, Needs discussion, and approval of warning-severity items. `saveAuditReview()` locks the reviewer session, revalidates authority, requires the submitted `expectedVersion` to equal `draft_version`, locks each changed item, updates it, and advances the session draft version with optional resume location. A mismatch returns 409 with the current draft version. Bulk approval uses the same review eligibility rules and repository boundary.

Carry-forward applies only from the previous returned review session. The repository maps items by canonical object key, rejects ambiguous duplicates, rebuilds current items against the prior baseline, and carries a prior decision only when `carryEquivalent()` confirms semantic equivalence. The new session links to its source review session for traceability.

**Return paths.** Early Send Back and normal Send Back both lock the review session, require the expected draft version, revalidate approval authority, recompute final eligibility, and require an assigned analyst recipient. The transaction marks the review returned, denies the request, resolves approver Inbox items, sets the audit to Draft Revision, creates returned-review Inbox feedback, and records return activity. Early Send Back uses the stricter `earlyReturnEligible` calculation; the repository does not treat the button label as a separate status.

**Final approval.** `finalizeApprovedAuditReview()` uses the explicit lock order documented in source: review session, audit, approval request, then submitted revision. It requires the session to remain Draft, exact draft version, an active pending request, matching audit/request/revision pointers, current reviewer authority, every applicable decision approved, and all applicable discussion threads resolved. In one transaction it creates the approval, allocates and creates the publication, approves the request, marks the session approved, publishes the audit, resolves approval Inbox items, notifies the requester, records final activity, and commits. Any error rolls back the entire set.

**Review Feedback.** Returned feedback is persisted review-session/item data and exposed to the analyst through Inbox context and analyst feedback mode. It is distinct from canonical Audit Issues, which validate authoring completeness, and from persistent discussions, which are message/state threads attached to canonical review objects.

#### Persistent review discussions

Canonical review objects provide durable identity across sessions. `ensure-review-object-links.sql` upserts `atlas_audit_review_objects` by `(audit_id, canonical_object_key, identity_version)`, updates its label/metadata, and links each review item through `atlas_audit_review_item_objects`. A discussion thread belongs to the audit and canonical review object, allowing the same thread to be reused when an equivalent object appears in a later review cycle.

Discussion messages and state transitions are append-only records. The thread maintains only its current state (`Open` or `Resolved`) and optimistic `state_version`.

- Only the assigned reviewer on a Draft review session may create the first discussion for an item.
- Creation requires canonical object identity, prevents a second thread for the same linked object, and inserts the thread, initial Open transition, and initial message in one transaction.
- The current reviewer or current assigned analyst may reply while the thread is Open and accessible to that actor.
- Only the current assigned reviewer may resolve or reopen a thread.
- State changes require an exact `expectedStateVersion`; the SQL update also checks that version before incrementing it.
- Approved discussions become read-only except where the repository explicitly recognizes the current reviewer context.

Every created message and transition stores both the effective actor and authenticated actor. This preserves attribution when identity features such as impersonation are active; detailed impersonation lifecycle is deferred to the identity pass.

Discussion state influences approval, not item decision storage. An item can have an approval decision while its discussion remains Open. Final approval recomputes a locked thread summary and requires all applicable discussions to be Resolved. Return eligibility is driven by review decision/final-summary rules; discussions remain durable context across return/resubmission cycles.

#### Transactions, routes, authorization, and feature flags

Repository ownership is separated by concern:

- `src/audit-workflow-repository.js`: submission, direct decisions, rescission, publication, unlock, publication deletion, workflow summary, activity, and Inbox projections.
- `src/audit-review-repository.js`: review-session construction, item decisions, draft concurrency, carry-forward, return, final summary, approval, and publication finalization.
- `src/audit-discussion-repository.js`: canonical-object links, threads, immutable messages/transitions, and state concurrency.
- `src/audit-authorization.js`: role, assignment, state, actor-exclusion, and exact-object capability calculation.
- `server.js`: authentication, route payload validation, feature middleware, repository invocation, and HTTP error mapping.

Repository transaction helpers issue `BEGIN`, `COMMIT`, and `ROLLBACK`. Submission, rescission, publish, unlock, soft deletion, review opening/saving/return/finalization, and discussion mutations are atomic at their documented repository boundary. The source explicitly documents the finalization lock order above. Other paths lock the rows shown by their repository sequence and SQL; no broader global lock order is claimed.

Exact IDs and relational pointers are rechecked under lock before mutation. Activity and Inbox writes participate in the same transaction as their governing transition. Failed validation, authorization, stale version/revision/request/publication, or SQL work rolls back rather than accepting a partial transition.

Workflow rollout is fail-closed and dependency ordered through `src/workflow-feature-flags.js`. The flags are `reads`, `history`, `restoration`, `submission`, `decisions`, `publication`, `unlock`, and `publicationDeletion`, backed by the corresponding `ATLAS_WORKFLOW_*_ENABLED` environment variables. A flag is true only for literal `true`, and each later flag is disabled unless all earlier flags are enabled. Server capability projection is reduced by flags, mutation routes use `requireWorkflowFeature()`, and browser visibility follows the public feature response. Feature availability never substitutes for authorization.

#### Frontend and test ownership

- Workflow and browser locking: `sections/audit-overview.html`, `sections/publication-preview.html`, `css/audit-overview.css`, `css/publication-preview.css`, `js/24-audit-workflow-ui.js`.
- Inbox: `sections/inbox.html`, `css/inbox.css`, `js/25-inbox.js`.
- Recently Deleted publications: `sections/recently-deleted-publications.html`, `css/recently-deleted-publications.css`, `js/26-recently-deleted-publications.js`.
- Reviewer Mode and feedback: existing feature partials plus `css/audit-review.css` and `js/27-audit-review-mode.js`.
- Workflow/review/discussion schema: migrations dated `20260911123000`, `20260914200000`, `20260914213000`, `20260914230000`, `20260915150000`, `20260915170000`, and `20260915190000`.
- Query ownership: `sql/audit-workflow-repository/`, `sql/audit-review-repository/`, and `sql/audit-discussion-repository/`.

Relevant reviewed tests include authorization, workflow repository/routes/UI, locking, rescission, publication UI/deletion/locking, Inbox, review landing/mode/draft/return/carry-forward/finalization, discussion repository/routes, and Recently Deleted publication UI. They were reviewed as source evidence. No tests, builds, browser checks, database transactions, or concurrency tests were executed during this pass.

### History, Comparison, Preview, and Restoration

#### Revision histories and unified timeline

Audit and Logic-step history are immutable, repository-backed records. `src/audit-repository.js` owns audit-revision and step-revision lists, reads, and restoration. Audit revisions retain parent and restoration lineage; restored step revisions retain `restored_from_step_revision_id`. `js/19-audit-version-history.js` owns audit-level and step-level history actions, while semantic comparison is backend-owned; `atlasSimpleDiff()` is only a supplemental technical display utility.

`sections/audit-history.html`, `css/audit-history.css`, and `js/19a-audit-history-browser.js` provide one read-only timeline containing workflow activity, unmatched revisions, unmatched publications, and current state. Mapped activity includes submission, approval, denial, invalidation, audit and step restoration, publication, unlock, and publication soft-deletion lifecycle entries. Unknown activity types remain visible through a generic label. Timeline reconciliation prefers explicit activity relationships: revision and publication IDs linked by activity suppress duplicate standalone rows, while unmatched records remain visible. Activity pagination retains its `beforeId` cursor.

Historical documents are detached from editable audit state. `historyView` deep-clones selected revision or publication documents and does not assign them to `state.audit`, call `atlasApplyLoadedAudit()`, capture controls, write recovery data, or schedule durable persistence. Audit-ID and monotonically increasing generation checks reject stale load and selection responses.

#### Semantic comparison ownership and canonical identity

`src/audit-comparison.js` is the semantic comparison source of truth. Full-audit comparison uses contract version 2 and canonical identity version 2; individual step comparison uses contract version 1. Audit comparison separates overview, assignments, sources, fields, Display Fields, Logic content, hierarchy, and reorder changes. Stable step IDs drive step matching.

Canonical objects are audit-scoped and do not use mutable labels or visible numbering as identity. Overview uses fixed property keys; assignments use role keys; sources use canonical source identity; direct Logic objects use stable step IDs; generated References are non-direct objects linked to canonical Sources; Display Field inclusion uses canonical field identity independent of position; one display-order object fingerprints the full sequence; and Audit Issues use stable issue keys. Source aliases and physical filenames are lookup-only, and ambiguous identities fail closed.

Deterministic serialization and SHA-256 produce semantic fingerprints. Change classification distinguishes added, changed, deleted, reordered, parent-changed, and dependency-invalidated objects. Material Logic ancestor changes invalidate direct descendants without resetting unrelated branches. Supported removed sources, direct Logic steps, nested direct Logic steps, and Display Fields become direct deleted candidates; generated References do not become independent deleted decisions. This identity model is shared with Pass 3 Reviewer Mode and carry-forward behavior.

#### Comparison and preview sources

`src/audit-preview-repository.js` resolves:

- Historical audit revision versus current stored revision.
- Submitted approval-request revision versus current stored revision.
- Publication snapshot versus current stored revision.
- Approved revision versus publication snapshot in approved-publication mode.
- Historical audit revision versus current content for restoration preview.
- Historical step revision versus the current matching step, or no current step when absent.

The actual SQL under `sql/audit-preview-repository/` was inspected. Every query is parameterized `SELECT` only. The queries read the current non-archived audit revision, historical audit or step revisions, approval-request submitted revision, publication and approved revision, and restoration source hashes. They contain no mutation statement, transaction boundary, or row lock. Therefore these repository preview paths are verified read-only and mutation-free. Authentication, feature guards, and server capabilities still gate the routes.

Approval-review responses return a comparison and cloned submitted-revision document. Inbox and shared approval-review generation guards reject superseded responses. Reviewer Mode renders the submitted document through `atlasCurrentRenderDocument()` without applying it to editable `state.audit`; ordinary capture, recovery, autosave, durable writes, page-hide save, and archive paths fail closed while Reviewer Mode is active.

Attachment comparison is not established. The contract reports attachment-reference comparison as `unverified`, returns no verified attachment changes, and does not claim binary comparison.

#### Preview-first restoration

Audit and step restoration require a preview, `expectedRevisionId`, and the returned opaque `previewToken`. The token is stateless HMAC-SHA-256, expires after 15 minutes, and binds token version, restoration kind, audit ID, source revision or step-revision ID, step ID where applicable, source hash, current revision ID and hash, effective-user identity, and any disclosed orphan-placement adjustment. The server reads `ATLAS_PREVIEW_TOKEN_SECRET` and requires at least 32 characters; no secret value is documented. Parsing rejects malformed signatures using timing-safe comparison and rejects expired tokens.

The commit path, verified from `src/audit-repository.js` and its SQL integration, opens one PostgreSQL transaction, locks the authoritative audit row, checks the expected revision, revalidates authorization and workflow locks, verifies token binding against the locked current hash and authoritative source hash, performs the additive mutation, and commits or rolls back as one unit. The SELECT-only preview repository does not lock or mutate; it exposes transaction-compatible token verification for the mutation repository.

Content-changing audit restoration inserts a new audit revision whose parent is the formerly current revision. Step restoration clones the locked current document and replaces the matching stable step ID or appends the historical step when absent. Changed, restored, or deleted step records are updated in the same transaction; unchanged steps receive no new step revision. Existing revisions and publication snapshots are not overwritten.

If a historical step's parent is unavailable, preview discloses and signs one placement adjustment. Commit may then set `parentId` to null and `branchType` to `root` and records `step.orphan_placement_adjusted`; it does not invent another placement. Equal-content restoration returns `unchanged`, creates no revision, and performs no workflow invalidation or restoration activity.

Content-changing restoration uses the existing workflow invalidation service. Revision-bound workflow authority and actionable projections are invalidated according to authoritative state, and revision insertion, step lineage, assignment-profile persistence, workflow invalidation, and restoration activity commit or roll back together. Restoration is rejected during Pending Approval and while a Published audit remains locked. Audit History delegates Restore to this same preview-first path. Reviewer Mode remains detached and uses separate review-decision and discussion persistence.

### Identity, User Profiles, Impersonation, and Feature Availability

#### Authentication, effective identity, and profiles

`server.js` resolves the real StudioShare identity using the request access token and `/me`, rejects missing, unauthorized, disabled, or incomplete identities, and stores that actor as `req.authenticatedStudioshareUser`. The server-validated application identity is `req.studioshareUser`. Without impersonation they are the same; with an active session the effective identity is constructed from a persisted profile and role snapshot.

Authentication, effective identity, authorization, feature availability, and UI visibility are separate concepts. Authentication establishes the real actor. Effective identity is used by application capability evaluation. Authorization considers verified roles, assignments, workflow state, and exact relational context. Feature availability can only reduce capabilities. UI visibility presents those outcomes but grants no authority. Where supported, audit activity and persistent discussions retain effective and authenticated actor attribution separately.

`atlas_user_profiles` persists identity, username, display data, email, avatar, disabled/login state, role snapshots, resolution status, and timestamps. The signed-in profile is persisted after successful authentication. Validated assignment profiles are normalized, deduplicated across assigned, backup, and developer roles, and upserted within the same audit-save or restoration transaction.

StudioShare directory searches are read-only and results remain transient. `/api/user-profiles/resolve` may persist specifically resolved profiles used for assignment hydration. Browser hydration is deduplicated and audit-keyed. Real StudioShare tokens remain server-side and are used only for upstream identity, directory, or role calls; they are not profile data and are never assigned to the effective impersonated identity.

#### Role refresh

`src/studioshare-role-refresh.js` refreshes persisted impersonation candidates through StudioShare user and role endpoints. Only `resolved` and `resolved_empty` role snapshots with a recent timestamp are fresh; the verified freshness window is 15 minutes. Stale or unverified candidates refresh with concurrency limited to three, and new work stops when returned rate-limit metadata reports zero remaining.

A successful lookup replaces `role_slugs`, records `resolved` or `resolved_empty`, and updates resolution time. A failed lookup records `forbidden`, `not_found`, or `unavailable` while preserving the previous role slugs. Starting and renewing impersonation require successful refresh of the selected effective profile; failure prevents session establishment or extension.

#### User impersonation lifecycle

`ATLAS_USER_IMPERSONATION_ENABLED` is fail-closed and enables only for normalized literal `true`. When disabled, routes return not found and an existing impersonation cookie is invalidated and cleared during identity resolution.

`src/user-impersonation.js` generates a 32-byte random opaque token, stores only its SHA-256 hash, and places the raw token in an HTTP-only, SameSite=Strict, secure-when-request-secure cookie scoped to `/`. The verified lifetime is 24 hours. The actual SQL under `sql/user-impersonation/` was inspected:

- Create inserts token hash, authenticated actor ID, effective profile ID, and expiration.
- Resolve requires token hash, authenticated actor ID, no invalidation timestamp, and future expiration, then joins the effective profile.
- Renew requires that same binding and an active unexpired session, updates expiration, and records renewal time.
- Invalidate records invalidation time and reason only for an active token.

Invalid, expired, feature-disabled, switched-profile, returned-to-profile, and failed-renewal paths clear or invalidate the browser session as applicable. Renewal reuses the opaque token only after role refresh succeeds. The raw token is never returned in JSON, and real authentication tokens are never used as impersonation tokens.

`js/16a-user-impersonation.js` owns the profile picker, app-role filters, switch confirmation, return-to-profile action, countdown, and renewal prompt. It warns when a save is pending, stores a navigation hint, reloads after identity changes, refreshes the countdown every 30 seconds, and prompts once when 15 minutes remain to request a 24-hour renewal. This browser behavior does not replace server session resolution.

#### Feature flags and rollout

`src/workflow-feature-flags.js` trims and lowercases configured values and enables only literal `true`. Dependency order is `reads`, `history`, `restoration`, `submission`, `decisions`, `publication`, `unlock`, and `publicationDeletion`. A disabled stage disables every later stage.

`publicWorkflowFeatureFlags()` exposes normalized Boolean availability. `reduceWorkflowCapabilities()` intersects authorization with availability, so flags can remove but never grant authority. `requireWorkflowFeature()` rejects disabled direct route calls with HTTP 403. The browser consumes server-returned availability and does not read deployment environment values. Browser route and control gating is presentation only and never replaces server authorization. Rollback disables the stage and dependent later stages without deleting additive revisions, requests, approvals, Inbox records, publications, or activity history.

### Imports, Exports, Tutorials, and Supporting Tools

#### Imports

JSON import is handled through the Audit Library and `js/18-audit-database.js`. One audit object or an array is normalized and submitted through the audit API. `src/audit-repository.js` validates and hashes each document. Equal canonical content returns `unchanged`; changed content uses the revision-aware save path with change type `import`. Import does not create a publication or bypass authorization, workflow locks, or conflict checks.

`js/00-exceljs-loader.js` lazy-loads `vendor/exceljs.min.js` when an Excel feature is first requested, memoizes the promise, reports load failure, and permits retry after failure. `js/09-workbook-import.js` classifies `Vanity Labels`, `Source Table Aliases`, `_audit_logic_steps`, and audit sheets containing `Source File` and `Field Name`. Missing metadata sheets produce warnings; absence of an audit sheet produces a user-visible warning.

Vanity-label rows require source file and field name. Alias rows require source file. Audit rows may add audit-specific labels plus `Used`, `Displayed`, and `Order`. Logic rows may add stable IDs/numbers, type, source, parent, analyst/developer logic, notes, generated/sort/indent metadata, and `params_json`. Invalid `params_json` is reported and that step imports without parameters. Dotted numbering and explicit parent IDs rebuild hierarchy; Analyst Logic prefixes classify THEN, ELSE IF, and ELSE branches.

Workbook data first populates transient `workbookState`. Selecting an audit constructs an in-memory document and then uses normal audit activation and persistence. The workbook is not the shared system of record. Current usage is derived from logic; final display selection/order persists in the audit document.

#### Exports

`js/03-capture-actions.js` captures active controls before complete-audit JSON, preview-row CSV, and Markdown or clipboard Markdown exports. `js/12-export-foundation.js` owns structured exports:

- Requirements Excel creates `Fields` from the canonical Requirements field inventory and `Audit Logic` from preview rows.
- HTML creates one escaped Fields and Audit Logic document for download or clipboard.
- qTest loads `templates/qtest-test-design-template.xlsx`, requires `Guide - Start Here` and `UAT - Disney3`, clears sample content, maps logic preview rows to UAT rows, and preserves template styles.

Display Fields order and canonical Fields composition remain owned by Requirements Preview and `js/21-display-fields.js`; exporters do not create a competing model. Excel outputs require ExcelJS. User-visible errors cover loader failure, workbook/template fetch failure, missing required qTest sheets, unrecognized workbook structure, and invalid logic parameters.

`safeFileName()` retains letters, digits, underscore, and hyphen. Structured filenames use `<audit>_audit_logic_<date>.xlsx`, `<audit>_confluence_<date>.html`, and `<audit>_qtest_template_<date>.xlsx`. Exports are client-generated files. Publication remains the immutable workflow-controlled database snapshot.

#### Tutorials and tools

`js/05-tutorials.js` is the overlay engine. Definitions are owned by `tutorials/tutorial-global.js`, `tutorials/tutorial-audit-library.js`, `tutorials/tutorial-fields.js`, `tutorials/tutorial-logic-builder.js`, and `tutorials/tutorial-save-export.js`. Tutorials are guidance and do not bypass authorization or workflow locks.

- `build-css.mjs` validates CSS source units and `css/manifest.json` and generates root `styles.css`; `tools/analyze-css-cascade.mjs` and `.vscode/tasks.json` expose cascade analysis. Generated `styles.css` is not editable source.
- `ATLAS_APP_VERSION` in `js/00-config-utils.js` is authoritative. `tools/sync-app-version.mjs`, `.githooks/pre-commit`, and `tools/install-git-hooks.mjs` provide version synchronization and Git-hook integration.
- `tools/create-review-bundle.mjs` reads a manifest or positional paths, deduplicates and fingerprints them, and writes a combined review file. The bundle is not runtime source.
- `local-db/init-local-db.sh` applies migration `migrate:up` sections with `ON_ERROR_STOP`; `local-db/seed.sql` creates synthetic local-only profiles, audit, and initial revision.
- `package.json` owns start, Launch proxy, Docker, test, version, hook, and review-bundle commands; `.vscode/tasks.json` owns editor CSS tasks.

The current `npm run check` references absent `public/app.js`; this is a verified validation gap.

## Data and Persistence Architecture

### Schema and SQL responsibility map

`.launch/migrations/` is the schema authority. In timestamp order it creates Field Library/import history, revisioned audits, profiles, deletion events, workflow/approval/publication/Inbox/activity records, impersonation, role-resolution fields, review sessions/items, return/carry-forward/finalization support, canonical review objects, persistent discussions, and rescinded-request state.

Repositories own validation, authorization context, transactions, locking, error mapping, and statement order. `src/sql.js` loads project-relative parameterized SQL:

- `src/audit-repository.js` and `sql/audit-repository/`: audit/revision/step persistence, archive, restore, deletion, and additive restoration.
- `src/audit-preview-repository.js` and `sql/audit-preview-repository/`: read-only history/approval/publication previews and restoration-source verification.
- `src/audit-workflow-repository.js` and `sql/audit-workflow-repository/`: submission, decisions, rescission, publication, unlock, publication deletion, activity, and Inbox.
- `src/audit-review-repository.js` and `sql/audit-review-repository/`: review sessions/items, optimistic drafts, carry-forward, return, and final approval/publication.
- `src/audit-discussion-repository.js` and `sql/audit-discussion-repository/`: canonical links, threads, messages, transitions, and state versions.
- `src/field-library.js` and `sql/field-library/`: staged CSV replacement and import history.
- `src/user-impersonation.js` and `sql/user-impersonation/`: hashed opaque-session create, resolve, renew, and invalidate.

SQL filenames alone do not establish behavior. Transaction and locking guarantees require repository plus invoked SQL evidence. The verified final-review lock order is review session, audit, approval request, then submitted revision. No global lock order is claimed for other paths. Local DB scripts are development support; generated CSS, review bundles, reports, and downloaded exports are not schema or runtime source.

### Audit document and revision model

`atlas_audits` stores audit identity, current revision pointers and numbers, ownership/update metadata, and archive metadata. `atlas_audit_revisions` stores immutable numbered JSONB document revisions, SHA-256 hashes, parent links, change metadata, actor metadata, and restoration lineage.

`atlas_audit_steps` stores the current structural index for stable step IDs. `atlas_audit_step_revisions` stores numbered step documents with operations such as create, update, move, restore, and delete. Current-revision pointers connect the audit and step index rows to their latest immutable revision rows.

The complete revision schema also contains later workflow additions. Those columns and relational authorities are intentionally deferred rather than partially documented here.

### Write responsibility

- Browser capture converts current controls into the in-memory audit document.
- IndexedDB stores only the recoverable local snapshot.
- `js/18-audit-database.js` serializes and schedules HTTP writes.
- `server.js` validates request context and delegates to repositories.
- `src/audit-repository.js` owns document validation, canonical hashing, transaction boundaries, revision-number allocation within the locked audit, and SQL sequencing.
- `src/sql.js` loads SQL files by safe project-relative paths.
- `sql/audit-repository/` owns individual parameterized statements.

### Workflow relational model

`atlas_audits` stores current workflow pointers and lock/cycle metadata. Approval requests are revision-bound authorities for pending decisions. Approvals authorize an exact approved revision. Publications are immutable numbered snapshots. Review sessions bind one request, submitted revision, and reviewer; review items store canonical review-object metadata and draft decisions. Inbox items and activity rows are projections/audit history. Discussion threads attach to durable canonical review objects, while messages and transitions provide immutable conversation history.

The audit document's `status` remains JSON metadata and must not be used as the relational workflow authority. Similarly, Inbox read/action state, review UI labels, and publication deletion state must not be interpreted as `workflow_status`.

### Field Library and authoring data

The PostgreSQL field library and its import history are authoritative for database-backed source browsing. Catalog JSON files remain browser-loadable supporting data. Source lookup indexes, field-option lists, usage indexes, created-field eligibility, Requirements Preview rows, and Audit Issue results are transient derived state and must be invalidated or rebuilt after their owning audit or catalog inputs change.

Audit assignments, selected sources, steps, and `displayFields` persist inside the revisioned audit document. Directory search results, picker state, collapsed rule state, virtualization measurements, issue caches, and rendered preview text are not independent durable records.

## Security and Authorization

Security rules are consolidated here and referenced from functional areas.

- **Server enforcement is authoritative.** Protected routes apply authenticated identity plus the relevant feature middleware, audit capability, recipient check, workflow/review validation, or administrative middleware. Hidden or disabled browser controls, read-only notices, navigation guards, and feature-driven visibility never replace server authorization.
- **Audit capability ownership.** `src/audit-authorization.js` owns coarse audit capabilities. Pending Approval and Published lock ordinary mutation. Assigned Analysts may submit an exact Draft or Draft Revision and may rescind the exact pending request. A verified, non-assigned `atlas-admin-team` selected approver receives state- and relationship-specific approve, publish, or unlock capabilities. `atlas-align-admin` governs publication deletion and Deleted Items. Disabled users and unavailable or malformed privileged role resolution fail closed.
- **Workflow and review authority.** Transactional repositories re-read and lock authoritative audit, request, approval, revision, review-session, publication, Inbox, and discussion records as required. Inbox items are projections, not authority. Reviewer Mode decisions and discussions use separate request/session-bound APIs and do not authorize audit-document mutation.
- **Source Library administration.** `src/source-library-authorization.js`, server middleware, and OPA require the verified `atlas-align-admin` role for Field Library replacement. Opaque role IDs are not role slugs; unavailable or malformed role resolution does not grant access.
- **OPA.** `.launch/opa/authz.rego` defaults to deny, permits root GET, requires authentication for non-admin application routes, and applies role checks to reviewed administrative routes. Application middleware and repositories remain responsible for resource-specific and transaction-time enforcement.
- **Feature availability.** Rollout flags are fail-closed, dependency-ordered, and capability-reducing. Enabling a feature does not authorize a user; disabling it blocks the route even when authorization would otherwise allow it.
- **Token and actor boundaries.** Real StudioShare access tokens remain server-side. Impersonation tokens are opaque, hashed at rest, and browser-cookie scoped. Restoration tokens are signed, expiring, user/audit/source/current-state bound, and revalidated inside the locked transaction. Effective and authenticated actor attribution remain distinct where supported. No raw token, cookie, secret, private key, or populated environment value belongs in client payloads or this document.
- **Read-only isolation.** Historical views, semantic previews, publication snapshots, approval-review documents, and Reviewer Mode documents remain detached from editable `state.audit` and ordinary recovery/autosave/durable-write paths.
- **Fail-closed behavior.** Missing authentication, disabled accounts, unresolved privileged roles, stale relational identifiers, invalid or expired tokens, hash mismatches, disabled flags, and ambiguous canonical identities reject the operation rather than broadening access.

## Testing and Validation

`npm test` uses Node's built-in runner. The suite maps to these contracts:

- **Schema/repositories:** schema plus audit, preview, workflow, review, and discussion repository tests.
- **Routes/authorization:** preview, workflow, review, and discussion route tests; audit and Source Library authorization tests.
- **Workflow UI:** workflow, locking, publication, publication deletion, Recently Deleted, Inbox, rescission, and browser-rollout tests.
- **Reviewer Mode:** landing, mode, draft, carry-forward, return, feedback, and finalization tests.
- **History/identity:** comparison, history, preview, profiles, role refresh, and impersonation tests.
- **Authoring:** Logic Builder initialization, render scheduling, AuditIssueEngine, ATLAS issue integration, and My Audits rendering tests.
- **Rollout/version:** feature-flag, rollout, validation-matrix, version-sync, and Git-hook tests.

Many tests are static or contract-oriented. They do not prove live PostgreSQL concurrency, browser accessibility, cross-browser layout, production StudioShare identity, Inbox delivery, or deployment behavior. No test, build, browser, Docker, database, or deployment command was executed while producing this document.

Recognized validation commands are `npm test`, `npm run version:check`, `node build-css.mjs --check`, and `docker compose up --build`. `npm run check` is excluded because it references absent `public/app.js`.

## Source Ownership Index

- **Application shell and load order:** `index.html`, `js/00-html-partials-loader.js`, `js/06-events-bootstrap.js`
- **Shared state and rendering:** `js/01-state-dom.js`, `js/02-logic-rendering.js`, `js/16-page-shell.js`
- **Version and CSS build:** `js/00-config-utils.js`, `tools/sync-app-version.mjs`, `css/manifest.json`, `build-css.mjs`
- **Audit Library and persistence:** `sections/my-audits.html`, `js/04-persistence.js`, `js/18-audit-database.js`, `src/audit-repository.js`, `sql/audit-repository/`
- **Audit Overview and assignments:** `sections/audit-overview.html`, `js/16-page-shell.js`, `src/user-profile-repository.js`, `src/user-profile-routes.js`
- **Shared Visual Picker:** `sections/visual-picker.html`, `css/visual-picker.css`, `js/15h-visual-picker.js`
- **Sources and Field Library:** `sections/sources.html`, `js/10-field-picker.js`, `js/13-catalog-field-browser.js`, `js/15b-source-library-ui.js`, `js/17-source-database.js`, `src/field-library.js`, `sql/field-library/`
- **Logic Builder:** `sections/logic-builder.html`, `js/02-hierarchy.js`, `js/07-phrase-catalog.js`, `js/14-catalog-driven-builder.js`, active `js/15a`-`15g` layers
- **Display Fields and Requirements Preview:** `js/21-display-fields.js`, `js/02-logic-rendering.js`, corresponding `sections/` and `css/` files
- **Audit Issues and Readiness:** `catalogs/audit-issue-rules.json`, `js/22-audit-issue-engine.js`, `js/23-atlas-audit-issues.js`, corresponding `sections/` and `css/` files
- **Workflow and publication:** `js/24-audit-workflow-ui.js`, `src/audit-workflow-repository.js`, `sql/audit-workflow-repository/`
- **Inbox:** `sections/inbox.html`, `css/inbox.css`, `js/25-inbox.js`
- **Reviewer Mode and review sessions:** `css/audit-review.css`, `js/27-audit-review-mode.js`, `src/audit-review-repository.js`, `sql/audit-review-repository/`
- **Persistent discussions:** `src/audit-discussion-repository.js`, `sql/audit-discussion-repository/`
- **Publication administration:** `js/26-recently-deleted-publications.js`, `src/audit-workflow-repository.js`
- **Workflow flags and authorization:** `src/workflow-feature-flags.js`, `src/audit-authorization.js`, `server.js`
- **History and timeline:** `sections/audit-history.html`, `css/audit-history.css`, `js/19-audit-version-history.js`, `js/19a-audit-history-browser.js`
- **Comparison, preview, and restoration:** `src/audit-comparison.js`, `src/audit-preview-repository.js`, `src/audit-repository.js`, `sql/audit-preview-repository/`, `sql/audit-repository/`
- **Identity, profiles, and role refresh:** `server.js`, `src/user-profile-repository.js`, `src/user-profile-routes.js`, `src/studioshare-role-refresh.js`
- **Impersonation:** `js/16a-user-impersonation.js`, `src/user-impersonation.js`, `sql/user-impersonation/`
- **Authorization and rollout:** `.launch/opa/authz.rego`, `src/audit-authorization.js`, `src/source-library-authorization.js`, `src/workflow-feature-flags.js`, `server.js`
- **Core source schemas:** `.launch/migrations/20260820112100_create_atlas_field_library.sql`, `.launch/migrations/20260820150000_add_import_user_identity.sql`, `.launch/migrations/20260826131500_create_atlas_user_profiles.sql`

## Known Limitations and Unverified Areas

- History, restoration-token flows, impersonation, role refresh, and full import/export/tooling capabilities remain later-pass placeholders or partial cross-references.
- The supplied bundle represents commit `a1e0317d4d832dca0237caee812acee62aa9e26f` with the bundle files themselves modified when generated; this document describes that supplied snapshot.
- No runtime commands, tests, builds, accessibility checks, deployment checks, or live database operations were performed.
- Migrations beyond the base audit/revision and deletion-event schema were present in the bundle but are not interpreted in this pass.
- Live multi-session concurrency, transaction isolation behavior, recipient delivery, role-directory freshness, and production feature-flag configuration were not executed or observed.
- Attachment binary handling is not implemented or verified in the reviewed workflow/review/discussion sources.
- Root `styles.css` was excluded as editable source because it is generated. Logs, secrets, ZIP archives, historical patches, vendored minified code, sample audit contents, and aggregate generated files were not treated as maintainable source.

- `npm run check` references absent `public/app.js`.
- No dedicated workbook-import or export test file is present in the reviewed tree.
- `templates/qtest-test-design-template.xlsx` was not included in the review bundle, so its binary content was not inspected beyond code-required sheet names.

## Maintenance Checklist

Update this document when any of the following changes:

Authoritative owners are `js/00-config-utils.js` for version, `css/manifest.json` plus `css/*.css` for CSS, `.launch/migrations/` for schema, `server.js` for route wiring, repositories plus their SQL directories for transactions, `catalogs/audit-issue-rules.json` for issue declarations, and `test/` plus `package.json` for validation scope.

- `ATLAS_APP_VERSION` or version synchronization targets.
- Runtime entry points, browser partials, classic-script order, or final global-function ownership.
- Shared state, load acceptance, rendering, or navigation contracts.
- CSS source-unit ownership, manifest ordering, or build behavior.
- Audit routes, request/response contracts, persistence timing, conflict handling, or recovery behavior.
- Audit schema, migrations, repository transaction boundaries, SQL sequence, or authorization.
- Archive, restore, Deleted Items, permanent-deletion, or deletion-event behavior.
- Public integration functions or environment-variable names.
- Tests that establish or retire a documented contract.
- History reconciliation, canonical comparison identity, preview sources, restoration token/locking behavior, identity boundaries, role refresh, impersonation lifecycle, authorization, or feature-flag dependency order.
- Assignment roles, profile hydration, source identity, Field Library replacement, Logic Builder rule contracts, Display Field identity/order, Requirements Preview composition, Audit Issue rules/actions, or shared picker adapters.
- Workflow states/pointers, approval outcomes, review-session/item identity, Inbox projections, publication snapshots/deletion, discussion permissions/state, server capabilities, lock order, feature flags, or transaction boundaries.

Do not update this context for a renamed private helper unless it changes a documented contract or source owner. Do not edit root `styles.css` directly. Do not treat logs, secrets, generated bundles, ZIP archives, historical patches, vendored minified code, or sample audit data as current architectural authority.
