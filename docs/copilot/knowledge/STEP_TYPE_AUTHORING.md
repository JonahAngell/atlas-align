# Writing a Step Type for the Step Type Builder

How to write a new step type definition as a `.json` file that an admin imports into the **Step Type Builder**, tests there and publishes to ATLAS Align. Use it only after the user has agreed that no existing step type fits (see the step type selection skill).

Lists of what a definition may use (controls, template helpers, blocks, script roles, File Utility compilers, operators, action kinds) are in `STEP_TYPE_REFERENCE.md`. Use only names from those lists.

---

## 1. What a step type is

A step type is data, not code. ATLAS Align draws its editor from the `fields`, writes its English, Developer Logic, Excel, SQL and Python from the templates, builds its qTest row from `export.qtest`, checks it with `validation`, and File Utility runs it with the compiler named in `export.fileUtility`. Templates are only filled in, never run as code.

A published type is versioned. Editing it later in the builder makes a new version; audits keep the version they were published with.

## 2. The file the builder imports

The builder's **Import** reads one definition (a JSON object) or a list of them (a JSON array), and turns each into a **draft**, after a dry run that shows what it will create. Nothing reaches ATLAS Align until an admin (role `atlas-align-admin`) reviews and publishes the draft.

Name the file after the type, for example `pad_digits.json`.

## 3. Required keys

