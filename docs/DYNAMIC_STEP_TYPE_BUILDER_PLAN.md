# Dynamic Step Type Builder: Plan

Status: approved (2026-11-16). Phases 0–7 are merged (Phase 0 was
JonahAngell/atlas-align#37, issue #5000), and so are the field-control
conversions (issues #5010–#5014). Phase 8, condition and action templates
(issue #5026), is merged: ATLAS Align #62–#69 and builder #8. Phase 9,
File Utility on the step type engine, and Phase 10, condition and action
catalogs, are planned below (issue #5037). Phase 11 (docs) has not started.

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

Phase 4 note: every type that came with ATLAS Align is now a definition. The
seven complex ones (`create_column`, `if_then`, `join`, and the legacy
`else`, `union_sources`, `filter_rows` and `flag_records`) name a behavior
block with the schema's new top-level `block` key, and so do `format_field`
and `split_field`, whose structured editors from `main` became the
`format_field` and `split_field` blocks. A block in
`js/13-step-type-library.js` supplies the parts it has (normalize, editor,
English, notes, formulas, created columns) from today's functions; the
definition supplies the rest. A new definition can reuse a block, for example
a second type built on the `join` block. The wrapper chains for
`renderGuidedBuilder`, `analystLogic`, `normalizeCatalogStep`,
`renderCreateModeInputs` and `renderConditionRow` are replaced by named
functions, and the built-in picker list, legacy type map, qTest table and
import titles are gone. New script roles `condition`, `else` and `flag` were
added; the engine version is 1.2.0. Snapshots are identical.

Phase 5 note: the exports and Audit Issues read the definitions. The SQL and
Python script builders (`js/12b`) switch on `export.scriptRole` directly. The
qTest export (`js/12`) takes its placement from `export.qtest`, its expected
outcomes from the new `export.qtest.outcomes` templates (`atlas` and `source`)
or a block's `qtestOutcomes`, and the THEN outcome it tests from a block's
`qtestAction`; the per-type `switch` is gone. Validation rules gained
`builtIn`, which turns on one of the existing Audit Issues checks
(`conditions`, `fieldRelationships`, `action`, `join`, `createdColumns`,
`sourceMath`, `thenMath`, `stringTransform`, `thenStringTransform`), with
`when` for a subtype. `js/23` no longer names step types for its checks, so a
new type built on the `join` block gets the join checks. Engine version 1.3.0 (1.4.0 after Phase 6).
Snapshots are identical. Still named in code: the issue repair menu that adds
an IF / THEN, Join or Create Column step, and the issue sort order.

Phase 6 note: definitions live in Postgres. Migration
`20261117120000_create_atlas_step_type_definitions.sql` adds
`atlas_step_type_definitions` (a trigger refuses any change to a row except
its status and `updated_*`), `atlas_step_type_events`, and
`atlas_audit_publications.step_type_versions`. At startup the server checks
`catalogs/step-types/` with the engine itself (`src/step-type-engine.js` runs
the engine scripts in a `vm`), then `src/step-type-repository.js` inserts the
versions the database lacks as published, skips identical ones, and logs and
rejects a file whose content differs from the stored version. A file changed
without rebuilding the manifest is rejected too. `GET /api/step-types` returns
the latest published version of each type, the versions publications are
pinned to, and a `latest` map. The browser starts on the bundled definitions
and then loads the API into a registry that still holds the bundle, so a
failed or empty response never leaves it empty. The registry takes
`latestVersions`, so a retired newer version kept for a pin is not offered
(engine version 1.4.0). Decision B: the three publication inserts record the
latest published versions; a locked audit's workflow summary and a
publication opened in Audit History pass them to
`ATLASStepTypeRuntime.usePinnedVersions()`. Definitions the engine cannot
read (a newer `schemaVersion`, a conflict) appear to ATLAS admins as the
Audit Issue `audit.logic.step-type-definitions-unavailable`.

Field controls note (issue #5010, then #5011–#5014): block-based types become
field-based, one branch per type. The control palette, which is the Step Type
Builder's list of controls, lives in one machine-readable file:
`catalogs/step-types/controls.json`. For every control it lists:

- its name, label, category and status (`available` or `planned`)
- the field properties it reads
- the params it writes, for composite controls
- the features an author can switch off
- for `choice`, the option properties

The schema's control enum, `ATLASStepTypeRuntime.FIELD_CONTROLS` and the palette
must agree; `test/step-type-field-controls.test.js` checks that. Validation
with `palette` rejects any property, feature or option key a control does not
read. It also rejects a control the runtime cannot render, which covers the
`planned` ones. Each planned control is implemented in the branch that first
uses it:

- `condition_group` and `action` with `if_then`

Field additions:

- `features: {name: false}` hides a feature for new steps.
- An option's `hidden` and `visibleWhen` hide it for new steps. A saved step
  that uses a hidden value still shows it.
- `layout: "full"`, `display: "select"`, `maxLength`, `suggestions`, `helpId`
  and `requiredIssue: false`, which keeps the required mark but leaves the
  Audit Issue to the type's own checks.
- The `callout` control renders an escaped template `message`.

English, notes and formula `variants` (`[{when, …}]`, first match wins) cover
outputs that differ by more than one subtype parameter. The editor redraws
when a param from `ATLASStepTypeRuntime.rerenderParams()` changes.

Format Field and Split Field are version 3, made of fields. They have no
blocks, and `sync_format_field` / `sync_split_field` handlers keep their
parameters normalized. A publication pinned to v1 or v2 still renders: the
removed `format_field` and `split_field` blocks stay registered as shims
(`replacedBlocks` in `js/13-step-type-library.js`) that render through the
latest field-based definition, and a test renders the snapshot corpus pinned
to v2 against v3. Every later conversion keeps a shim for each block it
removes. Engine version 1.6.0. Stored param names and option
values never change, and snapshots are identical.

Create Column is version 2, made of fields (issue #5011, engine version
1.7.0). The
`sync_create_column` handler keeps its parameters normalized, and the
`create_column` block stays as a shim, tested with the corpus pinned to v1.
It added these ordinary field features:

- `optionsFrom` on a `choice` reads the option order from a phrase catalog
  list (here `app_config.logic_options.create_value_modes`). Listed values come
  first, labelled and described by the matching `options` entry; options the
  list leaves out follow. Without the catalog, `options` is used as written.
- `clearable` on a `field_picker` adds a Clear button that removes the value
  and its `sourceParam`.
- `layout: "pair"` puts adjacent fields side by side.
- The `readout` control shows a fixed, read-only value with help.
- A `choice`'s `help` shows below the choice.
- The condition test `positiveWholeNumber`.
- qTest outcome templates can read `record`, the audit record's name.

Two composite controls, `math` (calculations with rounding) and
`string_transform` (characters, counts and splits), are drawn by the app's own
editors (`atlasSourceFieldModeInputs`, `atlasStringTransformModeInputs`). The
builder treats them as opaque: it can place and show or hide them, but cannot
change what is inside them. Their palette `params` count as the type's params,
so `visibleWhen` can read what they write.

Some features exist only so that saved steps keep the markup the old editor
wrote. They are marked `internal` in `controls.json`, and the builder does not
offer them:

- `sharesParam` lets two fields write the same param. Create Column needs it
  for `column_name` (hidden when a split names its columns, a text input
  otherwise), `expression` (hidden for a written expression, a textarea in the
  legacy expression form) and `column_description` (with a different hint for
  a written expression).
- `clearKey` on a clearable field picker writes the old
  `data-clear-concat-field` button the Concatenate fields editor had.
- `legacyOptionSpacing` on a select-style choice writes `<option value="x" >`
  for unselected options, as the legacy expression form (value mode
  "Expression" or an unknown mode) did.

The value mode "Expression / calculation" is hidden for new steps and left out
of the catalog list; a saved written expression still shows it.

Join is version 2 and Union Sources (legacy) version 2, both made of fields
(issue #5012, engine version 1.8.0). The `sync_join` handler copies the source
params and defaults the join type to INNER JOIN. The `join` and
`union_sources` blocks stay as shims, tested with the corpus pinned to v1.
Saved Union Sources steps still open as a UNION Join through the
`union_sources_to_join` handler. A shim now also runs the latest definition's
migration handlers, so a step pinned to an old block version is normalized
as before. Join added:

- The condition test `equalsIgnoreCase`, which compares in any upper or lower
  case without trimming. The editor and the formulas use it to tell a UNION
  join from a key-matched one; the English and notes trim the value first, as
  before, with `(eq (upper (trim param.join_type)) "UNION")`.
- Two composite controls drawn by the app's own editors: `join_type` (the
  join type, its kept-rows hint and the Choose Join Type button that opens the
  picker, `atlasRenderJoinTypePickerButton`) and `join_keys` (the key pair
  list, `atlasJoinKeysEditorHtml`). Like `math`, the builder can place and
  show or hide them but not change their parts.
- Helpers `joinKeyPairs`, `joinKeyList` and `joinFormula`. The key-matched
  join formulas still come from `atlasDevJoin` through `joinFormula`; the
  UNION formulas, English, notes and qTest outcomes are templates.

Internal features for the old Join markup (the builder does not offer them):

- `editorFrame` on a definition: `standalone` leaves out the outer
  `selected-source-only-builder` frame, `className` adds
  `join-guided-builder`, and `heading` is a template, so the heading reads
  "Union Sources" for a UNION join and "Join" otherwise.
- `pairClass` on a paired `source_picker` adds `join-union-input-pair` to the
  Left and Right Source row.
- `className` on a `hint` adds `join-builder-union-hint`.
- `sharesParam` lets the UNION Left and Right Source pickers show
  `left_source` and `right_source`, which `join_keys` also keeps.

IF / THEN is version 2 and ELSE (legacy) version 2, both made of fields
(issue #5013, engine version 1.9.0). The `sync_if_then` handler copies the
source params and defaults the action type; `copy_step_source` copies them
for ELSE. The `if_then` and `else` blocks stay as shims, tested with the
corpus pinned to v1. They added:

- The composite control `condition_group` (the condition tree,
  `atlasConditionGroupEditorHtml`). It keeps `conditions_json` and the step's
  `conditions` mirror in step on the real step, and gives a step without
  conditions one blank condition (`atlasNormalizeConditionGroup`). The
  runtime runs such composite normalizers after the field defaults, and a
  shim runs them too.
- The composite control `action` (the THEN or ELSE action form,
  `atlasActionEditorHtml`), with the ordinary property `branch` (THEN or
  ELSE). A definition with an action field gets its qTest outcome from it
  (`atlasQtestThenAction`). Both composites list their features in
  `controls.json` but cannot switch them off yet; like `math`, the builder
  can place and show or hide them but not change their parts.
- Helpers `conditionText`, `actionText` (with `branch="ELSE"`), `ifPrefix`,
  `ifThenFormula` and `elseFormula`. The English is a template that joins the
  condition and action phrases; the condition, action and formula text still
  come from the app's condition and action code through these helpers. The
  `step` template root now also has `conditions` and `action`, the saved
  legacy conditions and free-text action those helpers read.
- A formula set that writes only a lead (an ELSE folded into its IF's
  formulas) gives only the lead, without an empty notes list.

Internal features for the old IF / THEN and ELSE markup (the builder does not
offer them):

- `editorFrame.heading: false` leaves out the heading.
- `editorFrame.tabs` and a field's `tab` put the conditions and the action on
  the Condition Builder and Action Builder tabs. The tab last chosen stays
  open across steps; the first opens until one is chosen. The markup is the
  old one, which has no tab roles, so the builder does not offer tabs until
  they get the tablist, tab and tabpanel roles and arrow-key navigation.
- `className` on the ELSE frame adds `else-action-builder`, and its hint is
  an ordinary `hint` field.

Filter Rows and Flag Records (both legacy) are version 2, made of fields
(issue #5014, engine version 1.10.0). They use only controls the builder
already offers: hidden `source_file` and `source_alias` (whose
`valueTemplate` shows the audit's alias), a `field_picker`, the operator as
a `choice` read from the catalog's operator list, a `textarea` for compare
values, and the Filter Action or Flag Action `choice`. Flag Records adds the
Message `text` and an Output Column `field_picker` that shows the default
error column until one is named. `copy_step_source` copies a legacy step's
source and field. The `filter_rows` and `flag_records` blocks stay as shims,
tested with the corpus pinned to v1, so no behavior block is left in the
types that came with ATLAS Align. They added:

- `export.qtest.action`, the outcome qTest tests for a type without an
  `action` field: `kind` (`display_text` or `do_not_display`) and, for
  `display_text`, `message` and `outputColumn` as plain templates. Export
  rules can replace it, so Flag Records hides the record when its action is
  `do_not_display`. An `action` field still takes its place.
- Helpers `valueList` (compare values as quoted text, with `lead=" "`) and
  `conditionFormula` (the formulas of the IF / THEN the step stands for).

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

- **Controls:** the palette in `catalogs/step-types/controls.json`:
  `source_picker`, `field_picker` (current eligibility rules, including created
  fields), `choice` (cards, chips, segment, list or select), `text`,
  `textarea`, `whole_number`, `toggle`, `hidden`, `hint`, `callout`, `block`,
  and the composite `sort_keys`, `duplicate_keys`, `condition_group`,
  `action`, `math`, `string_transform` and `join_keys`.
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
  browser, so the editor preview is the markup ATLAS would render. The
  `preview` section of `engine-manifest.json` lists every file the preview
  page needs, found by removing scripts from the full `index.html` list until
  an output changed. `scripts` is the whole page in load order (the engine
  scripts appear where they load):

  1. `js/00-icons.js`
  2. `js/00-config-utils.js`
  3. `js/step-types/00-templates.js`
  4. `js/step-types/01-schema.js`
  5. `js/step-types/02-definitions.js`
  6. `js/step-types/03-migrations.js`
  7. `js/step-types/04-registry.js`
  8. `js/step-types/definitions.generated.js`
  9. `js/01-state-dom.js`
  10. `js/02-hierarchy.js`
  11. `js/02-logic-rendering.js`
  12. `js/02b-developer-formulas.js`
  13. `js/03-capture-actions.js`
  14. `js/07-phrase-catalog.js`
  15. `js/09-workbook-import.js`
  16. `js/10-field-picker.js`
  17. `js/11-repo-library.js`
  18. `js/12-export-foundation.js`
  19. `js/12b-code-export.js`
  20. `js/13-step-type-library.js`
  21. `js/13a-step-type-runtime.js`
  22. `js/14-catalog-driven-builder.js`
  23. `js/15a-audit-library-ui.js`
  24. `js/15d-logic-rules-list.js`
  25. `js/15e-logic-step-editor.js`
  26. `js/15f-join-picker.js`
  27. `js/15g-visual-ui-events.js`

  plus `css/global.css`, `css/sources.css` and `css/logic-builder.css` (in
  that order) and `catalogs/logic_phrase_catalog.json`. After the scripts
  load, the page calls `initPhraseCatalog()` and puts the draft in a registry
  with `ATLASStepTypeRuntime.useRegistry()`, then calls
  `renderGuidedBuilder(step)`, `analystLogic(step)`, `developerLogic(step)`,
  `atlasDeveloperFormulas(step)`, `buildAuditSqlScript()`,
  `buildAuditPythonScript()` and `qtestSectionsFromLogicSteps()` on a one-step
  `state.audit`. `test/step-type-preview-scripts.test.js` loads only these
  files on a bare page and checks every step type renders, and that the
  outputs equal the whole app's snapshots. Engine version 1.5.0 adds the list; 1.5.1 adds js/08-step-templates-validation.js, which declares renderValidationPanel.

- **Drafts** live in `atlas_step_type_drafts`
  (`.launch/migrations/20261117130000_create_atlas_step_type_drafts.sql`):

  ```sql
  CREATE TABLE atlas_step_type_drafts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type_id text NOT NULL UNIQUE,        -- ^[a-z][a-z0-9_]*$, one draft per type
    base_version integer NULL,           -- published version it started from; NULL = new type
    definition jsonb NOT NULL,           -- an object whose "id" equals type_id
    revision integer NOT NULL DEFAULT 1, -- optimistic concurrency, +1 on every save
    created_by_user_id / _username / _full_name text NOT NULL,  -- not blank
    created_at timestamptz NOT NULL DEFAULT current_timestamp,
    updated_by_user_id / _username / _full_name text NOT NULL,  -- not blank
    updated_at timestamptz NOT NULL DEFAULT current_timestamp
  );
  ```

  A save is `UPDATE ... SET definition = $1, revision = revision + 1,
updated_* = ... WHERE type_id = $2 AND revision = $3`; no row updated means
  someone else saved first. Publishing inserts the definition with
  `sql/step-type-repository/insert-definition.sql` (`origin = 'builder'`,
  status `published`), records a `published` event with `record-event.sql`
  and deletes the draft, in one transaction. `atlas_step_type_events.event`
  also allows `draft_saved` and `draft_discarded`; those rows have a NULL
  `definition_id` (a draft has no definition row), `version` holds the
  draft's `base_version`, and `details` holds the revision. Every other event
  still needs its definition row.

- **Retire** is `sql/step-type-repository/retire-definition.sql` plus a
  `retired` event (`retireStepTypeVersion()` in
  `src/step-type-repository.js`). It changes only status and `updated_*`.
  `GET /api/step-types` keeps sending retired versions that publications are
  pinned to and lists types with no published version left in `retired`, so
  the browser drops them from the picker while existing steps keep rendering.
  For such a type it also sends the highest retired version, so steps of a
  builder-made type (no bundled file to fall back on) still render.
- **Retiring the latest version is checked.** Saved steps don't record a
  version, so retiring the latest published version moves editable audits to
  the next older published one. If that version lacks an option value
  (subtype or choice) the retired one offers, the retire is refused with a
  `StepTypeRetireBlockedError` (`code: "option_removed"`), the same rule as
  removing an option on publish. Older versions and the only published
  version can always be retired. `lock-published-versions.sql` locks the
  type's published rows so the check and the retire see the same versions.
  The builder applies the same rule in its own retire route.
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
ATLAS behavior until phase 7. Phase 0 used issue 5000. Later work takes the
next issue number in order, starting at 5001 (decision D), for example
`feature-5001-step-types-engine`. A phase that needs more than one piece of
work uses one issue number per piece.

From 5042 on, each piece is one commit, not one branch. The pieces a phase has
in one repository land together: one branch named after the first issue, one
pull request that closes every issue in it, and one engine version raise for
the whole pull request. ATLAS Align merges by rebase, so each commit still
lands on `main` on its own. A piece gets its own pull request only when it
needs another repository's merged change first (the contract pairs, ATLAS
Align before File Utility and the builder). Decided 2026-11-19, after #71 to
#73. Phase 7 is built in the builder's own repository
(decision C), so its branches and merge requests live there.

| Phase                                        | Work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Done when                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0. Snapshot current output** (done, #5000) | For every step in `audits/*.json`, the test fixtures and one generated case per subtype, record the English, automatic notes, Developer Logic, full SQL and Python scripts, qTest rows, workbook rows and text-import results.                                                                                                                                                                                                                                                              | `npm test` stores and compares the snapshots. No app change.                                                                                                           |
| **1. Engine**                                | JSON Schema, template parser and renderer, registry loader (repository JSON only), migration runner. Classic-script files in `js/step-types/`, listed in `engine-manifest.json`, loaded early in `index.html` and testable through `node:vm`.                                                                                                                                                                                                                                               | Unit tests cover every template feature, schema errors and migrations.                                                                                                 |
| **2. Registry entry points**                 | Every owner in "What exists today" asks the registry first and falls back to its current code. `STEP_TYPE_OPTIONS` and `ATLAS_IMPORT_TITLES` are built from the registry.                                                                                                                                                                                                                                                                                                                   | Snapshots unchanged.                                                                                                                                                   |
| **3. Simple types**                          | Definitions for Reference Source, Format Field, Sort Records, Remove Duplicates and Split Field (legacy). Old code for these is deleted.                                                                                                                                                                                                                                                                                                                                                    | Snapshots identical for these types.                                                                                                                                   |
| **4. Blocks and complex types**              | Build the blocks from today's functions; definitions for Create Column (all value modes, math, string transforms), IF/THEN, ELSE (legacy), Join/Union, `union_sources` (legacy), Filter Rows and Flag Records (legacy). Then remove the wrapper chains for `renderGuidedBuilder`, `analystLogic`, `normalizeCatalogStep`, `renderCreateModeInputs` and `renderConditionRow`.                                                                                                                | Snapshots identical; Playwright Logic Builder checks pass.                                                                                                             |
| **5. Exports and validation**                | `js/12`, `js/12b` and `js/23` read `export` and `validation` from the definitions. Built-in validation rules move into the definitions.                                                                                                                                                                                                                                                                                                                                                     | Snapshots identical, Audit Issues tests pass.                                                                                                                          |
| **6. Postgres**                              | Migration, `src/step-type-repository.js` with `sql/step-type-repository/*.sql`, startup import of repository files, `GET /api/step-types`, ATLAS loading the registry from the API with a repository fallback, version pinning on publications (decision B).                                                                                                                                                                                                                                | Contract tests for import, conflict rejection, fallback and pinned rendering.                                                                                          |
| **7. Builder app**                           | In the builder's own repository: the app, `atlas-engine.lock` and the engine copy step, screens, preview, publish, zip export and import, Dockerfile, Launch setup.                                                                                                                                                                                                                                                                                                                         | You can build a new type end to end, see it in ATLAS, export the zip, commit it, and deploy it to production.                                                          |
| **8. Condition and action templates**        | Condition and action text and formulas move from app code into definition partials (see "Phase 8" below): template partials, a condition tree helper, `if_then` v3, `else` v3, `filter_rows` v3, `flag_records` v4, switchable composite features, `schemaVersion: 2` for definitions with partials, an export shape warning, then the old app code is deleted. Branches 5029–5035, plus 5036 in the builder repository.                                                                    | Snapshots and the condition/action matrix identical; v1 and v2 pins render; a builder type can switch parts off; unplaceable condition formulas warn.                  |
| **9. File Utility on the engine**            | File Utility reads step type definitions and the publication's pinned versions from the shared database and decides what runs from each definition's `export.fileUtility` block; contract v2; ATLAS readiness reads the same block; runs record the versions (see "Phase 9" below). Branches 5038–5044 across ATLAS Align, File Utility and the builder.                                                                                                                                    | Fixture audits compile and report readiness as before; a builder type that names a compiler runs in File Utility with no Python change; old pins still compile.        |
| **10. Condition and action catalogs**        | Action kinds become shared, versioned definitions that draw the Action editor and carry the wording, formulas, qTest outcome and checks; the operator list is read from one catalog; carrying conditions, THEN / ELSE branches, the linked inverse and the order group are read from the definition; composites seed new steps; definition sentences import Conditions and Action (see "Phase 10" below). Branches 5045–5052, plus 5053 in File Utility and 5054 in the builder repository. | Snapshots, matrix and pinned tests identical; a builder type with Conditions and Action behaves like IF / THEN, including import; a new action kind is one definition. |
| **11. Docs**                                 | `PROJECT_CONTEXT.md` and README sections, a "How to add a step type" guide, and a builder tutorial.                                                                                                                                                                                                                                                                                                                                                                                         | Docs reviewed.                                                                                                                                                         |

Phases 0–5 are a refactor that keeps output identical. The phase 0 snapshots
are what make it safe to delete the old per-type code.

## Phase 8: Condition and action templates (planned, issue #5026)

Conditions and actions are the last big part of a step type that a
definition can place but not write. `if_then` v2, `else` v2, `filter_rows` v2
and `flag_records` v3 get their condition and action text, notes, formulas and
qTest outcome from app code through helpers. This phase moves that text and
those formulas into the definitions, so a type built in the Step Type Builder
can write its own and switch parts off. Output stays identical.

### Where the text and formulas come from today

| Helper (in `js/13-step-type-library.js`) | App code it ends in                                                                                                                                                                                                                                                                                                                           | Used by                             |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `conditionText`                          | `conditionGroupPlain` → `parseStepConditions`, `conditionTreePlain`, `conditionToPlain`, `conditionValuePlain`, `conditionCompareFieldPlain`, `formattedValueList`, then `ensureIfThenPrefix` (`js/07`)                                                                                                                                       | `if_then` v2 English                |
| `actionText`                             | `thenActionPlain`, wrapped twice (`thenActionPlainWithMath`, `thenActionPlainWithStringTransform`), or with `branch="ELSE"` `elseActionPlain`, wrapped once (`elseActionPlainWithStringTransform`); they use `excludeKeyColumnPlain`, `atlasDisplayTextPhraseValues` and `atlasStringTransformAnalystPhrase` (`js/07`)                        | `if_then` v2 and `else` v2 English  |
| `ifPrefix`                               | `ensureIfThenPrefix` (`js/07`)                                                                                                                                                                                                                                                                                                                | `if_then` v2 English                |
| `ifThenFormula`                          | `atlasDevIfThen` → `atlasDevConditionTree`, `atlasDevConditionLeaf`, `atlasDevActionValue`, `atlasDevFilterFormulas`, `atlasDevGroupExcludeFormulas`, `atlasDevActionExpression`, `atlasDevPyActionLines`, `atlasDevAppendNotes`; `atlasDevElseStepFor` reads `state.audit` to fold a matching ELSE into the same `IF(…)` / `CASE` (`js/02b`) | `if_then` v2 formulas and notes     |
| `elseFormula`                            | `atlasDevElse`, which reads the parent IF's conditions and action from `state.audit` (`js/02b`)                                                                                                                                                                                                                                               | `else` v2 formulas, lead and notes  |
| `conditionFormula`                       | `atlasDevLegacyCondition`, which builds a one-condition IF / THEN and calls `atlasDevIfThen` (`js/02b`)                                                                                                                                                                                                                                       | `filter_rows` v2, `flag_records` v3 |
| `valueList`                              | `formattedValueList` (`js/07`)                                                                                                                                                                                                                                                                                                                | `filter_rows` v2, `flag_records` v3 |
| none (an `action` field)                 | `atlasQtestThenAction` (`js/12`), called by `qtestActionWith` in `js/13a`; for freeform text it parses the sentence for "display … in column …" and "do not display"                                                                                                                                                                          | qTest for `if_then` and `else`      |

The words come from `catalogs/logic_phrase_catalog.json`:
`analyst_logic.if_then.*`, `analyst_logic.else.*`, `blank_comparison`,
`run_parameter`, `math`, `rounding`, `list_format`, and
`developer_logic.display_notes.*`, `developer_logic.notes.*`,
`developer_logic.else_step` and `else_included`. Operators come from
`app_config.logic_options.operators` and `operator_sets`; their formulas come
from `ATLAS_DEV_COMPARE_OPERATORS`, `ATLAS_DEV_TEXT_MATCH_OPERATORS` and
`ATLAS_DEV_BLANK_OPERATORS` in `js/02b`.

The code export (`js/12b`) does not call the condition code. It takes
`atlasDeveloperFormulas(step)` and reads the formula text itself: SQL that
starts with `WHERE ` becomes a filter CTE, `CASE WHEN … AS [x]` becomes a
column, an ELSE with only a lead becomes a note, and a condition-role step
whose SQL does neither is reported as a gap. Templates must keep those
shapes. `atlasCodePrimaryAlias` also reads `parseStepConditions`.

Other callers of the same app code, which this phase reroutes or leaves:
`qtestConditionText` (`js/12`, uses `conditionGroupPlain`), the complete
statements in `js/02-logic-rendering.js` (use `conditionToPlain`), the
`inverse_else` path in `atlasDeveloperFormulas` (calls `atlasDevIfThen`),
Audit Issues (`js/23`, `parseStepConditions`), File Utility readiness
(`js/22a`) and text import (`js/15j`).

### Scope

In scope:

- The English, automatic notes, Excel, SQL and Python formulas and the qTest
  outcome of conditions and actions, written as templates in the
  definitions.
- Switching condition parts and action kinds off in a definition, and the two
  app editors honouring that.
- Deleting the app code above once nothing calls it, and rerouting the other
  callers to `ATLASStepTypeRuntime`.

Not in scope:

- The editor markup of condition rows and the action form. They stay the app
  editors (`atlasConditionGroupEditorHtml`, `atlasActionEditorHtml`), which the
  builder places but cannot change.
- Text import of IF / THEN sentences (`js/15j` stays a hand-written parser;
  the definitions keep `textImport.fromEnglish: false`).
- Audit Issue checks (`builtIn` `conditions`, `action`, `thenMath`,
  `thenStringTransform`, `fieldRelationships`) and File Utility readiness.
- New action kinds or condition value modes defined in the builder (open
  question 3).

### Condition parts

The `condition_group` palette lists 7 features. Two of them are not built.

| Part             | What it is today                                                                                                                                                                                                                 | Switch off?                                                                                   | What the template language needs                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `nesting`        | Groups (`conditionType: "group"`, `groupConnector`), written as bullets with "ALL OF:" / "ANY OF:" in English and as parentheses in formulas; top-level connectors follow AND-before-OR; a group of one item reads as that item. | Yes. Hides Add Group; saved groups still render.                                              | The `conditionTree` helper, which keeps today's structure rules and renders each single condition with a definition partial. "ALL OF:" / "ANY OF:" move to the phrase catalog. |
| `fieldCompare`   | Value mode `field`: a compare field, maybe from a second source.                                                                                                                                                                 | Yes. Removes "Compare to Field" from the value modes (and with it `math`).                    | A `{{#case "field"}}` in the leaf partial, `field` on `this.compareSourceFile`, and the field form of the text-match operators (pandas uses `df.apply(lambda row: …)`).        |
| `valueList`      | Several values with Add Value: `"A", "B" or "C"`; SQL `IN` / `NOT IN`, pandas `isin`, Excel `OR(…)` / `AND(…)`.                                                                                                                  | Yes. One value and no Add Value.                                                              | `valueList` (exists), `{{#each this.compareValues}}`, `combine`, and `compareLiteral` (number or text, the rule from `atlasDevConditionLeaf`).                                 |
| `runParameters`  | Value mode `parameter`, stored as `values` with `compareParameter: "runDate"`; English "the run date"; formulas `@RunDate`, `run_date`, `RunDate`.                                                                               | Yes. Removes "Run Parameter" from the value modes.                                            | An `{{#if this.compareParameter}}` branch in the leaf partial. No new helper.                                                                                                  |
| `math`           | `compareMathJson` on a field compare ("plus file … column …"; `atlasDevMath`).                                                                                                                                                   | Yes. Hides the math editor on a field compare.                                                | `mathPhrase` and `mathFormula` taking a list (`json this.compareMathJson`) as well as params.                                                                                  |
| `firstAvailable` | Not built. Only the phrases `analyst_logic.conditions.first_available_*` exist; no editor, formula or saved data uses them.                                                                                                      | Already off in practice. Mark it `planned` in `controls.json` until it is built (decision 2). | When built: a value mode plus `COALESCE` / `IFS` / `combine_first` formulas, which templates can write once the leaf partial has it.                                           |
| `groupChecks`    | Not built. Only the phrases `analyst_logic.conditions.group_*` exist. (The action "do not display any record with the same key" is part of `do_not_display`, not this.)                                                          | Same as `firstAvailable`.                                                                     | When built: per-group formulas (`COUNTIFS`, `EXISTS` / window, `groupby().transform`), which need a new helper for the Excel helper column.                                    |

Always on, not features: the blank / null mode, the legacy `expression` mode
(shown only for saved steps), and the operator list (`optionsFrom` already
reads it from the catalog).

### Action kinds

| Kind                          | What it is today                                                                                                                                                                                                                                          | Switch off?                                                                                | What the template language needs                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `display`                     | "display record" / "ELSE display record."; keep-rows formulas (`=cond`, `WHERE cond`, `mask = …` then `df = df[mask]`) and a note. ELSE keeps the rows that fail the IF.                                                                                  | Yes                                                                                        | `not` (dialect-aware negation) for ELSE.                                                          |
| `do_not_display`              | As `display` with the rows inverted; with `then_exclude_scope: "key"` it drops every record sharing a key: an Excel helper column and `COUNTIFS`, `NOT IN (SELECT …)`, pandas `isin(excluded_keys)`, and its own note.                                    | Yes                                                                                        | `json` to read `then_exclude_key_fields_json`.                                                    |
| `display_text`                | Message and output column (default "Error Message"); the separator clause only for a separator other than `\|\|`; appends to an earlier message: `IF(col="", v, col&sep&v)`, `CONCAT_WS(sep, NULLIF(col, ''), v)`, three pandas lines, and an Excel note. | Yes                                                                                        | No new helper: `#if`, `quote`, `column` and multi-line text cover it.                             |
| `set_column_value`            | Target column and a value field, maybe from another source.                                                                                                                                                                                               | Yes                                                                                        | No new helper.                                                                                    |
| `set_column_calculation`      | A field with math and rounding (`atlasDevCalculation`).                                                                                                                                                                                                   | Yes                                                                                        | `mathPhrase` / `mathFormula` with `prefix="then_"`.                                               |
| `set_column_string_transform` | `then_` string transform; English uses the Create Column phrases with context `if_then`, and ELSE wraps it in `else.string_transform`.                                                                                                                    | Yes                                                                                        | `stringTransformPhrase` / `stringTransformFormula` with `prefix="then_"` and `context="if_then"`. |
| `freeform`                    | The action in words; formulas are the row test only, with the action as a note; qTest parses the sentence.                                                                                                                                                | Yes, for new steps. Saved and imported freeform steps still need it, so its partials stay. | `freeformOutcome`, a fixed sentence reader for the qTest outcome (today's regular expressions).   |

Two parts depend on other steps. An IF folds a managed ELSE that writes the
same column into one `IF(…)` / `CASE`. An ELSE reads its IF's conditions and
action, and gives only a lead ("Included in step N") when it was folded.
Templates reach both through the new `elseStep` and `ifStep` roots.

### Template language additions

All are parsed, never run, and stay inside the existing limits (depth 32,
10,000 iterations, 200,000 characters of output).

1. **Partials.** A definition gains `partials: {name: template}`. A partial
   can also be `{english, plain, excel, sql, python}`, and the include picks
   the current format. `{{> name}}` includes a partial and `{{> name this}}`
   includes it with a new context. A partial may include itself, bounded by
   the depth limit. Validation parses every partial and rejects an unknown
   name.
2. **`conditions` root.** The parsed, normalized condition tree as plain data
   (today's `parseStepConditions` and `atlasNormalizeConditionLeaf`). These
   move into a new engine file, `js/step-types/05-conditions.js`, listed in
   `engine-manifest.json` (`scripts` and `preview`), so the builder copies
   them.
3. **`conditionTree nodes leaf="name" style="bullets|inline|precedence"`.** It
   walks the tree with today's structure rules (`conditionTreePlain`,
   `conditionTreeExpression`, `atlasDevConditionTree`), also moved into the
   engine, and renders each single condition with the named partial.
   Templates do not rebuild the bullets or the precedence.
4. **`elseStep` and `ifStep` roots.** The managed ELSE of an IF (the rule in
   `atlasDevElseStepFor`) and the IF of an ELSE (`parent_if_step_id`), each
   `{id, step_type, stepNumber, param, conditions}`. They are read-only and
   one step away, never further.
5. **Formula helpers.** `combine list connector`, `not expr`, `unwrap expr`,
   `compareLiteral value field`, `textMatch` (contains, starts and ends with,
   with Excel `SEARCH` / `LEFT` / `RIGHT`, SQL `LIKE` with escaped
   wildcards, pandas `.str` or `df.apply`), `blankTest`, `json value` (`[]`
   for bad JSON) and `freeformOutcome`. The operator meanings move from the
   `js/02b` constants into the phrase catalog next to the operator list.
6. **`prefix=` and list arguments** on `mathPhrase`, `mathFormula`,
   `stringTransformPhrase` and `stringTransformFormula`, so the `then_`
   params and a condition's `compareMathJson` reuse the Create Column
   helpers.
7. **Action qTest outcome as templates.** Each action kind's partial set
   includes `qtest` (`kind`, `message`, `outputColumn`, `targetColumn`,
   `valueField`, `calculated`), replacing `atlasQtestThenAction`.
8. **Switchable composite features.** `features: {nesting: false}` on a
   `condition_group` field and `features: {freeform: false}` on an `action`
   field. The runtime passes them to the two app editors, which drop the
   value mode, button or action choice. A saved step that uses a switched-off
   part still shows it (the rule for hidden options). Validation still
   requires the partials for every part, switched off or not, because saved
   and imported steps can carry any of them (decision 6).
9. **Schema version 2.** A definition that uses `partials` declares
   `schemaVersion: 2` (decision 4). The engine supports `[1, 2]`
   (`SUPPORTED_SCHEMA_VERSIONS` in `js/step-types/02-definitions.js`,
   `schemaVersions` in `engine-manifest.json`), and `schema.json` allows 2 and
   permits `partials` only with it. Definitions without partials stay at 1.
10. **Export shape warning.** `definitions.validate` with sample steps (each
    `tests` case) renders the formulas of a type whose `export.scriptRole` is
    `condition`, `else`, `filter` or `flag`. It warns when the code export
    could not place them (decision 8). The rule is the one `atlasCodeClassify`
    uses, moved into the engine as `exportShapeProblems`: SQL that neither
    starts with `WHERE ` nor has `AS [`, or an ELSE with neither code nor a
    lead. Formulas that carry a note, as freeform actions do, are exempt,
    because the export shows the note as the reason. A warning does not stop
    loading or publishing; the builder shows it next to the Formulas tab.

Engine version: 1.11.0 for items 1–4 and 9, then one minor version per later
branch (see "Branches").

### Deploy

- ATLAS Align deploys the engine that reads `schemaVersion: 2` (branch 5030)
  before any definition uses it, and before the builder's `atlas-engine.lock`
  moves to that engine (branch 5036).
- A deployment that is still on engine 1.10.0 does not load a version 2
  definition. Its admins see the
  `audit.logic.step-type-definitions-unavailable` Audit Issue, and the
  registry keeps the bundled version, so steps still render.
- The startup import (`src/step-type-engine.js` runs the same engine) checks
  `schemaVersion` the same way, so a server on the old engine skips a version
  2 file and logs it instead of storing it.

### Definitions and versions

Each type gets one new version, in the branch that converts it whole
(conditions and actions together), so no half-converted version is released.

| Definition     | Now | New | What changes                                                                                                                                         |
| -------------- | --- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `if_then`      | 2   | 3   | Partials for the condition leaf (each format), and for each action kind with THEN wording, formulas, notes and qTest; the ELSE fold uses `elseStep`. |
| `else`         | 2   | 3   | Action partials with ELSE wording; formulas from `ifStep.conditions`; the lead.                                                                      |
| `filter_rows`  | 2   | 3   | The leaf partial for its one condition, and `display` / `do_not_display` partials.                                                                   |
| `flag_records` | 3   | 4   | The leaf partial, and `display_text` / `do_not_display` partials.                                                                                    |

The partials are copied into each definition, because a pinned version must
be self-contained (decision 1). `test/fixtures/released-step-type-hashes.json`
gains the four new versions; the released files are never edited
(`test/step-type-released-versions.test.js`). `controls.json` changes too: the
two composites' features become switchable, and `firstAvailable` and
`groupChecks` are marked `planned`.

### Pinned publications

- **v1 pins** already render through block shims (`replacedBlocks`), which
  use the latest definition. They render through the v3 (or v4) definitions
  with no change.
- **v2 pins** (`if_then`, `else`, `filter_rows`) and **v3** (`flag_records`)
  name the helpers `conditionText`, `actionText`, `ifPrefix`,
  `ifThenFormula`, `elseFormula`, `conditionFormula` and `valueList`. They
  stay registered as **replaced helpers**: a new `replacedHelpers` map in
  `js/13-step-type-library.js`, like `replacedBlocks`. Each keeps its name
  and arguments but renders the latest definition's partials of its type.
  `valueList` stays an ordinary helper. This lets the app code go while
  those pins still render. Never remove an entry while such a version can
  be pinned.
- New fixtures `test/fixtures/step-types-pinned/if_then.v2.json`,
  `else.v2.json`, `filter_rows.v2.json` and `flag_records.v3.json`. The
  pinned test renders the corpus pinned to v1 and to v2 / v3 and expects it
  to match the latest output.
- A builder-made type that used these helpers before this phase keeps
  rendering the same way, through the same replaced helpers.

### Snapshot strategy

1. **Baseline first** (branch 5029). Commit a condition and action matrix as a
   test with a recorded fixture. The ie-matrix used in #5013 and #5014 was a
   scratch script; this makes it permanent. Generated steps cover:
   - every value mode and every catalog operator, including unknown ones;
   - one and several values, number and text values, number and text fields,
     same and second source, and compare math;
   - groups nested three deep with mixed connectors;
   - every action kind for THEN and ELSE, the default and custom separators,
     key-scoped do not display, folded and unfolded ELSE, and `inverse_else`;
   - Filter Rows and Flag Records with each action, plus legacy
     `step.source` / `step.field`.

   It records the English, notes, Developer Logic, each formula dialect, the
   lead and notes, the qTest action, and the SQL and Python scripts of a
   one-step audit. It is recorded on `main` before anything changes.

2. **Every later branch** keeps the 14 snapshot files, the matrix, the pinned
   test and the preview-scripts test identical, without
   `npm run snapshots:record`.
3. **While both exist**, a differential test runs the old app function and the
   new template on every matrix step. Branch 5035 deletes it with the app
   code.
4. The Playwright Logic Builder specs and a browser check of the IF / THEN
   tabs, the ELSE editor and the switched-off parts.

### Branches

| Branch                                               | Work                                                                                                                                                                                                                                                                                                                                                                                                           | Engine |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `feature-5029-condition-action-matrix`               | The matrix test and its baseline. No app change.                                                                                                                                                                                                                                                                                                                                                               | 1.10.0 |
| `feature-5030-template-partials`                     | Partials and `{{> }}`, format-keyed partials, the `conditions`, `elseStep` and `ifStep` roots, `conditionTree`, and `js/step-types/05-conditions.js`. Schema version 2 with `partials`; tests that 1.10.0 rejects a version 2 definition and the server import skips it. Unit tests. No definition changes.                                                                                                    | 1.11.0 |
| `feature-5031-condition-action-helpers`              | `combine`, `not`, `unwrap`, `compareLiteral`, `textMatch`, `blankTest`, `json`, `freeformOutcome`, `prefix=` on the math and string-transform helpers, and operator meanings in the catalog. A test-only definition proves them against the app code. The export shape warning (`exportShapeProblems`), with tests: placeable and unplaceable samples, freeform exemption, and no warning for any matrix step. | 1.12.0 |
| `feature-5032-if-then-templates`                     | `if_then` v3 and `else` v3, replaced helpers for the five IF / ELSE helpers, the action qTest partials, and pinned v2 fixtures.                                                                                                                                                                                                                                                                                | 1.13.0 |
| `feature-5033-filter-flag-templates`                 | `filter_rows` v3 and `flag_records` v4, `conditionFormula` as a replaced helper, and pinned fixtures.                                                                                                                                                                                                                                                                                                          | 1.14.0 |
| `feature-5034-condition-action-features`             | Switchable features: the runtime passes them to the two app editors, `controls.json` and the palette test are updated, and `firstAvailable` and `groupChecks` are marked `planned`.                                                                                                                                                                                                                            | 1.15.0 |
| `feature-5035-remove-condition-action-code`          | Delete the `thenActionPlain` and `elseActionPlain` chains, `conditionGroupPlain` and its leaf code, `atlasDevIfThen`, `atlasDevElse`, `atlasDevLegacyCondition` and `atlasQtestThenAction`. Reroute `qtestConditionText`, the complete statements, `inverse_else` and `atlasCodePrimaryAlias` to the runtime.                                                                                                  | 1.15.1 |
| `feature-5036-builder-partials` (builder repository) | Bump `atlas-engine.lock`, add a partials editor and the feature toggles for the two composites. Coordinate with the session adding the composites to the builder palette.                                                                                                                                                                                                                                      | —      |

5029–5033 form one stack; 5034 needs only 5030. 5035 goes last.

### Risks

- **Exact output.** The bullet English, AND-before-OR precedence and
  parentheses (`atlasDevUnwrap`) are subtle. They move into the engine as
  they are, not rewritten as templates. The leaf rules (number or text
  compare, `LIKE` and `SEARCH` escaping, pandas lower-casing) are where
  differences would hide, so the matrix must cover them.
- **The code export reads formula text.** A builder author who writes
  conditions that don't start with `WHERE ` or end in `AS [x]` gets steps the
  SQL script reports as gaps. The validation warning in branch 5031 catches it
  (decision 8).
- **Shared wording is not versioned.** Partials call `phrase`, so a phrase
  catalog change still changes pinned publications, as it does today. Replaced
  helpers and block shims render through the latest definition, so a later
  `if_then` wording change also reaches v1 and v2 pins.
- **Copies.** `if_then`, `else`, `filter_rows` and `flag_records` each carry
  their own action partials. A fix in one must be copied to the others.
- **Builder preview.** The `elseStep` and `ifStep` roots read the audit; the
  builder's one-step preview audit has no ELSE, so the fold cannot be
  previewed until the preview can add a sample ELSE.
- **Older ATLAS.** A deployment on engine 1.10.0 does not read
  `schemaVersion: 2` and keeps its bundled version; admins see the
  definitions-unavailable Audit Issue (see "Deploy").
- **Text import.** A builder type whose partials change the wording cannot be
  imported from text, because the IF / THEN parser is hand-written.

### Decisions

1. Partials are copied into each definition, so a pinned version stays self-contained.
2. `firstAvailable` and `groupChecks` are marked `planned` until they are built.
3. A builder type can only switch built-in action kinds and condition parts off; it cannot add new ones.
4. Definitions that use `partials` declare `schemaVersion: 2`.
5. Group structure stays in a fixed `conditionTree` helper with three styles.
6. A switched-off part still needs its partials, for saved and imported steps.
7. This phase is Phase 8, before Docs, which stays the last phase (now Phase 11, after Phases 9 and 10).
8. Validation warns when a condition-role formula has a shape the code export cannot place.

## Phase 9: File Utility on the step type engine (planned, issue #5037)

File Utility (`JonahAngell/audit-file-utility`) runs published ATLAS Align
audits. Today it knows each step type by name: `atlas_compile.py` has one
`c_<type>` handler per type, rewrites `filter_rows` and `flag_records` into
`if_then`, and lists the types it can run in the contract
`atlas/executable-steps.json`. ATLAS Align's readiness check
(`js/22a-file-utility-readiness.js`) mirrors that by name. So a type built in
the Step Type Builder can't run in File Utility until someone edits Python. This phase makes File Utility read the
step type definitions and the publication's pinned versions from the shared
database, and decide what runs from the definition. It comes before the
catalogs phase (Phase 10) and the docs (Phase 11), by decision.

### What exists today

Surveyed on File Utility `main` at c7f1c03 and ATLAS Align `main` at
20f62b3.

| What            | Where                                                                                                                                                                                                                                                                                | Problem                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Database access | `atlas_db.py` and `sql/atlas/*.sql` read audits and publications from `STUDIOSHARE_DB_URL` and write only `atlas_audit_runs`. They came in File Utility #28, which merged into the `atlas-engine-compiler` branch after that branch had merged (#27), so they are **not on `main`**. | File Utility `main` has no database connection.                             |
| Step types      | `compile_step` in `atlas_compile.py` calls `c_<step_type>`; `SHAPE_TYPES` lists the types that add or remove rows; `legacy_condition` rewrites `filter_rows` and `flag_records`.                                                                                                     | A new type, or a type built in the builder, is "can't run in File Utility". |
| Versions        | `get-publication.sql` reads the snapshot but not `step_type_versions`.                                                                                                                                                                                                               | File Utility ignores which definition version a publication was made with.  |
| Contract        | `atlas/executable-steps.json` (byte-for-byte `catalogs/file-utility/executable-steps.json` here, checked by a test in each repo): `stepTypes` by type id, operators, run tokens, rounding, duplicate actions.                                                                        | Readiness is keyed by type id.                                              |
| ATLAS readiness | `js/22a-file-utility-readiness.js:850–890` checks each type by name; `:570–592` checks action kinds.                                                                                                                                                                                 | Same as File Utility, in JavaScript.                                        |
| Run record      | `atlas_audit_runs` stores the document hash, compiler and engine versions.                                                                                                                                                                                                           | Not the step type versions the run compiled against.                        |

### Design

1. **No second template engine.** File Utility does not render English,
   formulas or qTest, so it does not run the JavaScript engine or a Python
   port of it. It reads definitions as data: the `export.fileUtility` block,
   `export.scriptRole`, the fields and the `migrations`. That keeps the
   Python side small and leaves one renderer.
2. **The `export.fileUtility` block.** Each definition says how File Utility
   runs it:

   ```json
   "fileUtility": {
     "compiler": "if_then",
     "status": "supported",
     "when": "",
     "params": { "conditions_json": "conditions_json" }
   }
   ```

   `compiler` names one of File Utility's handlers (today's `c_<type>`
   functions, plus `legacy_condition` for `filter_rows` and `flag_records`).
   `params` maps the handler's params to this type's params, so a builder
   type with differently named fields can reuse a handler. `status` (default
   `supported`; `partial` needs `when`) and `when` replace the contract's
   `stepTypes` entry. A definition with no block can't run in File Utility,
   and the readiness message says so. Checks that depend on values (free-text
   expressions in `create_column`, the formats of `format_field`) stay in the
   handlers, keyed by compiler instead of type id.

3. **Contract v2.** `contractVersion` 2 adds `compilers` (each handler and
   whether it changes rows, which replaces `SHAPE_TYPES`) and renames
   `stepTypes` to `legacyStepTypes`, used only for pinned definition versions
   written before the block existed. The engine checks a block against
   `compilers` the way it checks fields against the palette: only when the
   caller passes the compiler names (`fileUtilityCompilers`). The builder and
   ATLAS Align's tests pass them. ATLAS Align's registry does not, so a type
   naming a compiler File Utility lacks still loads, and readiness reports it.
   The params each handler reads are not listed: several are families with
   prefixes and numbers (`then_`, `string_split_column_1`…), so a list would
   be wrong. The engine checks that a map points at the type's own params. Both repos still keep
   the file identical and check it by hash.
4. **Reading definitions from the database.** `get-publication.sql` also
   returns `step_type_versions`. A new `get-step-type-definitions.sql` reads
   `(type_id, version, definition, content_hash, status)` for the pinned
   pairs. A draft run, and a publication made before pinning, uses the
   versions ATLAS Align's editor would use (the latest published, the same
   rule as `sql/step-type-repository/list-step-types.sql`). File Utility
   still only reads: the SQL rule test gains `atlas_step_type_definitions` as
   a table it may read. A missing pinned version is a blocker naming the type
   and version, never a silent fallback to another version.
5. **No migration port.** A publication is saved in the shape of the
   versions it pins, and the editor saves a draft after normalizing it, so
   File Utility compiles the document as saved, as it does today. ATLAS
   Align's normalization is more than the declarative ops: the bundled types
   use code handlers (`sync_if_then`, `sync_create_column`,
   `sync_split_field`, `copy_step_source`), subtype and field defaults, and
   composite normalizers. A Python copy of all that would be large and would
   drift. Decided while building 5039.
6. **Readiness from the same data.** `22a` looks up each step's pinned
   definition and reads its block, falling back to `legacyStepTypes` for an
   old version. Its value checks are keyed by compiler. ATLAS readiness and
   the File Utility compiler then agree for builder types too.
7. **Run record.** `atlas_audit_runs` gains a nullable `step_type_versions`
   column: `{type_id: {version, contentHash}}` for what the run compiled
   against. The migration lives in ATLAS Align (File Utility never runs
   migrations); File Utility writes the column only when it exists, as it
   already does for the runs table.

### Definitions and versions

Every bundled type gets a new version that adds only `export.fileUtility`:
`reference_source` 2, `create_column` 3, `if_then` 4, `else` 4, `join` 3,
`union_sources` 3, `format_field` 4, `split_field` 4, `sort_records` 2,
`remove_duplicates` 2, `filter_rows` 4, `flag_records` 5. Templates are
unchanged, so the snapshots, the matrix and the pinned tests stay identical.
`released-step-type-hashes.json` gains the new versions; older pins keep
compiling through `legacyStepTypes`.

### Tests

- File Utility: every fixture audit compiles to the same v3 procedure before
  and after (its existing compile tests); a builder-style definition whose
  block names `if_then` with a param map compiles to the same procedure as
  the equivalent `if_then` step; a missing pinned version blocks; the SQL rule test; database tests against the seeded
  schema (`tests/atlas_db_seed.py`) for pinned, draft and unpinned reads.
- ATLAS Align: readiness gives the same answers for the fixture audits;
  the engine refuses a block with an unknown compiler or an unmapped param;
  the contract hash test.
- File Utility reads the definitions it tests against from a vendored copy of
  ATLAS Align's `catalogs/step-types/`, refreshed by a sync script with a lock
  file like the builder's `atlas-engine.lock`. Production reads only the
  database.

### Branches

| Branch                                                   | Work                                                                                                                                                                                | Engine |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `feature-5038-atlas-db-on-main` (File Utility)           | Land the database access from #28 on `main`, rebased, with its tests.                                                                                                               | —      |
| `feature-5039-file-utility-definition-block`             | Schema and engine check for `export.fileUtility`; contract v2; the twelve new bundled versions; their old versions as pinned fixtures.                                              | 1.17.0 |
| `feature-5040-readiness-from-definitions`                | `22a` reads the pinned definition's block, with `legacyStepTypes` for old versions; value checks keyed by compiler.                                                                 | 1.17.1 |
| `feature-5041-run-step-type-versions`                    | Migration adding `step_type_versions` to `atlas_audit_runs`.                                                                                                                        | —      |
| `feature-5042-read-step-type-definitions` (File Utility) | Read the pin map and the pinned definitions; the draft and unpinned rule; the SQL rule test; the vendored definitions and sync script.                                              | —      |
| `feature-5043-compile-from-definitions` (File Utility)   | Contract v2; `compile_step` dispatches on the block; `SHAPE_TYPES` and `legacy_condition`'s type checks go; the run record.                                                         | —      |
| `feature-5044-builder-file-utility` (builder repository) | Bump `atlas-engine.lock` and copy the contract; an Export setting to pick a compiler and map params, checked by the engine; "Runs in File Utility" or the reason it can't in Tests. | —      |

5038 goes first. 5039 and 5043 change the contract and merge as a pair,
ATLAS Align first. 5040 needs 5039. 5042 needs 5038 and 5041. 5044 goes last.

5038 to 5041 merged one pull request each (File Utility #33, ATLAS Align #71
to #73). Under the batching rule in "Phases", 5042 and 5043 land as one File
Utility pull request on `feature-5042-compile-from-definitions`, one commit
each, and 5044 is one builder pull request.

### Risks

- **Database code off `main`.** Until 5038 lands, File Utility `main` can't
  read audits at all. Its local checkout is on `atlas-db-access`.
- **Two repos, one contract.** A contract change merged on one side only
  makes ATLAS readiness and File Utility disagree. The pair rule and the hash
  tests guard it.
- **Twelve new versions at once.** New versions add one block each; the
  pinned and released-hash tests prove the templates did not change.
- **Drafts saved before a newer version.** A draft run compiles against the
  latest published versions, but the draft may have been saved under an
  older one. The handlers already read older param shapes (they fall back to
  `step.source`, `step.field` and the old condition list), and anything they
  can't read is a blocker, not a wrong result.
- **Builder types with bad param maps.** The engine refuses a block that maps
  to a param the type doesn't have, so the builder can't publish one.

### Decisions

1. File Utility moves onto the definitions before the catalogs phase and the
   docs (owner's decision).
2. File Utility reads definitions as data and does not port the template
   engine (design 1).
3. The production source is the shared database; the vendored definitions
   are for tests only.
4. No Python migration port (design 5), and no `changesRows` or param lists
   in the block; both decided while building 5039.

## Phase 10: Condition and action catalogs (planned, issue #5037)

Phase 8 moved the wording and formulas of conditions and actions into the
definitions. The rest of the app still decides per type and per action kind:
which steps carry conditions, what a new step starts with, which action kinds
exist and how their editor looks, what Audit Issues and File Utility check,
and how text import reads them. A builder type that places the Conditions or
Action editor renders its text and formulas, but it is not treated like
IF / THEN anywhere else. Adding an action kind means editing about ten files
and copying partials into four definitions. This phase reads those answers
from the definitions and from two shared catalogs, so a new type, action kind
or operator is data. Output stays identical.

### Where it is decided today

Surveyed on `main` at 20f62b3.

| What                               | Where                                                                                                                                                                                                                                                                                                                                                                                                                                        | Problem for a new type                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Action kinds offered               | `atlasThenActionTypeChoices` (`js/15g-visual-ui-events.js:263`)                                                                                                                                                                                                                                                                                                                                                                              | A fixed list. A new kind needs app code.                                                                                                                  |
| THEN action editor                 | `atlasRenderThenActionBuilder`: a base (`15g:519`) and two wrappers (`15g:1774` for math, `15g:2138` for string transforms, which patches the base's HTML with a regular expression)                                                                                                                                                                                                                                                         | One hand-written form per kind, in three layers.                                                                                                          |
| Action parameter clean-up          | `15g:3762–3783`, `js/14-catalog-driven-builder.js:1481` and `:1763`                                                                                                                                                                                                                                                                                                                                                                          | Per kind and per type.                                                                                                                                    |
| "Has its own action"               | `completeStatementHasIndependentAction` and its string-transform wrapper (`js/02-logic-rendering.js:1861`)                                                                                                                                                                                                                                                                                                                                   | Per kind.                                                                                                                                                 |
| Action wording and formulas        | The `thenAction`, `elseAction`, `actionTarget`, `actionValue`, `actionExpression`, `valueFormula`, `freeformFormula`, `excludeKey*`, `groupExclude`, `matchedLines` and `unmatchedLines` partials, copied into `if_then` and `else` (and the display kinds into `filter_rows` and `flag_records`)                                                                                                                                            | A fix or a new kind is copied by hand (Phase 8 risk "Copies").                                                                                            |
| Action checks                      | Audit Issues `meaningfulAction` (`js/23-atlas-audit-issues.js:141`) and the inline fixes (`23:1889`); File Utility readiness (`js/22a-file-utility-readiness.js:570–592`); text import `atlasImportParseThenAction` (`js/15j-logic-text-import.js:936–1259`)                                                                                                                                                                                 | Per kind.                                                                                                                                                 |
| Condition operators                | The phrase catalog has `operators`, `operator_meanings` and `operator_sets`, but copies remain: the editor fallback `ATLAS_CONDITION_OPERATORS` (`15g:370`), `ATLAS_IMPORT_OPERATORS` and `atlasImportOperatorsForMode` (`15j:69`, `15j:596`), the opposites map (`js/07-phrase-catalog.js:437`), `PARAMETER_OPERATORS` (`js/step-types/05-conditions.js:26`), and the File Utility contract (`catalogs/file-utility/executable-steps.json`) | An operator added to the catalog is missing from import and ELSE inversion. The catalog's own `operators` list is stale (8 of the 14 in `operator_sets`). |
| Which steps carry conditions       | `["if_then","else","filter_rows","flag_records"]` in `js/15a-audit-library-ui.js:81`, `js/15c-source-field-picker.js:165` and `js/15d-logic-rules-list.js:109`                                                                                                                                                                                                                                                                               | A builder type with a Conditions field is not one.                                                                                                        |
| IF-only behaviour                  | Children inheriting conditions and ELSE inversion in the complete statements (`02-logic-rendering.js:549–760`); "Create or Open Linked Inverse" (`js/15e-logic-step-editor.js:716`, `15g:1297–1370`, `15g:3310`); the field picker's first condition (`js/10-field-picker.js:952`); `js/02b-developer-formulas.js:759`; `14:940`, `14:1762`                                                                                                  | Only `if_then` gets them.                                                                                                                                 |
| New step defaults                  | `atlasCreateRuleOfType` (`15g:1067–1120`) seeds a blank condition and a Display action only for `if_then`; the menu's built-in labels (`15g:1026`); Audit Issues "Add logic step" offers three fixed types with fixed starting params (`23:2905–2975`); the reference step's child menu (`15e:712`, `15e:1064`)                                                                                                                              | A builder type starts empty and is missing from the fix.                                                                                                  |
| Text import                        | Every bundled type sets `textImport.fromEnglish: false`; about 2,200 lines of parsers in `js/15j`. The generic `sentenceMatcher` (`js/13a-step-type-runtime.js:1275`) gives up on any helper other than `quote`, `column`, `number`, `field` and `source`                                                                                                                                                                                    | A builder type that uses Conditions or Action cannot be imported from text.                                                                               |
| Business order groups              | `atlasStepOrderGroup` (`js/02-hierarchy.js:27`) and `stepOrderGroup` (`23:4318`), the same rule twice                                                                                                                                                                                                                                                                                                                                        | Reads type ids.                                                                                                                                           |
| Per-type clean-up and inline fixes | `15g:3778–3782`, `14:1721`; Audit Issues field problems for `split_field`, `create_column`, `format_field` and `remove_duplicates` (`23:1747–1889`)                                                                                                                                                                                                                                                                                          | Per type.                                                                                                                                                 |

### Scope

In scope:

- An **action kind catalog**: each kind's label, fields, wording, formulas,
  qTest outcome, checks and readiness in one entry, and the Action editor
  drawn from it.
- Finishing the **operator catalog**, so every operator list in the app is
  read from it.
- **Capabilities read from the definition**: carrying conditions, having
  THEN / ELSE children, a linked inverse, and the business order group.
- **Composite defaults** for new steps, and new steps created from the
  registry everywhere.
- **Text import of Conditions and Action** in definition sentences.
- Per-type parameter clean-up and Audit Issues inline fixes as field and
  check settings.
- The builder catching up (engine lock, action kinds shown, import test).
- **File Utility catching up.** Phase 9 made step types data there; this
  phase does the same for action kinds (each kind's `export.fileUtility`
  names File Utility's action handler, replacing `22a:570–592` and the
  per-kind code in `atlas_compile.py`) and operators (the contract's
  `operators` are generated from the operator catalog). Contract v3.

Not in scope:

- Rewriting the bundled types' text-import parsers. They keep
  `fromEnglish: false`; only definition sentences gain the new captures.
- Building `firstAvailable` and `groupChecks`.
- Wrapper chains that are not about step types (page shell, display fields,
  sources, workflow).

### 1. Action kind catalog

Each action kind becomes a definition with `"kind": "action"`, stored and
versioned like a step type. It lives in `catalogs/step-types/actions/`, is
bundled into `definitions.generated.js`, and in Postgres uses the same
`atlas_step_type_definitions` table with a type id `action_<name>` (the
existing `^[a-z][a-z0-9_]*$` check allows it, so no migration).

```json
{
  "schemaVersion": 2,
  "kind": "action",
  "id": "action_display_text",
  "version": 1,
  "name": "display_text",
  "label": "Display Text Response in Column",
  "description": "Show a text response in a column.",
  "branches": ["THEN", "ELSE"],
  "fields": [
    { "param": "then_text", "control": "text", "label": "Message" },
    {
      "param": "then_output_column",
      "control": "field_picker",
      "label": "Write to Column"
    },
    { "param": "then_text_separator", "control": "text", "label": "Separator" }
  ],
  "partials": {
    "english": "…THEN wording…",
    "elseEnglish": "…ELSE wording…",
    "formula": { "excel": "…", "sql": "…", "python": "…" },
    "qtest": "…"
  },
  "validation": [{ "builtIn": "action" }],
  "export": { "fileUtility": { "action": "display_text" } },
  "complete": ["then_text", "then_output_column"]
}
```

- **Fields** use the existing field controls, so the Action editor is the
  field renderer plus a kind picker. The three `atlasRenderThenActionBuilder`
  layers go. Kinds whose form needs a composite (calculation, string
  transform) place the `math` and `string_transform` composites with the
  `then_` prefix, which Phase 8 added to their helpers.
- **Partials** are the ones Phase 8 wrote, moved out of `if_then` and
  `else` without changing their text. A step type includes the selected
  kind's partial with a new helper, `{{action "english"}}` (`"elseEnglish"`,
  `"formula"`, `"qtest"`), which looks up the kind named by
  `param.then_action_type` (default `freeform`). An unknown kind renders the
  freeform partial, as today.
- **`complete`** lists the params a kind needs before the step has its own
  action. It replaces `completeStatementHasIndependentAction`'s per-kind
  rules and Audit Issues' `meaningfulAction`.
- **Features**: the `action` composite's `features` stay switches over the
  registered kinds. `controls.json` lists them from the catalog, and the
  palette test checks the catalog and `controls.json` agree.
- **Pinning** (decision B): a publication's `step_type_versions` map also
  records the action kind versions it used, under their `action_*` ids. A
  pinned `if_then` v3 or v4 keeps its own copied partials, so it is unaffected. The
  new step type versions that call `{{action}}` (below) render the pinned
  kind versions.

This replaces Phase 8 decision 1 for the action partials of new versions,
and Phase 8 decision 3 (decision 1 below).

### 2. Operator catalog

`app_config.logic_options` in the phrase catalog becomes the only list:

- `operators` is replaced by the full ordered list, each entry
  `{value, label, inverse, sets, meaning}`; `operator_sets` and
  `operator_meanings` are derived from it for the current readers.
- The ELSE inversion map (`07:437`), the import list and per-mode sets
  (`15j:69`, `15j:596`), the editor fallback (`15g:370`) and
  `PARAMETER_OPERATORS` read it. Legacy aliases (the 5018 bugfix) stay in
  their alias table.
- The engine exposes it (`ATLASStepTypes.conditions.operators()`) so the
  builder can list them.
- An operator whose `meaning` is one of the existing classes (`compare`,
  `text_match`, `blank`) needs no template change. A new class needs a new
  case in the `leaf` partials, which is a new definition version.

### 3. Capabilities from the definition

New runtime questions, answered from the definition:

| Question                  | Rule                                                                                                                               | Replaces                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `carriesConditions(step)` | The definition has a `condition_group` field, or is a legacy type with a stored condition (`else`, `filter_rows`, `flag_records`). | The three fixed lists.                       |
| `branches(step)`          | New definition key `branches: ["then", "else"]`. `if_then` declares both; a type without it has no THEN / ELSE children.           | `if_then` checks in the complete statements. |
| `inverse(step)`           | New key `inverse: true` on a type that branches and carries conditions. Turns on "Create or Open Linked Inverse".                  | `15e:716`, `15g:1297–1370`, `15g:3310`.      |
| `orderGroup(step)`        | From `export.scriptRole`: `source` 10, `join` and `union` 20, a step that creates columns (`column`) 30, everything else 40.       | `02-hierarchy.js:27` and `23:4318`.          |

The complete statements then treat any type that branches and carries
conditions as `if_then` does: its THEN children inherit its conditions,
and its ELSE children their opposite, through
`completeStatementConditionPartial`.

As built (5045), two rules changed:

- `orderGroup` is an optional definition key (10, 20, 30 or 40), not derived
  from `export.scriptRole`. The `scriptRole` rule would move `union_sources`,
  `split_field` and `format_field` steps to a new group and reorder saved
  audits.
- The bundled versions do not declare `branches`, `inverse` or `orderGroup`
  yet. `ATLASStepTypes.definitions.capabilities` answers for them from a
  legacy table by type id (`LEGACY_CAPABILITIES`), which also covers pinned
  older versions such as `if_then` v1, which has no Conditions field. `if_then`
  v5 (5050) declares the keys. A definition with `inverse: true` must also
  declare `branches` and a Conditions field.

### 4. New steps

- A composite may declare `defaults` in `controls.json`: one blank
  condition for `condition_group`, `then_action_type: "display"` for
  `action`. Fields may already set `default`.
- `atlasCreateRuleOfType` builds every new step from the definition and its
  composites' defaults. The `if_then` branch and the menu's built-in labels
  go; labels and order come from the definitions.
- Audit Issues "Add logic step" lists the registry's types (not source
  ones) and uses the same builder function. The reference step's child menu
  offers the types whose definitions set `referenceChild: true`.

### 5. Text import of Conditions and Action

`sentenceMatcher` gains two captures:

- `{{> conditionText}}` (or the replaced helper `conditionText`) captures the
  rest of the sentence up to `THEN` and parses it with the existing
  `atlasImportParseConditions`.
- `{{action "english"}}` captures the text after `THEN` and parses it with
  `atlasImportParseThenAction`, limited to the kinds the field's `features`
  allow.

Both parsers move behind a small interface on `ATLASStepTypeRuntime`
(`importConditions`, `importAction`) so `js/13a` does not reach into `js/15j`
globals. A builder type that writes `{{> conditionText}} THEN {{action
"english"}}` imports like IF / THEN. The bundled types keep their parsers.

### 6. Clean-up and inline fixes as settings

- Field `normalize`: a named handler from `js/13-step-type-library.js`
  (`split_field_params`, `create_column_structured`, `format_field_params`,
  `exclude_scope`), run by the runtime. `15g:3778–3782` and `14:1721` go.
- Validation rules gain `param`, `message` and `fix` (`{sourceParam,
title}` or `{choices}`), so the per-type field problems in
  `23:1747–1889` become rules on their definitions, and Audit Issues draws
  every inline fix from the rule.

### Definitions and versions

| Definition                                                                                                                                                                            | Now        | New  | What changes                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---- | ------------------------------------------------------------------------------------ |
| `action_display`, `action_do_not_display`, `action_display_text`, `action_set_column_value`, `action_set_column_calculation`, `action_set_column_string_transform`, `action_freeform` | —          | 1    | New, with the partials moved from `if_then` v4 and `else` v4.                        |
| `if_then`                                                                                                                                                                             | 4          | 5    | `{{action}}` instead of the action partials; `branches`, `inverse`; normalize names. |
| `else`                                                                                                                                                                                | 4          | 5    | `{{action "elseEnglish"}}` and the formulas through `{{action}}`.                    |
| `filter_rows`, `flag_records`                                                                                                                                                         | 4, 5       | 5, 6 | Their display and display-text partials through `{{action}}`.                        |
| `create_column`, `split_field`, `format_field`, `remove_duplicates`                                                                                                                   | 3, 4, 4, 2 | +1   | `normalize` and the inline-fix rules only; templates unchanged.                      |

Released files are never edited; `released-step-type-hashes.json` gains the
new versions. Pinned fixtures for `if_then` v3 and v4, `else` v3 and v4,
`filter_rows` v3 and v4 and `flag_records` v4 and v5 prove the old versions
still render.

### Snapshot strategy

The Phase 8 rules hold: the 14 snapshot files, the condition and action
matrix, the pinned test and the preview-scripts test stay identical without
`npm run snapshots:record`. Added:

- A **builder-type matrix**: a test definition that places Conditions and
  Action and declares `branches` and `inverse`, run through the same matrix
  steps. Its English, formulas, complete statements and qTest must equal
  `if_then`'s, and its sentence must import.
- An **action catalog test**: each kind's `complete`, fields and partials
  against the matrix, and `controls.json` features against the catalog.
- Playwright: the THEN and ELSE editors for every kind, a new step of each
  type, and Audit Issues "Add logic step".

### Branches

| Branch                                                  | Work                                                                                                                                                                             | Engine |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `feature-5037-condition-action-catalogs-plan`           | This plan (Phases 9 and 10).                                                                                                                                                     | —      |
| `feature-5045-step-capabilities`                        | `carriesConditions`, `branches`, `inverse`, `orderGroup`; the fixed lists and IF-only checks read them; `if_then` v5 declares `branches` and `inverse`; the builder-type matrix. | 1.18.0 |
| `feature-5046-new-step-defaults`                        | Composite `defaults`, one new-step builder, the menus and Audit Issues "Add logic step" from the registry.                                                                       | 1.18.1 |
| `feature-5047-operator-catalog`                         | The full operator list in the phrase catalog and every reader moved to it.                                                                                                       | 1.18.2 |
| `feature-5048-action-kind-registry`                     | `kind: "action"` in the schema and registry, the `{{action}}` helper, pinning of action kind versions, and the seven kinds as definitions (partials moved, not changed).         | 1.19.0 |
| `feature-5049-action-editor-from-fields`                | The Action editor drawn from the kind's fields; delete the three builder layers, the parameter clean-up per kind and the string-transform wrapper.                               | 1.19.1 |
| `feature-5050-action-definitions`                       | `if_then` v5, `else` v5, `filter_rows` v5 and `flag_records` v6 through `{{action}}`; `complete` replaces the per-kind checks; pinned fixtures.                                  | 1.19.2 |
| `feature-5051-condition-action-text-import`             | The two `sentenceMatcher` captures and `importConditions` / `importAction`.                                                                                                      | 1.20.0 |
| `feature-5052-normalize-and-fixes`                      | Field `normalize` and validation `param` / `message` / `fix`; the per-type code in `15g`, `14` and `23` goes.                                                                    | 1.20.1 |
| `feature-5053-file-utility-action-kinds` (File Utility) | Contract v3; action handlers dispatch on the kind's `export.fileUtility.action`; operators from the generated contract list.                                                     | —      |
| `feature-5054-builder-catalogs` (builder repository)    | Bump `atlas-engine.lock`; show action kinds and operators in the palette help, `branches` / `inverse` in Basics, and an import check in Tests.                                   | —      |

All of these follow Phase 9. 5045–5047 are independent of each other.
5048–5050 form one stack. 5051 needs 5048. 5052 can go any time but touches
`js/23`. 5053 pairs with 5047 and 5050 (contract v3, ATLAS Align first). 5054
goes last.

Under the batching rule in "Phases", 5045 to 5052 land as one ATLAS Align pull
request on `feature-5045-condition-action-catalogs`, one commit each, in the
order above, and the engine goes from 1.17.1 to 1.18.0 once for the whole pull
request; the Engine column is the order the changes come in, not separate
releases. If it grows too large to review, it splits after 5047 (capabilities,
defaults and operators; then the action kinds). Then 5053 is one File Utility
pull request and 5054 one builder pull request. This plan change is the first
commit on that branch.

### Risks

- **Audit Issues has uncommitted work.** The main checkout has changes in
  `js/23-atlas-audit-issues.js` and its test. 5046, 5050 and 5052 touch that
  file, so that work should land first.
- **Action partial moves.** Moving partials into kinds must not change a
  character of output. 5048 moves them; 5050 switches the types over. The
  matrix and pinned tests guard both.
- **Pin maps grow.** Publications made before 5048 have no `action_*`
  entries. They render with the latest kind versions, which match the
  pre-5048 copies exactly, so their output does not change.
- **Kinds in the library.** Action kind rows sit in the step type table. The
  library, picker, export and builder filter them by `kind`, or they would
  show as step types.
- **Text import ambiguity.** A definition sentence and a bundled parser can
  both read a sentence. The bundled parser keeps priority, as today.
- **File Utility.** A new action kind can't run in File Utility until 5053
  gives it a handler; the readiness check says so instead of guessing.

### Decisions

1. **Shared action kinds.** Action kinds are versioned definitions shared by
   the step types that use them (section 1), which ends the copies.
2. **Builder editing of kinds and operators.** This phase only shows them in
   the builder; adding action kinds or operators in the builder is a later
   phase, because a kind's form and formulas touch every type that uses it.
3. **File Utility.** Settled by Phase 9, which comes first; 5053 covers
   action kinds and operators.
4. **`else`, `filter_rows` and `flag_records`.** They stay hidden legacy
   types and get new versions only for `{{action}}`, with no `branches` or
   `inverse`.
