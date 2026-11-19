# How to add a step type

A step type is a JSON file in `catalogs/step-types/`. There is no per-type
code to write for the usual case: the guided editor, English, Developer Logic,
the SQL and Python scripts, the qTest rows, Audit Issues, text import and
File Utility readiness all read the definition. This guide shows two ways to
add one and says what still needs code.

Background: [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) ("Step type engine")
describes how the engine works, and
[DYNAMIC_STEP_TYPE_BUILDER_PLAN.md](DYNAMIC_STEP_TYPE_BUILDER_PLAN.md) holds
the design and the as-built notes.

## Route 1: build it in the Step Type Builder (normal)

The Step Type Builder is a separate app
([JonahAngell/atlas-step-type-builder](https://github.com/JonahAngell/atlas-step-type-builder)).
Only users with the `atlas-align-admin` role can edit and publish.

1. Open the builder, choose New type, and fill in the Form, Basics, Text,
   Formulas, Export, Rules, Partials and Tests tabs. The preview frame shows
   ATLAS's own editor, English, Developer Logic, Excel, SQL, Python and qTest
   output for a sample step.
2. Review and publish. Publishing writes a new immutable version to the
   `atlas_step_type_definitions` table with origin `builder`. ATLAS Align shows
   it to users from then on, with no deploy. That version lives only in that
   environment's database until you commit it (step 3).
3. Export. Choose Export, pick the types, and download the `.zip`. Unzip it at
   the **repository root** of ATLAS Align:

   ```bash
   unzip -o <path to the downloaded .zip>
   ```

   It puts these files in place: `catalogs/step-types/<id>.json`, a regenerated
   `catalogs/step-types/manifest.json`, `test/fixtures/step-types/<id>.cases.json`
   (the type's test cases; the folder is created if it is missing) and
   `STEP_TYPES_EXPORT.md`, which lists what changed and the next steps.

4. Rebuild the generated files and run the tests:

   ```bash
   npm run step-types:manifest
   npm test
   ```

5. Add each new `id@version` to `test/fixtures/released-step-type-hashes.json`
   with the hash `step-types:manifest` wrote in
   `catalogs/step-types/manifest.json`. `test/step-type-released-versions.test.js`
   fails until you do, and it fails again if a released file's content later
   changes.
6. Open a pull request. On the next start, each environment imports any version
   its database lacks. A version the builder already published has the same
   content hash, so the import skips it; a different body under the same
   version is rejected and logged.

Check the pull request for files you did not expect. If the export changed a
version that was already released, publish it as a new version instead.

## Route 2: write the definition by hand

Use this for a change the builder cannot make, or to review what the builder
wrote. Everything below is what the builder produces.

### The worked example

`fill_blank` replaces blank values in one field with fixed text or zero. It has
two subtypes, three fields, English, formulas for Excel, SQL and Python, qTest
outcomes, validation and text import. Save it as
`catalogs/step-types/fill_blank.json`. This is a documentation example, not a
type that ships.

```json
{
  "schemaVersion": 1,
  "id": "fill_blank",
  "version": 1,
  "label": "Fill Blank Values",
  "description": "Replace blank values in one field with fixed text.",
  "category": "transform",
  "order": 65,
  "status": "active",
  "legacyType": "transform",
  "aliases": { "step_type": [], "type": [] },
  "migrations": [
    {
      "op": "default",
      "param": "source_file",
      "when": { "stepField": "source", "notBlank": true },
      "valueFrom": ["step.source"]
    },
    { "op": "default", "param": "fill_mode", "value": "text" }
  ],
  "subtypes": {
    "param": "fill_mode",
    "label": "Fill with",
    "control": "cards",
    "default": "text",
    "options": [
      {
        "value": "text",
        "label": "Text",
        "description": "Write the same text in every blank."
      },
      {
        "value": "zero",
        "label": "Zero",
        "description": "Write 0 in every blank."
      }
    ]
  },
  "fields": [
    { "param": "source_file", "control": "hidden" },
    {
      "param": "source_alias",
      "control": "hidden",
      "valueTemplate": "{{sourceAliasFor param.source_file}}"
    },
    {
      "param": "field_name",
      "control": "field_picker",
      "label": "Field",
      "placeholder": "Select field",
      "sourceParam": "source_file",
      "required": true
    },
    {
      "param": "fill_text",
      "control": "text",
      "label": "Text to write",
      "visibleWhen": { "param": "fill_mode", "equals": "text" },
      "required": true
    }
  ],
  "outputs": { "assigns": "{{param.field_name}}" },
  "english": {
    "bySubtype": {
      "text": "Replace blank values in {{field param.source_file param.field_name}} with {{quote param.fill_text}}.",
      "zero": "Replace blank values in {{field param.source_file param.field_name}} with 0."
    }
  },
  "formulas": {
    "shape": "assignment",
    "target": "{{trim param.field_name}}",
    "bySubtype": {
      "text": {
        "excel": "IF({{field param.source_file param.field_name alias=param.source_alias}}=\"\", {{quote param.fill_text}}, {{field param.source_file param.field_name alias=param.source_alias}})",
        "sql": "COALESCE(NULLIF({{field param.source_file param.field_name alias=param.source_alias}}, ''), {{quote param.fill_text}})",
        "python": "{{field param.source_file param.field_name alias=param.source_alias}}.replace(\"\", pd.NA).fillna({{quote param.fill_text}})"
      },
      "zero": {
        "excel": "IF({{field param.source_file param.field_name alias=param.source_alias}}=\"\", 0, {{field param.source_file param.field_name alias=param.source_alias}})",
        "sql": "COALESCE(NULLIF({{field param.source_file param.field_name alias=param.source_alias}}, ''), 0)",
        "python": "{{field param.source_file param.field_name alias=param.source_alias}}.replace(\"\", pd.NA).fillna(0)"
      }
    }
  },
  "autoNotes": null,
  "export": {
    "scriptRole": "column",
    "qtest": {
      "section": "D",
      "testType": "Data Validation",
      "outcomes": {
        "atlas": "Blank {{tableColumn param.source_file param.source_alias param.field_name}} values display as the fill value.",
        "source": "Only the blank source values changed; every other value matches the source."
      }
    }
  },
  "validation": [
    {
      "id": "field_required",
      "when": "always",
      "require": "field_name",
      "severity": "critical",
      "message": "Choose the field whose blanks are filled.",
      "fix": { "sourceParam": "source_file", "title": "Choose field" }
    },
    {
      "id": "fill_text_required",
      "when": { "param": "fill_mode", "equals": "text" },
      "require": "fill_text",
      "severity": "critical",
      "message": "Enter the text that replaces blank values.",
      "fix": { "title": "Enter fill text", "label": "Text to write" }
    }
  ],
  "textImport": { "fromEnglish": true },
  "tests": [
    {
      "name": "fill with text",
      "params": {
        "source_file": "WD_Workers",
        "source_alias": "wd",
        "field_name": "Status",
        "fill_mode": "text",
        "fill_text": "Unknown"
      },
      "expect": {
        "english": "Replace blank values in file \"wd\" column \"Status\" with \"Unknown\"."
      }
    }
  ]
}
```

### Top-level keys

| Key                                                   | What it does                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `schemaVersion`                                       | `1`, or `2` when the definition has `partials`. The engine reads versions 1 and 2.                                       |
| `kind`                                                | `step` (the default) or `action`. See "Action kinds".                                                                    |
| `id`                                                  | The backend name, stored as `step.step_type`. Lowercase letters, digits and underscores. Never renamed.                  |
| `version`                                             | Integer. A released version is never edited (see "New versions").                                                        |
| `label`, `description`, `category`, `order`           | The picker label, help text, group and sort position.                                                                    |
| `status`                                              | `active` shows in the picker. `legacy` is offered only to steps that already use it.                                     |
| `legacyType`                                          | Fills `step.type` for older readers.                                                                                     |
| `aliases`                                             | Other `step_type` and `type` values that mean this type.                                                                 |
| `migrations`                                          | Rules that turn an older saved step into this version's shape. See "New versions".                                       |
| `subtypes`                                            | The param that holds the subtype and its options. Option values are the stored strings.                                  |
| `fields`                                              | The editor form, as data. See "Fields and controls".                                                                     |
| `editorFrame`, `block`                                | Used by the types that came with ATLAS Align. The builder does not offer `editorFrame`. A new type does not need either. |
| `outputs`                                             | What the step assigns or creates (`assigns`, `creates`). Templates.                                                      |
| `branches`, `inverse`, `orderGroup`, `referenceChild` | Capabilities. See "Conditions, branches and ordering".                                                                   |
| `english`, `autoNotes`                                | Template sets: `default`, `bySubtype`, `variants`.                                                                       |
| `formulas`                                            | Developer Logic: `shape`, `target`, `default` or `bySubtype` (Excel, SQL, Python), `notes`, `variants`, `fallback`.      |
| `export`                                              | `scriptRole`, `qtest`, `fileUtility`, `rules`.                                                                           |
| `partials`                                            | Named templates for `{{> name}}`. Needs `schemaVersion: 2`.                                                              |
| `validation`                                          | Audit Issues rules.                                                                                                      |
| `textImport`                                          | `fromEnglish`, or a named `handler`.                                                                                     |
| `tests`                                               | Sample steps with expected output.                                                                                       |

`catalogs/step-types/schema.json` is the full list and the limits. A step type
needs `id`, `version`, `label`, `status`, `fields`, `english`, `formulas` and
`export.scriptRole`.

### Fields and controls

Each entry in `fields` has a `param` (where the value is stored in
`step.params`), a `control` and the control's settings. The control palette is
`catalogs/step-types/controls.json`. For each control it lists the field
properties it reads, the features it can switch off and whether it is
`available` or `planned`. A property the control does not read is an error, and
so is a control the runtime cannot draw.

| Control                                                                                                          | Use                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `source_picker`, `field_picker`                                                                                  | Pick a source file or a field. A `field_picker` names its `sourceParam`.                                            |
| `choice`                                                                                                         | One of several options, drawn as `cards`, `chips`, `segment`, `list` or `select`.                                   |
| `text`, `textarea`, `whole_number`, `toggle`                                                                     | Plain inputs.                                                                                                       |
| `hidden`                                                                                                         | Stores a param with no input. `valueTemplate` fills it while blank.                                                 |
| `hint`, `callout`, `readout`                                                                                     | Help text, an English-template message, a fixed read-only value.                                                    |
| `sort_keys`, `duplicate_keys`, `math`, `string_transform`, `join_type`, `join_keys`, `condition_group`, `action` | Composite controls drawn by the app's own editors. You can place and show or hide them, but not change their parts. |
| `block`                                                                                                          | A behavior block (see "What still needs code").                                                                     |

Settings you will use most: `label`, `placeholder`, `help`, `required`,
`default`, `visibleWhen` and `enabledWhen` (conditions), `sourceParam`,
`layout`, `options`, `optionsFrom`, `features` and `normalize`.

A condition is `{param|stepField, equals|equalsIgnoreCase|notEquals|in|blank|notBlank|positiveWholeNumber}`,
`{all: [...]}`, `{any: [...]}` or `{not: condition}`.

### Templates

English, notes, formulas, qTest outcomes, headings and `valueTemplate` are
templates. A template is parsed, never run: it can only read the step's data
and call the fixed helpers. Output is text.

- Values: `{{param.x}}`, `{{subtype}}`, `{{stepNumber}}`, `{{parent.param.x}}`.
- Logic: `{{#if}}…{{else if}}…{{else}}…{{/if}}`, `{{#unless}}`, `{{#switch}}{{#case}}{{#default}}`,
  `{{#each list separator=", "}}` with `@index`, `@first`, `@last`.
- Built-in helpers: `eq ne in not and or blank present gt lt default lower upper trim concat count join replace include`.
- App helpers, from `js/13a-step-type-runtime.js` and `js/13-step-type-library.js`:
  `field` (a source column in the output's own style), `column`, `quote`,
  `number`, `source`, `alias`, `tableColumn`, `phrase` (catalog wording), `placeholder` and more.
  A definition that names a helper that does not exist is rejected.
- `{{> name}}` includes a partial; `{{include "name"}}` gives its text as a value.

Each output has its own template, and the output decides what a helper writes:

| Output          | Where                                   | Notes                                                                                                                                                                                      |
| --------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| English         | `english`                               | The Analyst Logic sentence. `field` writes `file "wd" column "Status"`.                                                                                                                    |
| Developer Logic | `formulas` plus `autoNotes`             | Shown as `Excel:`, `SQL Server:` and `Python (pandas):` lines. `autoNotes` are the automatic notes; use `null` for none.                                                                   |
| Excel           | `formulas.default.excel` or `bySubtype` | Excel 365, `[@[Field]]` references.                                                                                                                                                        |
| SQL             | `formulas.….sql`                        | SQL Server. `field` adds the alias only when the field name is ambiguous.                                                                                                                  |
| Python          | `formulas.….python`                     | pandas, `df["Field"]` and `sources["alias"]`.                                                                                                                                              |
| qTest           | `export.qtest`                          | `section`, `testType`, and `outcomes.atlas` and `outcomes.source` templates. A type with an Action field takes its outcome from the action kind; otherwise `export.qtest.action` names it. |

`formulas.shape` tells the SQL and Python script builders where the step goes:

| Shape        | Use                                                                |
| ------------ | ------------------------------------------------------------------ |
| `assignment` | Rewrites a column; `target` names it. The SQL gets `AS [Target]`.  |
| `expression` | A value expression.                                                |
| `filter`     | A row test. SQL starts with `WHERE`.                               |
| `frame`      | A statement that replaces the dataframe (sort, deduplicate, join). |
| `none`       | Nothing.                                                           |

`export.scriptRole` is one of `source`, `join`, `union`, `column`, `filter`,
`sort`, `dedupe`, `condition`, `else`, `flag` or `none`. It chooses which
script assembler places the step. A row-level role whose SQL cannot be placed
gets an `export_shape` warning when you publish or load; the warning never
blocks.

### Partials and schema version 2

A definition with `partials` sets `schemaVersion: 2`. A partial is one template
or an object with a template per format (`english`, `plain`, `excel`, `sql`,
`python`, `default`). The same wording can then be written once:

```json
"partials": {
  "target": "{{field param.source_file param.field_name alias=param.source_alias}}",
  "ifBlank": {
    "excel": "IF({{> target}}=\"\", {{quote param.fill_text}}, {{> target}})",
    "sql": "COALESCE(NULLIF({{> target}}, ''), {{quote param.fill_text}})"
  }
}
```

Reference them with `{{> target}}` in any template. `if_then.json` is the
largest example: its partials write the condition wording and formulas that the
other condition types reuse.

### Validation

`validation` rules feed Audit Issues:

- `{id, when, require, severity, message, fix}` reports a blank param.
  `when` is `"always"` or a condition. `severity` is `warning` or `critical`.
  `fix` offers an inline fix: a field picker (`sourceParam`), a choice list
  (`choices`) or a text box (`label`).
- `{check: condition, ...}` reports when a condition holds.
- `{builtIn: "<name>"}` turns on one of the app's existing checks:
  `conditions`, `fieldRelationships`, `action`, `join`, `createdColumns`,
  `sourceMath`, `thenMath`, `stringTransform` or `thenStringTransform`.
- `{problems: {check, match}}` reads the messages of a named check in the
  library (`problemChecks`).

### Text import

`"textImport": {"fromEnglish": true}` lets "Import from text" read the type's
own English back. The reader is derived from the template, so the template may
contain only literal text, `{{param.x}}`, `quote`, `column`, `number`,
`source`, `field` (two params), `{{> conditionText}}` and `{{action "english"}}`.
Any other helper or a block makes the type unimportable: set
`fromEnglish: false`, or name a `handler`. A type that uses `{{> conditionText}}`
and `{{action "english"}}` needs words in front that do not start with `IF`
(for example `Review {{> conditionText}} THEN {{action "english"}}`), because a
sentence that starts with `IF` goes to the IF / THEN reader first. The sentence
must also be unique among types.

### export.fileUtility

`export.fileUtility` tells [File Utility](#file-utility) how to run the type:

```json
"fileUtility": { "compiler": "sort_records", "status": "supported" }
```

`compiler` must be one of the `compilers` in
`catalogs/file-utility/executable-steps.json`. `status` is `supported` (the
default) or `partial`; `when` says in words which cases a partial type runs in.
`params` maps a compiler's param names to this type's, for a type whose fields
are named differently. Without the block the type cannot run in File Utility,
and ATLAS's readiness check says so. The example above has no block for that
reason: there is no compiler for it.

### Tests

Put sample steps in the definition's `tests` array: `name`, `params`, optional
`step` and `parent`, and `expect` with any of `english`, `autoNotes`, `excel`,
`sql`, `python`, `issues`. The builder runs them while you edit. In ATLAS
Align, the definition's tests feed the export-shape warnings; the engine does
not compare their outputs in `npm test`. The checks that guard a definition in
the repository are:

| Path                                                           | What it guards                                                                                                                                                                                                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/fixtures/step-type-snapshots/` and `synthetic-audits.js` | Every step in `audits/*.json` and the synthetic audits renders the same English, notes, Developer Logic, editor markup, scripts and qTest. Rewrite with `npm run snapshots:record` and review the diff. Add a synthetic audit step for the new type. |
| `test/fixtures/condition-action-matrix/`                       | The condition and action matrix. Rewrite with `npm run matrix:record`.                                                                                                                                                                               |
| `test/fixtures/step-types-pinned/`                             | Old definition versions as stored in Postgres, rendered like the latest. Add the previous version here when a new version changes output.                                                                                                            |
| `test/fixtures/released-step-type-hashes.json`                 | The hash each `id@version` was released with.                                                                                                                                                                                                        |
| `test/step-type-runtime.test.js`                               | Registers sample types next to the bundled ones; the pattern to copy for a test of your own.                                                                                                                                                         |

`test/fixtures/step-types/<id>.cases.json` is where the builder's export puts a
type's test cases. The folder does not exist in the repository until an export
adds it, and no ATLAS Align test reads those files today.

### Rebuild and check

```bash
npm run step-types:manifest
```

This rewrites `catalogs/step-types/manifest.json` (the id, version and content
hash of every file), `js/step-types/definitions.generated.js` (the bundle the
browser starts on), `js/step-types/operators.generated.js` and the
`operators` of the File Utility contract. `npm run step-types:manifest -- --check`
fails when any of them is stale. Then:

```bash
npm test
```

`npm run check` syntax-checks the scripts. Add the new `id@version` to
`test/fixtures/released-step-type-hashes.json`.

A file whose name does not match its `id` and `version` is refused: use
`<id>.json` for the version you ship, or `<id>.v<version>.json` for one you
keep next to it.

### New versions and migrations

A released version never changes: the server stores each `(id, version)` once
and rejects a file whose content differs. To change a type, raise `version`, edit
the file, record the old version for the pinned tests and add to `migrations`
whatever turns a step saved under the old shape into the new one.

- Saved steps keep their param names and values. Do not rename a stored param
  or option value; hide an option with `hidden` instead.
- Migration ops: `setStepType`, `default`, `set`, `rename`, `remove`, `mapValue`
  and `handler` (a named function in `js/13-step-type-library.js`). `when` gates
  a rule; `valueFrom` reads `step.x` or `param.x`.
- Publications record the versions they were made with
  (`atlas_audit_publications.step_type_versions`). Published and locked audits
  render with those versions; editable audits use the latest published one.
  A new version must render older pinned steps correctly.
- A type with no `branches` change, or one converted from a block to fields,
  keeps the old block registered as a shim in `replacedBlocks`
  (`js/13-step-type-library.js`) so older versions still render.

## Action kinds

What a THEN or ELSE branch does is itself a definition with `"kind": "action"`
in `catalogs/step-types/actions/`. Its `id` is `action_<name>` and `name` is the
`then_action_type` value it is chosen by. It has `partials` (an `english` one
is required; also `elseEnglish`, `formula`, `elseFormula`, `formulaNote`,
`actionTarget`, `actionExpression`, `qtest` and others), a `picker` entry for
the Action Type list and its own `export.qtest.action` and
`export.fileUtility.action`.

A step type with a Conditions field (`condition_group`) and an Action field
(`action`) includes the chosen kind with the `{{action "part"}}` helper:

```text
{{action "english"}}             the action in words
{{action "formula"}}             the formula, in the output's own format
{{action "qtest" part="kind"}}   one part of the qTest outcome
```

So a new type built on `condition_group` and `action` copies `if_then.json`,
changes its words, and gets every action kind. To add an action kind, copy the
closest file in `catalogs/step-types/actions/`, set `id`, `name` and `version`,
and run `npm run step-types:manifest`. If File Utility must run it, it needs a
handler (see below).

## Conditions, branches and ordering

Four optional keys change how a step behaves in the Logic Builder:

| Key                          | Effect                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `branches: ["then", "else"]` | The step can have THEN and ELSE children.                                                                    |
| `inverse: true`              | Offers Create or Open Linked Inverse. Needs `branches` and a `condition_group` field.                        |
| `orderGroup`                 | Where the step sorts among siblings: 10 sources, 20 joins, 30 created columns, 40 everything else (default). |
| `referenceChild: true`       | The step is offered in a Reference step's menu.                                                              |

Whether a step carries conditions is not a key: it is true when the definition
has a `condition_group` field (or is one of the legacy condition types). The
condition operators come from one catalog, `app_config.logic_options.operator_catalog`
in `catalogs/logic_phrase_catalog.json`. Edit it there and run
`npm run step-types:manifest` to regenerate `js/step-types/operators.generated.js`
and the contract's operator lists.

## What still needs code

A definition covers a new type as long as templates, the control palette and the
existing helpers can express it. These need a code change in ATLAS Align first;
after that, any definition can use them.

| Need                                                      | Where                                                                                                                                                                                   |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A new template helper (for example a new kind of quoting) | `js/13-step-type-library.js` (`helpers`), or `TEMPLATE_HELPERS` in `js/13a-step-type-runtime.js`.                                                                                       |
| A new migration handler or `normalize` clean-up           | `handlers` in `js/13-step-type-library.js`.                                                                                                                                             |
| A new problem check for validation                        | `problemChecks` in the same file.                                                                                                                                                       |
| A new editor control or block                             | `controls.json`, the schema's control list, `FIELD_CONTROLS` in `js/13a-step-type-runtime.js` and the editor code. `test/step-type-field-controls.test.js` requires all three to agree. |
| A new script role                                         | The schema's `scriptRole` list and the SQL and Python builders in `js/12b-code-export.js`.                                                                                              |
| A new condition operator                                  | The operator catalog (above), plus File Utility if it must run.                                                                                                                         |

Any change to a file in `js/step-types/engine-manifest.json` also raises
`engineVersion` there, because the builder pins an ATLAS Align revision and
copies those files.

## File Utility

[File Utility](https://github.com/JonahAngell/audit-file-utility) runs published
audits. It reads step type definitions and the publication's pinned versions
from the shared database and decides what runs from each definition's
`export.fileUtility` block, checked against the contract
`catalogs/file-utility/executable-steps.json` (contract version 3). The
contract is kept identical in both repositories and each has a test for it.

| Need                                    | Where                                                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| A type that uses an existing compiler   | Only `export.fileUtility` in the definition.                                                              |
| A new compiler (new row-level behavior) | A `compilers` entry in the contract, and the compiler in File Utility's Python. Change both repositories. |
| A new action kind for File Utility      | A `thenActions` entry in the contract and a handler in File Utility.                                      |
| A new operator                          | The operator catalog in ATLAS Align; File Utility reads the generated `operators` map.                    |

ATLAS Align's readiness check (`js/22a-file-utility-readiness.js`) mirrors File
Utility's checks from the same contract, so a type's block also decides whether
Readiness & Review reports it as runnable.

## Checklist

- [ ] `catalogs/step-types/<id>.json` passes `npm run step-types:manifest`
- [ ] `npm test` passes
- [ ] `id@version` added to `test/fixtures/released-step-type-hashes.json`
- [ ] Previous version added to `test/fixtures/step-types-pinned/` if output changed
- [ ] `export.fileUtility` set, or the type is meant not to run in File Utility
- [ ] Snapshots and matrix re-recorded only for intended changes
- [ ] `engineVersion` raised if an engine script changed