| Key             | Rules                                                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion` | `1`. Use `2` only when the definition has `partials`.                                                                                                                               |
| `id`            | Lowercase letters, digits and `_`, starting with a letter, at most 64 characters. It becomes the audit's `step_type`. Never reuse a built-in or SharePoint id for a different type. |
| `version`       | `1` for a new type. For a change to a published type, the published version plus 1.                                                                                                 |
| `label`         | The name analysts see, in title case, for example `Pad With Zeros`.                                                                                                                 |
| `status`        | `active`.                                                                                                                                                                           |
| `fields`        | The editor's controls, in order (Section 4).                                                                                                                                        |

Strongly recommended: `description` (one sentence), `category` (`source`, `combine`, `logic`, `column` or `transform`, like the built-in types), `order` (position in the step menu), `legacyType` (the audit's `type`: `source`, `join`, `if`, `create` or `transform`), `english`, `formulas`, `export` and `tests`.

## 4. Fields

Each field is one control that reads and writes one step param.

| Key             | Rules                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| `param`         | The step param, lowercase with `_`. Never rename it once audits use it.                                 |
| `control`       | One control from `STEP_TYPE_REFERENCE.md` Section 5.                                                    |
| `label`         | Visible label.                                                                                          |
| `help`          | Hint under the control.                                                                                 |
| `options`       | For `choice`: `[{ "value": "...", "label": "...", "description": "..." }]`. Store plain, stable values. |
| `default`       | Value for a new step.                                                                                   |
| `required`      | `true` when the step is incomplete without it.                                                          |
| `sourceParam`   | For `field_picker`: the param holding the field's source (usually `source_file`).                       |
| `valueTemplate` | For `hidden` and others: the value used while the param is blank, built from a template.                |
| `visibleWhen`   | `{ "param": "x", "equals": "y" }`: show the control only in some cases.                                 |

Rules:

- A type that acts on one source has `source_file` (`hidden`) and `source_alias` (`hidden`, `valueTemplate: "{{sourceAliasFor param.source_file}}"`), and a `field_picker` with `sourceParam: "source_file"`.
- To run on File Utility through an existing compiler, give the params that compiler reads the same names the built-in type uses (see the built-in type's params in the reference), or map them with `export.fileUtility.params` (`{ "compilerParam": "yourParam" }`).
- A logic type uses one `condition_group` field (param `conditions_json`) and one `action` field (param `then_action_type`), and sets `branches: ["then", "else"]`; `inverse: true` offers a linked ELSE. Base it on `if_then` and ask the user why IF / THEN itself doesn't fit.

## 5. Templates

Templates use `{{ }}`: `{{param.field_name}}` inserts a param, `{{helper arg …}}` calls a helper from the reference, `{{#if x}}…{{else}}…{{/if}}`, `{{#switch x}}{{#case "a"}}…{{/case}}{{#default}}…{{/default}}{{/switch}}` and `{{#each list}}…{{/each}}` add logic. Useful helpers:

| Helper                                                                  | Gives                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------- |
| `{{tableColumn param.source_file param.source_alias param.field_name}}` | `file "sap.hr" column "persno"` in English        |
| `{{field param.source_file param.field_name alias=param.source_alias}}` | The column reference in a formula                 |
| `{{quote x}}`                                                           | `x` in double quotes                              |
| `{{default x "fallback"}}`, `{{trim x}}`                                | A fallback for a blank value; trimmed text        |
| `{{action "english"}}`                                                  | The step's action kind wording (logic types only) |

| Key         | What it holds                                                                                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `english`   | `{ "default": "…" }`: one sentence, ending with a period, in the same style as the built-in types (`Format file "x" column "y" as …`). This is the Requirements Preview text. |
| `formulas`  | `shape` (`expression`, `assignment`, `filter`, `frame` or `none`), `target` for an assignment, and `default` with `excel`, `sql` and `python` templates.                      |
| `autoNotes` | `null`, or a template for the automatic manual note.                                                                                                                          |

## 6. Export, import and checks

| Key                      | Rules                                                                                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `export.scriptRole`      | Required. Where the step goes in the SQL and Python scripts: one of the script roles in the reference (`column` for a column change, `filter`, `sort`, `dedupe`, `condition` and so on).                                                                   |
| `export.fileUtility`     | `{ "compiler": "<a compiler from the reference>" }`, plus `params` mapping if names differ, and `when` for limits. Leave it out only when no compiler fits; then tell the user File Utility can't run audits that use the type until a developer adds one. |
| `export.qtest`           | `section`, `testType` and `outcomes.atlas` / `outcomes.source`: the two expected outcomes on the qTest row.                                                                                                                                                |
| `textImport.fromEnglish` | `true` lets ATLAS read the English sentence back into a step when a user pastes logic text. Keep the sentence plain (params in quotes) when you turn it on.                                                                                                |
| `validation`             | Optional checks, `[{ "id": "...", "severity": "critical", "message": "...", "param": "..." }]`, or `{ "builtIn": "conditions" }` style rules for logic types.                                                                                              |
| `tests`                  | Test cases the builder runs: `[{ "name": "...", "params": { ... }, "expect": { "english": "..." } }]`. `expect` may also hold `excel`, `sql` and `python`. Add at least one per mode.                                                                      |

Leave out `migrations`, `aliases`, `partials`, `editorFrame`, `subtypes`, `block`, `orderGroup` and `referenceChild` unless the user's developer asks for them; the builder can add them.

## 7. A complete example

A narrow type that pads short whole numbers with zeros, run in File Utility by the existing `format_field` compiler (which reads the hidden `format` text):

```json
{
  "schemaVersion": 1,
  "id": "pad_digits",
  "version": 1,
  "label": "Pad With Zeros",
  "description": "Put zeros in front of short whole numbers so every value has the same number of digits.",
  "category": "transform",
  "order": 75,
  "status": "active",
  "legacyType": "transform",
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
      "sourceParam": "source_file"
    },
    {
      "param": "format_width",
      "control": "whole_number",
      "label": "Width (digits)",
      "min": 1,
      "max": 100,
      "default": 8,
      "help": "Whole numbers shorter than this get zeros in front."
    },
    {
      "param": "format",
      "control": "hidden",
      "valueTemplate": "{{default (trim param.format_width) \"8\"}} digits with leading zeros"
    }
  ],
  "english": {
    "default": "Pad {{tableColumn param.source_file param.source_alias param.field_name}} with zeros to {{default (trim param.format_width) \"8\"}} digits."
  },
  "formulas": {
    "shape": "assignment",
    "target": "{{trim param.field_name}}",
    "default": {
      "excel": "TEXT({{field param.source_file param.field_name alias=param.source_alias}}, {{quote (repeat \"0\" (default (trim param.format_width) \"8\"))}})",
      "sql": "RIGHT(REPLICATE('0', {{default (trim param.format_width) \"8\"}}) + CAST({{field param.source_file param.field_name alias=param.source_alias}} AS VARCHAR(50)), {{default (trim param.format_width) \"8\"}})",
      "python": "df[{{quote param.field_name}}] = df[{{quote param.field_name}}].astype(str).str.zfill({{default (trim param.format_width) \"8\"}})"
    }
  },
  "export": {
    "scriptRole": "column",
    "fileUtility": { "compiler": "format_field" },
    "qtest": {
      "section": "E",
      "testType": "Data Validation",
      "outcomes": {
        "atlas": "Every value in the column has the configured number of digits.",
        "source": "Short source values appear with zeros in front."
      }
    }
  },
  "textImport": { "fromEnglish": true },
  "tests": [
    {
      "name": "employee number to 8 digits",
      "params": {
        "source_file": "SAP HR Master",
        "source_alias": "sap.hr",
        "field_name": "persno",
        "format_width": "8"
      },
      "expect": {
        "english": "Pad file \"sap.hr\" column \"persno\" with zeros to 8 digits."
      }
    }
  ]
}
```

## 8. Self-check

- [ ] The JSON parses; straight double quotes; no comments or trailing commas.
- [ ] Every required key is set; `id` follows the pattern and isn't taken.
- [ ] Every `control`, helper, script role and compiler comes from `STEP_TYPE_REFERENCE.md`.
- [ ] Every template only names params in `fields` (plus `step.` keys) and balances every `{{#…}}` with its `{{/…}}`.
- [ ] The `tests` cover each mode, and their expected English is what the template gives for those params.
- [ ] `export.fileUtility` names a compiler, or you told the user why it can't.

## 9. Hand-off steps for the user

1. Save the file (for example `pad_digits.json`) and upload a copy to the SharePoint step type folder **only after** it is published.
2. Open the Step Type Builder, choose **Import**, pick the file, review the dry run and import it as a draft.
3. Open the draft, check the preview and the **Tests** part (test results, Text import, File Utility status), and fix anything that fails.
4. Go to **Review and publish**, read the checks and changes, add a note and publish.
5. Export the published type from the builder as JSON into the SharePoint step type folder, so the agent sees it next time.
6. Then import the audit JSON that uses it in ATLAS Align.
