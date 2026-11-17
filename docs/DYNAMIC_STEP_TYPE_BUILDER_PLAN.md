# Dynamic Step Type Builder: Plan

Status: approved (2026-11-16). Phase 0 is done (JonahAngell/atlas-align#37,
issue #5000). Phase 1 (issue #5001), Phase 2 (issue #5002) and Phase 3 (issue
#5003) are in review. Later phases have not started.

Phase 2 note: the owners ask `window.ATLASStepTypeRuntime`
(`js/13a-step-type-runtime.js`), which answers from the registry or returns
null so the built-in code runs. Two owners also gained a registry-only path:
the step-type validation rule `audit.logic.step-type-rules` in Audit Issues,
and text import of sentences written by a definition's English template
(`textImport.fromEnglish`). Script roles `source`, `join`, `union`, `sort` and
`dedupe` place a step the way the matching built-in type is placed, so they
expect that type's parameter names until phase 5.

Phase 3 note: three definitions (`reference_source`, `sort_records`,
`remove_duplicates`) are in `catalogs/step-types/` and are
bundled into `js/step-types/definitions.generated.js` by
`npm run step-types:manifest`, so the registry is ready before any app script
runs. What a template cannot express is named from
`js/13-step-type-library.js`: helpers (for example `sortKeys`, `formatKind`,
`splitPart`), migration handlers (`sync_sort_fields`,
`sync_duplicate_fields`) and editor blocks (`sort_keys`, `duplicate_keys`).
The schema gained `formulas.notes` and the field keys `valueTemplate`,
`heading` and `popover`. Their per-type English, notes, formulas, editor,
normalization, picker entries and qTest placement code is deleted. Three
things stay until later phases: the hand-written text-import parsers in
`js/15j` (the definitions set `textImport.fromEnglish: false`), and the
expected outcomes and script assembly in `js/12` and `js/12b` (phase 5).
`format_field` and `split_field` gained structured editors on `main` while
this work was in progress, so they stay on their built-in code here and
become definitions with behavior blocks in phase 4.

## Goal

Every Logic Builder step type is one data record, not code spread across
files. A record holds:

- the backend name
- the subtypes
- the editor UI
- the English phrasing
- the Excel, SQL Server and Python logic
- the automatic manual notes
- the export behavior (SQL/Python scripts, qTest)
- the validation rules
- how to read the type back from text

A separate Step Type Builder app, in its own repository and attached to the
same database, creates and edits these records without code. It exports them as a `.zip` that unzips into
the repository for commit and deploy.

## Decisions taken

| #   | Decision                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Definitions are stored as Postgres rows. The app also loads JSON definitions from the repository, which the builder exports as a `.zip`.                                                                              |
| 2   | Both simple and complex step types are built without code.                                                                                                                                                            |
| 3   | All 11 existing types move into the new structure. Existing audits, imports and saved revisions keep working unchanged.                                                                                               |
| 4   | Persisted parameter names and values stay as they are (`value_mode: "Static value"`, `join_type: "INNER JOIN"` and so on). Each definition maps to them.                                                              |
| 5   | "Notes" means the automatic manual notes some types fill in when the analyst leaves Notes blank (Join, Union and ELSE today, from `noteText()`).                                                                      |
| 6   | The builder is a separate app deployed on StudioShare Launch, connected to the same database as ATLAS Align.                                                                                                          |
| 7   | New types work in every export: Requirements Preview, Developer Logic, the full SQL and Python scripts, qTest, the workbook and JSON.                                                                                 |
| 8   | ELSE, Filter Rows, Flag Records, Split Field and `union_sources` stay as hidden legacy definitions.                                                                                                                   |
| A   | Publishing in the builder makes a type live in ATLAS for whichever database the builder is attached to. The `.zip` and a deploy carry it to other environments and make it the versioned baseline in this repository. |
| B   | Published and locked audits render with the definition versions recorded on the publication. Editable audits use the latest published version.                                                                        |
| C   | The builder lives in its own repository. It copies the step type engine from this repository at build time.                                                                                                           |
| D   | Phase branches use issue numbers starting at 5001, one number per branch in order (Phase 0 used 5000).                                                                                                                |

## What exists today

Each step type is split across these places. Every one of them gets a seam
that reads from the registry.

| Concern                     | Current owner                                                                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type list and labels        | `STEP_TYPE_OPTIONS` (`js/14`), `ATLAS_IMPORT_TITLES` (`js/15j`), the filtered list in `js/15g`                                                                                                                        |
| Legacy mapping and defaults | `LEGACY_TYPE_MAP`, `legacyTypeFromStepType`, and `normalizeCatalogStep` with its 2 wrappers (`js/14`)                                                                                                                 |
| Editor UI                   | `renderGuidedBuilder` (`js/14`) with 3 overrides (`js/15e`, `js/15f`, `js/15g`); `renderCreateModeInputs` with 2 wrappers; `renderConditionRow` with 3 overrides; two different THEN-action lists (`js/14`, `js/15g`) |
| Reading the editor back     | `capture` override (`js/14`)                                                                                                                                                                                          |
| English                     | `analystLogic` with 2 wrappers (`js/07`); templates in `logic_phrase_catalog.json`                                                                                                                                    |
| Automatic notes             | `noteText()` (`js/07`); templates in `notes.*`                                                                                                                                                                        |
| Excel/SQL/Python            | One function per type and a `switch` in `atlasDeveloperFormulas` (`js/02b`)                                                                                                                                           |
| Full scripts                | `atlasCodeStartsData`, `atlasCodeIsUnion`, `atlasCodeClassify` (`js/12b`)                                                                                                                                             |
| qTest                       | `qtestSectionForStep`, `qtestTestTypeForStep` (`js/12`)                                                                                                                                                               |
| Created columns             | `atlasRegisterStringTransformResult`, `atlasRegisterSplitResults`, `atlasCreatedColumnNames` (`js/14`)                                                                                                                |
| Validation                  | `js/23-atlas-audit-issues.js` and `catalogs/audit-issue-rules.json`                                                                                                                                                   |
| Text import                 | One parser per type in `js/15j` (about 3,500 lines)                                                                                                                                                                   |

## Design

### 1. The step type definition

One JSON document per step type, checked against a JSON Schema
(`catalogs/step-types/schema.json`). Format Field, shortened:

```json
{
  "schemaVersion": 1,
  "id": "format_field",
  "version": 1,
  "label": "Format Field",
  "description": "Change how one field's values are written.",
  "category": "transform",
  "status": "active",
  "legacyType": "transform",
  "aliases": { "step_type": [], "type": [] },
  "migrations": [],
  "subtypes": {
    "param": "format",
    "label": "Format",
    "control": "cards",
    "options": [
      {
        "value": "text",
        "label": "Text",
        "description": "Keep the value as text."
      },
      {
        "value": "number",
        "label": "Number",
        "description": "Keep the value as a number."
      },
      { "value": "date format MM/DD/YYYY", "label": "Date MM/DD/YYYY" },
      { "value": "eight digits with leading zeroes", "label": "Eight digits" }
    ]
  },
  "fields": [
    {
      "param": "field_name",
      "control": "field_picker",
      "label": "Field",
      "sourceParam": "source_file",
      "required": true
    }
  ],
  "outputs": { "assigns": "{{param.field_name}}" },
  "english": {
    "default": "Format {{tableColumn source_file field_name}} as {{param.format}}{{formatSuffix}}."
  },
  "formulas": {
    "shape": "assignment",
    "target": "{{param.field_name}}",
    "bySubtype": {
      "text": {
        "excel": "TEXT({{ref}}, \"@\")",
        "sql": "CAST({{ref}} AS NVARCHAR(4000))",
        "python": "{{ref}}.astype(\"string\")"
      },
      "number": {
        "excel": "VALUE({{ref}})",
        "sql": "TRY_CAST({{ref}} AS DECIMAL(38, 10))",
        "python": "pd.to_numeric({{ref}}, errors=\"coerce\")"
      }
    },
    "fallback": { "notes": ["developer_logic.notes.unknown_format"] }
  },
  "autoNotes": null,
  "export": {
    "scriptRole": "column",
    "qtest": { "section": "D", "testType": "Data Validation" }
  },
  "validation": [
    {
      "when": "always",
      "require": "field_name",
      "severity": "critical",
      "message": "Choose the field to format."
    }
  ],
  "textImport": { "fromEnglish": true },
  "tests": [
    {
      "name": "text format",
      "params": {
        "source_file": "sap.hi0256",
        "field_name": "Pernr",
        "format": "text"
      },
      "expect": {
        "english": "Format \"sap.hi0256\".\"Pernr\" as text.",
        "sql": "CAST([Pernr] AS NVARCHAR(4000)) AS [Pernr]"
      }
    }
  ]
}
```

What each part does:

- **`id`** is the backend name. It is stored as `step.step_type` and never
  renamed. `legacyType` fills `step.type` for older readers.
- **`aliases` and `migrations`** replace `LEGACY_TYPE_MAP` and the
  `normalizeCatalogStep` wrappers. Migrations are declarative rules: rename a
  parameter, set a default, convert `union_sources` into `join` with
  `join_type: UNION`, and so on. Every audit load, JSON import, workbook import
  and text import runs them.
- **`subtypes`** names the parameter that already holds the subtype for that
  type (`value_mode`, `then_action_type`, `join_type`, `format`). Option values
  are the stored strings, so saved data is unchanged (decision 4). A subtype option
  can add its own `fields` and `export` overrides, and `english`, `formulas`
  and `autoNotes` each hold a `bySubtype` map that falls back to `default`.
- **`fields`** describes the editor UI as data (see "Editor UI from
  definitions" below).
- **`english`, `formulas` and `autoNotes`** are templates (see "Template
  language" below).
- **`export`** gives the SQL/Python script role (`source`, `join`, `union`,
  `column`, `filter`, `sort`, `dedupe`, `none`) and the qTest section and test
  type. Both can be rules keyed on the subtype or the action.
- **`validation`** holds declarative required-field and relationship rules. The
  existing Audit Issues engine turns them into issues.
- **`tests`** are sample inputs with expected outputs. The builder runs them
  while you edit, and they become regression tests in the repository.

### 2. Template language (no code, nothing is executed)

The repository already follows a rule that catalog strings are never run as
code (`audit-issue-rules.json`). This template language follows the same rule:
it is a small parser with a fixed set of features, not `eval`.

- Values: `{{param.x}}`, `{{subtype}}`, `{{stepNumber}}`, `{{parent.param.x}}`.
- Typed helpers that know the output format:
  - `{{ref field_param source=source_param}}` writes `[@[Field]]` in Excel,
    `[alias].[Field]` in SQL Server (alias only when the field name is
    ambiguous), and `df["Field"]` / `sources["alias"]` in Python. These are
    today's rules.
  - `{{string x}}`, `{{list x}}`, `{{quote x}}` and `{{tableColumn …}}` cover
    literal values in each format and the analyst quoting rules.
- Logic: `{{#if}}…{{else}}…{{/if}}`, `{{#switch}}{{#case}}`, and `{{#each}}`
  with separators and "first/last" variants. This covers multi-key sorts,
  duplicate column lists and join keys.
- **Blocks** are reusable complex pieces. Each block has its own UI control, its
  own English and its own Excel/SQL/Python output, and any definition can
  include it:

  | Block                         | Today's code it wraps                                                                                            |
  | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
  | `condition_tree`              | IF condition groups: AND/OR nesting, value modes, field-to-field comparison, first-available value, group checks |
  | `then_action`                 | THEN/ELSE actions: display, do not display, display text, set value, calculation, string transform, freeform     |
  | `math`                        | Structured math with rounding                                                                                    |
  | `string_transform`            | First/last N characters, character length, split into columns                                                    |
  | `join_keys`                   | Join key pairs and the Venn picker                                                                               |
  | `sort_keys`, `duplicate_keys` | The multi-field list editors                                                                                     |
  | `source_ref`                  | Reference Source and alias                                                                                       |

  A complex type built in the builder is a set of fields and blocks plus
  templates. IF/THEN, for example, is `condition_tree` plus `then_action`.

- **Formula shapes** (`expression`, `assignment`, `filter`, `frame`) tell the
  SQL/Python script assembler how to place the step: `CASE … AS [Target]`,
  `WHERE`, `df.loc[mask, …]`, or a statement that replaces the dataframe. New
  types therefore show up in the full scripts without assembler changes
  (decision 7).

**Limit.** A real new capability that no template feature or block can express
(a pivot, a window function, or a widget that doesn't exist yet) needs one
code change to add a new block or helper. After that, the builder can reuse it
in any definition. Raw Excel/SQL/Python text with placeholders and loops is
always allowed in templates, so most "new" logic can be written there directly.

### 3. Editor UI from definitions

`renderGuidedBuilder` is replaced by one form renderer that reads `fields`:

- **Controls:** `source_picker`, `field_picker` (current eligibility rules,
  including created fields), `choice` (cards, chips, segment or list), `text`,
  `textarea`, `whole_number`, `toggle`, `hidden`, `hint`, and `block`.
- **Per-field settings:** `label`, `placeholder`, `help`, `required`,
  `default`, `visibleWhen` / `enabledWhen` (simple equals, in and not-blank
  rules, combined with AND/OR), `sourceParam` and `group`.
- `capture` reads every field from the definition instead of scanning
  `[data-param]`. Today's whole-number check becomes the `whole_number`
  control.
- The current CSS classes and markup patterns stay, so the look doesn't change.
  The Design Foundations rules (labels, 44px targets, focus and error states)
  are built into the renderer once.

### 4. Where definitions live: repository JSON and Postgres

```
catalogs/step-types/
  schema.json                 JSON Schema for a definition
  manifest.json               ids, versions and content hashes in this folder
  reference_source.json
  create_column.json
  ...                         one file per type, including the hidden legacy ones
test/fixtures/step-types/
  <id>.cases.json             the definition's tests, run by npm test
```

Postgres (new migration, owned by ATLAS Align only):

- **`atlas_step_type_definitions`** holds one immutable row per
  `(type_id, version)`. Columns: `definition jsonb`, `content_hash`, `status`
  (`draft`, `published` or `retired`), `origin` (`repository` or `builder`),
  and created/updated by and at, using the custom-source author columns. Its
  check constraints follow the existing migrations.
- **`atlas_step_type_events`** is the audit trail: created, published, retired,
  imported from the repository.

How the two are reconciled:

1. **At ATLAS Align startup**, the server reads `catalogs/step-types/`, checks
   each file against the schema, and inserts any `(id, version)` that isn't in
   the database yet with `origin = repository`, `status = published`. If a row
   with the same id and version already exists but its content hash differs,
   the server rejects that file and logs an error. It never overwrites a row.
   This is how a committed `.zip` reaches each environment's database (Launch
   gives preview and production separate databases).
2. **ATLAS Align reads the registry** from `GET /api/step-types`, which returns
   the latest published version of each type plus any older versions that
   saved audits refer to. If the database can't be read, it falls back to the
   repository JSON. The registry never ends up empty.
3. **Drafts** exist only in the builder. ATLAS shows a published version to
   admins and analysts once the builder publishes it, with no deploy needed.
   The `.zip` makes it the permanent, versioned baseline (decision A).
4. **Engine compatibility.** Each definition names its `schemaVersion`. ATLAS
   Align loads only definitions whose `schemaVersion` its engine supports and
   reports the rest as an Audit Issue for admins. A builder built from a newer
   engine therefore can't publish a type that the deployed ATLAS can't render.

### 5. Old audits and publications

- Saved steps keep their exact parameter names and values (decision 4). The
  definition's `aliases` and `migrations` handle every older shape that
  `normalizeCatalogStep` handles today, plus workbook `params_json` and the
  JSON import bundle.
- Published snapshots and locked audits render with the definition versions
  that were current when they were published. Those versions are recorded on
  the publication, so later wording changes don't rewrite already-approved
  requirements (decision B). Editable audits always use the latest
  published version.
- The audit document gets no new field on each step. Content hashes, revisions
  and approvals are not touched by this update.

### 6. Text import

- Template-based types (`"fromEnglish": true`) get their parser derived from
  the English template: literal text becomes the match pattern, and
  placeholders become source, field, value and list captures. New types
  therefore support "Import from text" automatically.
- Built-in types whose sentences are irregular (IF/THEN condition groups,
  Create Column split, Remove Duplicates keep-clauses) keep their existing
  parsers, registered as named import handlers in the block library. The
  definition names the handler, and the 15j entry point routes through the
  registry.

### 7. The Step Type Builder app

A separate Launch app in its own GitLab/GitHub repository (decisions 6 and C)
with these properties:

- **Runtime:** Express on Node 22 Alpine, `USER 1000:1000`, port 8080,
  `/api/health`. Uses MyID login and allows only the `atlas-align-admin` role,
  checked on the server for every request. Its own Dockerfile, webhook and
  service-account setup follow the Launch checklist.
- **Database:** connects with `STUDIOSHARE_DB_URL` and reads and writes only
  the `atlas_step_type_*` tables. It ships no migrations. ATLAS Align owns the
  schema, so the two apps can never disagree about it.
- **Shared engine, copied at build time:** ATLAS Align keeps the step type
  engine in one self-contained folder, `js/step-types/`. That folder holds the
  template renderer, the registry, the blocks and the form renderer, plus the
  scripts the engine depends on, listed in `js/step-types/engine-manifest.json`
  together with an engine version. The builder repository pins an ATLAS Align
  tag or commit in `atlas-engine.lock`. Its build step fetches those files at
  that revision and copies them into the image, so its previews run the same
  code ATLAS Align runs. Upgrading the builder's engine is a one-line lock
  change followed by a rebuild.
- **Real previews:** the builder page loads the copied engine scripts in the
  browser, so the editor preview is the markup ATLAS would render.
- **Exports target this repository.** The `.zip` layout below is relative to
  the ATLAS Align repository root, not the builder's.

Screens:

1. **Library.** Every type with its status, version, category and legacy flag.
   Search, plus filters for active, legacy and draft.
2. **Editor**, in tabs:
   - _Basics:_ id (locked once published), label, description, category,
     legacy flag, aliases.
   - _Subtypes:_ which parameter holds the subtype, and an option list you can
     add to and reorder.
   - _Fields:_ drag-and-drop form designer with a palette of controls and
     blocks, plus show/enable rules.
   - _English_, _Formulas_ (Excel, SQL, Python side by side, per subtype),
     _Auto Notes:_ template editors with placeholder autocomplete and syntax
     errors marked inline.
   - _Export:_ script role, formula shape, qTest section and test-type rules.
   - _Validation:_ required fields and messages.
   - _Tests:_ sample steps and expected output.
3. **Live preview pane.** As you edit, it shows the actual ATLAS editor
   rendered from the draft, the English text, Developer Logic, a SQL/Python
   script fragment, the qTest row, and pass/fail for every test case. You can
   type into the preview editor to try different subtypes.
4. **Publish.** Checks the schema, the templates and all tests, then publishes
   a new immutable version. Retire hides a type from the ATLAS picker; existing
   steps keep rendering.
5. **Export .zip.** One button. The archive is laid out from the repository
   root of ATLAS Align, so unzipping it at that root puts every file in place:

   ```
   catalogs/step-types/<id>.json
   catalogs/step-types/manifest.json
   test/fixtures/step-types/<id>.cases.json
   STEP_TYPES_EXPORT.md            what changed, versions, and the next steps
   ```

   The export covers all published types, or only the ones you select. The
   zip is built server-side with Node's own `zlib` (deflate and CRC32), so no
   new dependency is needed. **Import .zip/JSON** reads an exported archive
   back into the builder.

Security: the server checks every definition against the schema on both write
paths (builder API and repository load). Templates are parsed, never run. All
template output shown in the UI is escaped with `esc`. Builder routes are
rate-limited, and actions are logged without definition bodies or tokens.

## Phases

Each phase is its own branch and merge request, with no visible change to
ATLAS behavior until phase 7. Phase 0 used issue 5000. Later branches take the
next issue number in order, starting at 5001 (decision D), for example
`feature-5001-step-types-engine`. A phase that needs more than one branch uses
one number per branch. Phase 7 is built in the builder's own repository
(decision C), so its branches and merge requests live there.

| Phase                                        | Work                                                                                                                                                                                                                                                                                                                                                                         | Done when                                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **0. Snapshot current output** (done, #5000) | For every step in `audits/*.json`, the test fixtures and one generated case per subtype, record the English, automatic notes, Developer Logic, full SQL and Python scripts, qTest rows, workbook rows and text-import results.                                                                                                                                               | `npm test` stores and compares the snapshots. No app change.                                                  |
| **1. Engine**                                | JSON Schema, template parser and renderer, registry loader (repository JSON only), migration runner. Classic-script files in `js/step-types/`, listed in `engine-manifest.json`, loaded early in `index.html` and testable through `node:vm`.                                                                                                                                | Unit tests cover every template feature, schema errors and migrations.                                        |
| **2. Registry entry points**                 | Every owner in "What exists today" asks the registry first and falls back to its current code. `STEP_TYPE_OPTIONS` and `ATLAS_IMPORT_TITLES` are built from the registry.                                                                                                                                                                                                    | Snapshots unchanged.                                                                                          |
| **3. Simple types**                          | Definitions for Reference Source, Format Field, Sort Records, Remove Duplicates and Split Field (legacy). Old code for these is deleted.                                                                                                                                                                                                                                     | Snapshots identical for these types.                                                                          |
| **4. Blocks and complex types**              | Build the blocks from today's functions; definitions for Create Column (all value modes, math, string transforms), IF/THEN, ELSE (legacy), Join/Union, `union_sources` (legacy), Filter Rows and Flag Records (legacy). Then remove the wrapper chains for `renderGuidedBuilder`, `analystLogic`, `normalizeCatalogStep`, `renderCreateModeInputs` and `renderConditionRow`. | Snapshots identical; Playwright Logic Builder checks pass.                                                    |
| **5. Exports and validation**                | `js/12`, `js/12b` and `js/23` read `export` and `validation` from the definitions. Built-in validation rules move into the definitions.                                                                                                                                                                                                                                      | Snapshots identical, Audit Issues tests pass.                                                                 |
| **6. Postgres**                              | Migration, `src/step-type-repository.js` with `sql/step-type-repository/*.sql`, startup import of repository files, `GET /api/step-types`, ATLAS loading the registry from the API with a repository fallback, version pinning on publications (decision B).                                                                                                                 | Contract tests for import, conflict rejection, fallback and pinned rendering.                                 |
| **7. Builder app**                           | In the builder's own repository: the app, `atlas-engine.lock` and the engine copy step, screens, preview, publish, zip export and import, Dockerfile, Launch setup.                                                                                                                                                                                                          | You can build a new type end to end, see it in ATLAS, export the zip, commit it, and deploy it to production. |
| **8. Docs**                                  | `PROJECT_CONTEXT.md` and README sections, a "How to add a step type" guide, and a builder tutorial.                                                                                                                                                                                                                                                                          | Docs reviewed.                                                                                                |

Phases 0–5 are a refactor that keeps output identical. The phase 0 snapshots
are what make it safe to delete the old per-type code.
