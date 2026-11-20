# ATLAS Align Audit JSON Format

The format of the `.json` file that **My Audits → Import JSON** reads, with a tested recipe for each step type. Use it with `STEP_TYPE_REFERENCE.md`, which lists every step type, action kind and operator, and with any newer step types in the SharePoint step type folder.

---

## 1. How the user imports the file

Tell the user these steps after you deliver JSON:

1. Open ATLAS Align and go to **My Audits**.
2. Click **Import JSON** and choose the `.json` file. The button only appears for users with audit-create permission (the `atlas-admin-team` role).
3. A status message confirms the result, for example _"Imported 1 audit(s) into the database."_ If some audits fail, the message says how many. The first imported audit opens on its Overview page.
4. Review the audit in **Logic Builder** and **Requirements Preview**, then assign analysts on the Overview page.

Import behavior to explain when relevant:

| Situation                                   | What happens                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| The `id` is new                             | A new audit is created.                                                                                             |
| The `id` matches an existing audit          | That audit is **overwritten** with a new revision. History keeps the old one. Warn the user before you reuse an id. |
| The file is identical to the existing audit | Counted as _unchanged_; nothing is written.                                                                         |
| The existing audit is published             | That audit fails to import until someone unlocks it in the app.                                                     |
| A bundle has one bad audit                  | The others still import; the bad one is listed as _failed_ with its error.                                          |
| File size                                   | Keep each file under 12 MB.                                                                                         |

---

## 2. File structure

A file can hold **one audit** or a **bundle** of several.

**Single audit:** the file is one audit object.

```json
{
  "schemaVersion": 1,
  "id": "rehire-status-compare",
  "name": "Rehire Status Compare",
  "...": "..."
}
```

**Bundle:** wrap several audits in an `audits` array.

```json
{
  "audits": [
    {
      "schemaVersion": 1,
      "id": "audit-one",
      "name": "Audit One",
      "...": "..."
    },
    { "schemaVersion": 1, "id": "audit-two", "name": "Audit Two", "...": "..." }
  ]
}
```

A plain top-level array of audit objects also works.

Either form can also carry `customSources` and `sourceMappings` arrays (Section 3.4). Put them at the top level of a bundle so one entry covers every audit that uses the source. A single-audit file can carry them on the audit object itself.

```json
{
  "audits": [{ "...": "..." }],
  "customSources": [{ "...": "..." }],
  "sourceMappings": [{ "...": "..." }]
}
```

---

## 3. The audit object

| Key             | Required    | Type   | Rules                                                                                                                                                  |
| --------------- | ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schemaVersion` | Recommended | number | Always `1`.                                                                                                                                            |
| `id`            | **Yes**     | string | Unique, stable, kebab case, for example `rehire-status-compare`. Reusing an existing id overwrites that audit.                                         |
| `name`          | **Yes**     | string | Display name, for example `Rehire Status Compare`.                                                                                                     |
| `status`        | No          | string | One of `Draft`, `Requirement Gathering`, `Ready for Review`, `Complete`. Use `Draft` unless the user says otherwise. Any other value fails the import. |
| `purpose`       | Recommended | string | One to three sentences: what the audit finds and why.                                                                                                  |
| `description`   | No          | string | Where this came from, for example `Converted from "Rehire Audit v3.docx".`                                                                             |
| `sources`       | **Yes**     | array  | Section 3.1.                                                                                                                                           |
| `fields`        | **Yes**     | array  | Section 3.2.                                                                                                                                           |
| `displayFields` | No          | array  | Section 3.3.                                                                                                                                           |
| `steps`         | **Yes**     | array  | Section 4.                                                                                                                                             |
| `metadata`      | No          | object | Free-form notes, for example `{ "convertedFrom": "Rehire Audit v3.docx" }`.                                                                            |

**Do not include `assignments`.** Assignments need real StudioShare user IDs. The user assigns analysts in the app after import.

### 3.1 Sources

One entry per source file, report, or table.

| Key           | Required | Type   | Rules                                                                                                                                              |
| ------------- | -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | **Yes**  | string | `source_1`, `source_2`, and so on.                                                                                                                 |
| `name`        | **Yes**  | string | The source's full name as the document states it, for example `HI0256_Maseke`. Every step that references this source uses this exact text.        |
| `alias`       | **Yes**  | string | Short lowercase name used in logic text, for example `sap.hi0256`. Dot notation `system.table` is the convention.                                  |
| `description` | No       | string | What the source contains.                                                                                                                          |
| `color`       | No       | string | Highlight color. Use these in order: `#fdd0ec`, `#b3f5ff`, `#abf5d1`, `#fffae6`, `#c0b6f2`, `#e6fcff`, `#ffd9c2`, `#d8f3dc`, `#dbeafe`, `#fde68a`. |

### 3.2 Fields

One entry per field used in logic or shown in the output, including columns the logic creates.

| Key            | Required | Type   | Rules                                                                                  |
| -------------- | -------- | ------ | -------------------------------------------------------------------------------------- |
| `id`           | **Yes**  | string | `field_1`, `field_2`, and so on.                                                       |
| `name`         | **Yes**  | string | Field name exactly as it appears in the source.                                        |
| `rawFieldName` | **Yes**  | string | Same as `name`.                                                                        |
| `type`         | **Yes**  | string | `Source` for a field read from a source file. `Custom` for a column the logic creates. |
| `sourceFile`   | **Yes**  | string | The source's `name`. For created columns, use `Calculated Field`.                      |
| `sourceAlias`  | **Yes**  | string | The source's `alias`. For created columns, use `Calculated Field`.                     |
| `vanityLabel`  | No       | string | A friendly column heading for the output, for example `Personnel Number`.              |
| `description`  | No       | string | What the field means.                                                                  |
| `used`         | No       | string | `Yes` if logic uses it, otherwise `""`.                                                |
| `displayed`    | No       | string | `Yes` if it appears in the output, otherwise `""`.                                     |
| `order`        | No       | number | Output column position, starting at `1`.                                               |

### 3.3 Display fields (optional)

Use this to set the output column order. Skip it if the document doesn't specify an order.

```json
{
  "sourceKey": "sap.hi0256",
  "sourceFile": "HI0256_Maseke",
  "fieldName": "persno",
  "displayed": true,
  "order": 0
}
```

`order` here starts at `0`.

### 3.4 Source Library hints: `customSources` and `sourceMappings`

ATLAS Align keeps a shared **Source Library** of known sources and their fields. When the file names a source the library doesn't have, the import asks the user to create it as a custom source or map it onto a library source. These two optional arrays tell the app what to do, so the user only has to confirm.

Write the audit itself (sources, fields, steps, conditions) with the **names from the requirements document**. The hints tell the app how to translate those names during import. Do not rename anything inside the audit to match the library.

| Situation                                                                           | Use                                                                                                 |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| The source is already in the library, and the user gave you its library key or name | A `sourceMappings` entry                                                                            |
| The source is new                                                                   | A `customSources` entry                                                                             |
| You don't know                                                                      | Neither; ask the user (Phase 2). If still unknown, leave it out and the user decides in the dialog. |

**`sourceMappings` entry**

```json
{
  "source": "SAP HR Master",
  "targetSource": "sap.hi0256",
  "fields": { "persno": "PA0000-PERNR", "status": "PA0000-STAT2" }
}
```

| Key            | Required | Rules                                                                                                                                                                                                                                         |
| -------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source`       | **Yes**  | The source's `name` or `alias` exactly as written in the audit's `sources`.                                                                                                                                                                   |
| `targetSource` | **Yes**  | The library source's key (such as `sap.hi0256`) or its exact library name. A key is safer, because two library sources can share a name.                                                                                                      |
| `fields`       | No       | Imported field name → library field name. List only names that differ or that you were told. The app auto-matches the rest by name, ignoring case, and also by display name. Fields it can't match are imported and reported as audit issues. |

**`customSources` entry**

```json
{
  "source": "Workday Workers",
  "sourceName": "Workday Workers",
  "sourceSystem": "Workday",
  "fields": [
    {
      "fieldName": "Employee_ID",
      "vanityLabel": "Workday Employee ID",
      "fieldFormat": "Text",
      "businessDescription": "Workday employee ID."
    },
    {
      "fieldName": "Hire_Date",
      "vanityLabel": "Hire Date",
      "fieldFormat": "Date"
    }
  ]
}
```

| Key                            | Required    | Rules                                                                                                                                                                                                    |
| ------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source`                       | **Yes**     | The source's `name` or `alias` exactly as written in the audit's `sources`.                                                                                                                              |
| `sourceName`                   | No          | Name for the new library source. Defaults to the source's `name`. Up to 200 characters, starting with a letter or number, using only letters, numbers, spaces, and `. , & ' - _ ( ) : / +`.              |
| `sourceSystem`                 | No          | The system it comes from, such as `Workday` or `SAP`. Up to 120 characters, same character rules.                                                                                                        |
| `fields`                       | Recommended | One entry per field. Fields the audit uses that you leave out are still added, with format `Text`. At most 200 fields.                                                                                   |
| `fields[].fieldName`           | **Yes**     | Exactly as the audit's `fields[].rawFieldName`. Same character rules as `sourceName`; a name with other characters (such as `#` or `%`) can't be saved, so ask the user what the field is really called. |
| `fields[].vanityLabel`         | Recommended | Friendly display name. Any characters. Defaults to `fieldName`.                                                                                                                                          |
| `fields[].fieldFormat`         | Recommended | One of `Text`, `Number`, `Decimal`, `Date`, `Date/Time`, `Boolean`, `Currency`. Defaults to `Text`.                                                                                                      |
| `fields[].businessDescription` | No          | What the field means. Up to 2,000 characters.                                                                                                                                                            |

**Rules**

- One entry per source. A source can have a `sourceMappings` entry or a `customSources` entry, not both.
- Don't add hints for `Calculated Field`. Columns the logic creates never go in the Source Library.
- Custom sources are shared with everyone in ATLAS Align. Tell the user which ones the import will create.
- If a source with the same name is already in the library, the app maps to it instead of creating a duplicate. Importing the same file twice is safe.

---

## 4. Logic steps

Steps are the audit's logic, one object per action. Every step has the same outer shape. The `params` object changes by step type.

### 4.1 Common step keys

| Key          | Required | Type           | Rules                                                                                                                                                                  |
| ------------ | -------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | **Yes**  | string         | Unique within the audit. Use `step_1`, `step_2`, and so on. An ELSE step uses its IF step's id plus `_else`, for example `step_7_else`. Duplicate ids fail the import. |
| `enabled`    | **Yes**  | boolean        | `true`.                                                                                                                                                                |
| `parentId`   | **Yes**  | string or null | `null` for a top-level step. Otherwise, the `id` of the step it sits under.                                                                                            |
| `branchType` | **Yes**  | string         | `root` when `parentId` is `null`. `then` for a step nested under a parent. `else` for an ELSE step.                                                                    |
| `sortOrder`  | **Yes**  | number         | Position in the whole audit, counting 1, 2, 3 from top to bottom, including nested steps. Never restart numbering inside a branch.                                     |
| `title`      | **Yes**  | string         | Short label, for example `IF / THEN`, `Join`, `Format Field`.                                                                                                          |
| `step_type`  | **Yes**  | string         | One value from Section 4.2.                                                                                                                                            |
| `type`       | **Yes**  | string         | Set from `step_type` using Section 4.2.                                                                                                                                |
| `source`     | **Yes**  | string         | The source `name` this step acts on, or `""` if it spans sources (joins).                                                                                              |
| `field`      | **Yes**  | string         | The main field this step acts on, or `""`.                                                                                                                             |
| `action`     | **Yes**  | string         | The step in one plain-English sentence, using the patterns in Section 4.3. The app regenerates this text, but write it so the user can review it.                      |
| `notes`      | **Yes**  | string         | Analyst notes from the document, or `""`.                                                                                                                              |
| `conditions` | **Yes**  | array          | Always `[]`. Conditions go in `params.conditions_json` (Section 5).                                                                                                    |
| `params`     | **Yes**  | object         | Step-specific settings (Section 4.3).                                                                                                                                  |

**Nesting rule:** steps that act on a single source right after it is referenced usually nest under that reference step (`parentId` = the reference step's id, `branchType` = `then`). Steps that act on joined data, such as cross-source comparisons, are top level (`parentId` = `null`, `branchType` = `root`).

### 4.2 Step types

| `step_type`         | `type`      | Use for                                                                             |
| ------------------- | ----------- | ----------------------------------------------------------------------------------- |
| `reference_source`  | `source`    | Start working with a source file. Add one per source, before any step that uses it. |
| `join`              | `join`      | Combine two sources on matching keys, or stack them (UNION).                        |
| `if_then`           | `if`        | A rule: IF a condition is true THEN do something. Also use it for filters.          |
| `else`              | `if`        | What happens when the preceding IF is not true.                                     |
| `create_column`     | `create`    | Add a new column (static value, copied field, expression, or concatenation).        |
| `format_field`      | `transform` | Change how a field is formatted.                                                    |
| `split_field`       | `transform` | Keep one part of a field split on a delimiter.                                      |
| `sort_records`      | `transform` | Sort records by a field.                                                            |
| `remove_duplicates` | `transform` | Remove duplicate records by key field.                                              |

These are the built-in types. You may also use a step type from the SharePoint step type folder: take its `step_type` from the definition's `id`, its `type` from `legacyType` (or the `id` when there is none), and its params from the definition's `fields[].param` and its `tests[].params`. Never use `filter_rows`, `flag_records` or `union_sources` (legacy), and never invent a `step_type`.

### 4.3 Params by step type

Every step that acts on one source includes `source_file` (the source `name`) and `source_alias` (its `alias`) in `params`.

#### `reference_source`

```json
"params": { "source_file": "HI0256_Maseke", "source_alias": "sap.hi0256" }
```

Action pattern: `Reference source file "HI0256_Maseke" as "sap.hi0256":`

#### `join`

| Param                                        | Value                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| `join_type`                                  | `INNER JOIN`, `LEFT JOIN`, `RIGHT JOIN`, `FULL OUTER JOIN`, or `UNION` |
| `left_source`, `left_alias`, `left_field`    | File 1's source name, alias, and key field                             |
| `right_source`, `right_alias`, `right_field` | File 2's source name, alias, and key field                             |
| `output_source`                              | UNION only: name of the combined file                                  |

For `UNION`, set `left_field` and `right_field` to `""`.

Action pattern: `LEFT JOIN file sap.hi0256 and file wd.worker on file sap.hi0256 column "persno" and file wd.worker column "Employee_ID".`

Explain join types to the user in plain words when you ask about them:

- **INNER JOIN:** keep only records found in both files.
- **LEFT JOIN:** keep every record from file 1; add file 2 details when they match.
- **RIGHT JOIN:** keep every record from file 2; add file 1 details when they match.
- **FULL OUTER JOIN:** keep every record from both files.
- **UNION:** stack both files into one list without matching.

#### `if_then`

| Param                                                                   | Value                                                                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `source_file`, `source_alias`                                           | The source of the first condition's field. Use `""` for both on a cross-source rule after a join. |
| `conditions_json`                                                       | **A string** containing the conditions array (Section 5).                                         |
| `then_action_type`                                                      | One value from the table below.                                                                   |
| `then_text`                                                             | Message text, for `display_text`.                                                                 |
| `then_output_column`                                                    | Column that receives the message, for `display_text`, for example `Error Message`.                |
| `then_target_column`                                                    | Column to fill, for `set_column_value`.                                                           |
| `then_value_source_file`, `then_value_source_alias`, `then_value_field` | Field to copy from, for `set_column_value`.                                                       |
| `then_action`                                                           | Free text, for `freeform`.                                                                        |
| `include_else_branch`                                                   | `"Yes"` when this IF has an ELSE step.                                                            |

| `then_action_type`            | Meaning                                                     | Action pattern                                                                    |
| ----------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `do_not_display`              | Hide matching records from the output.                      | `... THEN do not display record.`                                                 |
| `display`                     | Keep matching records (a filter that keeps).                | `... THEN display record.`                                                        |
| `display_text`                | Show a message in a column.                                 | `... THEN display text response "Status mismatch" in new column "Error Message".` |
| `set_column_value`            | Copy a field's value into a column.                         | `... THEN set "Final ID" value to file "sap" column "persno".`                    |
| `set_column_calculation`      | Write a calculation from a field into a column.             | `... THEN set "Overpay" value to file "sap" column "pay" minus ...`               |
| `set_column_string_transform` | Write part of a text value into a column.                   | `... THEN set "Country Short" value to the first 2 characters of ...`             |
| `freeform`                    | Only when nothing above fits; describe it in `then_action`. | `... THEN <then_action text>.`                                                    |

`freeform` can't run in File Utility unless it is exactly `DISPLAY "text" in column "name"` or `Do Not Display`, or it only holds child steps. Prefer a real action kind, and tell the user when you fall back to `freeform`.

**More action params**

| Action                        | Params                                                                                                                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `do_not_display` by key       | Add `then_exclude_scope: "key"`, `then_exclude_key_source_file`, `then_exclude_key_source_alias`, `then_exclude_key_field` to hide **every** record that shares the key value with a matching record (for example all rows of a worker who has one bad row).                    |
| `display_text`                | `then_text_separator` (optional, default `"\|\|"`) joins several messages written to the same column.                                                                                                                                                                           |
| `set_column_calculation`      | `then_target_column`, `then_value_source_file`, `then_value_source_alias`, `then_value_field` (the starting field), `then_math_json` (a **string** holding an array of operations), `then_rounding_mode` (`nearest`, `up` or `down`, optional), `then_rounding_decimal_places`. |
| `set_column_string_transform` | `then_target_column`, `then_string_source_file`, `then_string_source_field`, `then_string_operation` (`first_characters`, `last_characters`, `character_count` or `split`), `then_string_character_count` for the first two.                                                    |

Each `then_math_json` operation is `{"operator": "+", "operandType": "number", "operand": "2"}` or `{"operator": "-", "operandType": "field", "operandSourceFile": "SAP HR Master", "operandSourceAlias": "sap.hr", "operandFieldName": "hours"}`. Operators are `+`, `-`, `*` and `/`, applied in order. Fields used in arithmetic should be `Number`, `Decimal` or `Currency` in `customSources` (Section 3.4), or the audit shows a warning.

`display_text` writes into a column, so the audit needs a `create_column` step that creates that column (such as `Error Message`) **earlier** in `sortOrder`, plus a matching `Custom` field.

#### `else`

```json
"params": {
  "managed_else_branch": "Yes",
  "parent_if_step_id": "step_7",
  "then_action_type": "do_not_display"
}
```

An ELSE step uses the same `parentId` and nesting position as a child of its IF step: set `parentId` to the IF step's id, `branchType` to `else`, and `sortOrder` to the IF's `sortOrder` plus 1. Set `include_else_branch: "Yes"` on the IF step. ELSE uses the same `then_*` params as `if_then` to say what happens.

#### `create_column`

| Param                                                                    | Value                                                                                      |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `column_name`                                                            | Name of the new column.                                                                    |
| `value_mode`                                                             | `Static value`, `Source field value`, `Expression / calculation`, or `Concatenate fields`. |
| `static_value`                                                           | For `Static value`. Leave empty for a blank column.                                        |
| `field_name`                                                             | For `Source field value`: the field to copy.                                               |
| `expression`                                                             | For `Expression / calculation`, in plain words, for example `REPORT DATE - start_date`.    |
| `concat_field_1`, `concat_source_1`, `concat_field_2`, `concat_source_2` | For `Concatenate fields`: two fields and their source names.                               |

A calculated column with no source uses `source_file: ""` and `source_alias: "Calculated Field"`.

Action pattern: `Create new column "Days on Leave" using expression: REPORT DATE - start_date.`

#### `format_field`

| Param        | Value                                                                                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `field_name` | Field to format.                                                                                                                                                                               |
| `format`     | `eight digits with leading zeroes`, `date format MM/DD/YYYY`, `text`, or `number`. If the document needs a different format, use the closest one and put the exact rule in the step's `notes`. |

Action pattern: `Format column "persno" as eight digits with leading zeroes.`

#### `split_field`

```json
"params": { "source_file": "...", "source_alias": "...", "field_name": "full_name", "split_by": "delimiter", "split_delimiter": "comma", "split_mode": "part", "split_part": "1", "output_column": "Last Name" }
```

`split_delimiter` is one of `space`, `comma`, `hyphen`, `underscore`, `period`, `slash`, `backslash`, `pipe`, `semicolon`, `colon`, `tab` or `custom` (then set `split_custom_delimiter`). `split_part` counts from 1. Add a `Custom` field for `output_column`.

Action pattern: `Split file "sap.hr" column "full_name" on the comma and display part 1 in column "Last Name".`

#### `sort_records`

```json
"params": { "source_file": "...", "source_alias": "...", "field_name": "start_date", "sort_direction": "Descending" }
```

`sort_direction` is `Ascending` or `Descending`.

#### `remove_duplicates`

```json
"params": { "source_file": "...", "source_alias": "...", "field_name": "persno", "duplicate_action": "Keep first record" }
```

`duplicate_action` is `Keep first record`, `Keep last record`, or `Drop all duplicated records`.

---

## 5. Conditions (`conditions_json`)

`conditions_json` is the hardest part. Read this section carefully.

### 5.1 It is a string, not an array

Write the conditions as a JSON array, then put that array **inside a string**, escaping every inner double quote with a backslash.

Correct:

```json
"conditions_json": "[{\"id\":\"cond_1\",\"connector\":\"IF\",\"sourceFile\":\"HI0256_Maseke\",\"sourceAlias\":\"sap.hi0256\",\"fieldName\":\"status\",\"operator\":\"is equal to\",\"valueMode\":\"values\",\"compareValue\":\"Withdrawn\",\"compareSourceFile\":\"\",\"compareSourceAlias\":\"\",\"compareFieldName\":\"\",\"expression\":\"\"}]"
```

Wrong (an array instead of a string):

```json
"conditions_json": [{ "id": "cond_1", "connector": "IF" }]
```

When you show the logic preview (Phase 3), show conditions in plain English, not as escaped strings.

### 5.2 Condition keys

Include every key on every condition. Use `""` for keys that don't apply.

| Key                                                           | Value                                                                                                                                                                                    |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                          | Unique within the step: `cond_1`, `cond_2`, and so on.                                                                                                                                   |
| `connector`                                                   | `IF` for the first condition. `AND` or `OR` for each one after it.                                                                                                                       |
| `sourceFile`, `sourceAlias`, `fieldName`                      | The field being tested.                                                                                                                                                                  |
| `operator`                                                    | From Section 5.3.                                                                                                                                                                        |
| `valueMode`                                                   | `values` (compare to typed values), `field` (compare to another field), `parameter` (compare to the run date), or `blank` (test for empty).                                              |
| `compareValue`                                                | For `values`. One value, or several values **one per line**: inside the `conditions_json` string that is `"A\\nB\\nC"`. Never a comma-separated or quoted list; it is read as one value. |
| `compareSourceFile`, `compareSourceAlias`, `compareFieldName` | For `field`: the other field.                                                                                                                                                            |
| `expression`                                                  | `""`.                                                                                                                                                                                    |
| `compareParameter`                                            | For `parameter` only: `runDate`. Leave it out otherwise.                                                                                                                                 |

### 5.3 Operators

| `valueMode` | Allowed `operator` values                                                                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `values`    | `is equal to`, `is not equal to`, `contains`, `does not contain`, `starts with`, `does not start with`, `ends with`, `does not end with`, `is greater than`, `is greater than or equal to`, `is less than`, `is less than or equal to`     |
| `field`     | The same list as `values`.                                                                                                                                                                                                                 |
| `parameter` | `is equal to`, `is not equal to`, `is greater than`, `is greater than or equal to`, `is less than`, `is less than or equal to`. Set `compareParameter` to `runDate` to compare with the date the audit runs. Leave `compareValue` as `""`. |
| `blank`     | `is blank/null`, `is not blank/null` (set `compareValue` to `""`). `is blank` and `is not blank` are also accepted.                                                                                                                        |

Use lowercase operators exactly as written. `STEP_TYPE_REFERENCE.md` lists each operator's opposite, which an ELSE branch uses.

### 5.4 Mapping requirement language to conditions

| The document says                        | Condition                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| "Status = Active"                        | `values`, `is equal to`, `Active`                                                                       |
| "Status is one of A, L, P"               | `values`, `is equal to`, `"A\\nL\\nP"`                                                                  |
| "Exclude areas 2450 and 3357"            | `values`, `is equal to`, `"2450\\n3357"`, with `then_action_type: do_not_display`                       |
| "Email is missing"                       | `blank`, `is blank`                                                                                     |
| "SAP status differs from Workday status" | `field`, `is not equal to`, compare field = Workday status                                              |
| "Hire date after the run date"           | `parameter`, `is greater than`, `compareParameter: "runDate"`                                           |
| "A and (B or C)"                         | Split into two IF steps, or ask the user how to group it. One step's conditions are read left to right. |

---

## 6. Self-check before delivery

Check every item. Fix failures before you show the JSON.

- [ ] The JSON parses. No trailing commas, no comments, straight double quotes only (not curly quotes).
- [ ] Every audit has a non-empty `id` and `name`.
- [ ] `status` is one of the four allowed values.
- [ ] Step `id`s are unique within the audit.
- [ ] Every `parentId` is `null` or the `id` of another step in the same audit.
- [ ] `branchType` is `root` exactly when `parentId` is `null`.
- [ ] `sortOrder` runs 1, 2, 3 with no gaps or repeats, in top-to-bottom order.
- [ ] Every `step_type` comes from Section 4.2 (or the SharePoint folder), with the matching `type`.
- [ ] Every source name used in a step or field matches a `sources[].name` exactly, including case and spaces.
- [ ] Every source has exactly one top-level `reference_source` step (`parentId: null`), before any step that uses it. The app treats these as its generated reference steps, so never add a second one for the same source.
- [ ] Every `customSources` and `sourceMappings` entry's `source` matches a `sources[].name` or `alias` exactly, and no source has both.
- [ ] Every `customSources` field has a `fieldFormat` from Section 3.4, and every `fieldName` matches a `rawFieldName` in the audit.
- [ ] Every `sourceMappings.targetSource` came from the user or the document. Never guess a library key.
- [ ] Every `conditions_json` is a **string**, and that string parses to an array whose first condition has `connector: "IF"`.
- [ ] Every operator comes from Section 5.3 and fits its `valueMode`.
- [ ] Several compare values are one per line, never a comma-separated or quoted list.
- [ ] Every `step_type` that is not in Section 4.2 is a published type from the SharePoint folder, and its required params are set.
- [ ] Every `display_text` output column is created by an earlier `create_column` step.
- [ ] Every ELSE step's `parent_if_step_id` names an `if_then` step, and that IF has `include_else_branch: "Yes"`.
- [ ] No `assignments`, passwords, tokens, or personal data from the document. Sample values in requirements are fine; real employee records are not.

---

## 7. Complete example

**Requirement (as a user might paste it):**

> _Rehire Status Compare._ Compare SAP HR Master (persno, status) to the Workday Workers report (Employee_ID, Worker_Status). Format persno to 8 digits. Ignore withdrawn SAP records. Join SAP to Workday on persno = Employee_ID, keeping all SAP records. If the SAP status doesn't match the Workday status, show "Status mismatch" in an Error Message column. Otherwise, don't show the record.
>
> _Source Library (from the user's answers in Phase 2):_ SAP HR Master is in the library as `sap.hi0256`, where persno is `PA0000-PERNR` and status is `PA0000-STAT2`. Workday Workers is new; both of its fields are text.

**Generated JSON (`rehire-status-compare.json`).** The audit keeps the document's names; the two arrays at the end tell the import how to connect them to the Source Library:

```json
{
  "schemaVersion": 1,
  "id": "rehire-status-compare",
  "name": "Rehire Status Compare",
  "status": "Draft",
  "purpose": "Find workers whose SAP HR status does not match their Workday worker status.",
  "description": "Converted from the Rehire Status Compare requirements document.",
  "sources": [
    {
      "id": "source_1",
      "name": "SAP HR Master",
      "alias": "sap.hr",
      "description": "SAP HR master data.",
      "color": "#fdd0ec"
    },
    {
      "id": "source_2",
      "name": "Workday Workers",
      "alias": "wd.worker",
      "description": "Workday worker report.",
      "color": "#b3f5ff"
    }
  ],
  "fields": [
    {
      "id": "field_1",
      "name": "persno",
      "rawFieldName": "persno",
      "type": "Source",
      "sourceFile": "SAP HR Master",
      "sourceAlias": "sap.hr",
      "vanityLabel": "Personnel Number",
      "description": "SAP personnel number.",
      "used": "Yes",
      "displayed": "Yes",
      "order": 1
    },
    {
      "id": "field_2",
      "name": "status",
      "rawFieldName": "status",
      "type": "Source",
      "sourceFile": "SAP HR Master",
      "sourceAlias": "sap.hr",
      "vanityLabel": "SAP Status",
      "description": "SAP employment status.",
      "used": "Yes",
      "displayed": "Yes",
      "order": 2
    },
    {
      "id": "field_3",
      "name": "Employee_ID",
      "rawFieldName": "Employee_ID",
      "type": "Source",
      "sourceFile": "Workday Workers",
      "sourceAlias": "wd.worker",
      "vanityLabel": "Workday Employee ID",
      "description": "Workday employee ID.",
      "used": "Yes",
      "displayed": "",
      "order": 3
    },
    {
      "id": "field_4",
      "name": "Worker_Status",
      "rawFieldName": "Worker_Status",
      "type": "Source",
      "sourceFile": "Workday Workers",
      "sourceAlias": "wd.worker",
      "vanityLabel": "Workday Status",
      "description": "Workday worker status.",
      "used": "Yes",
      "displayed": "Yes",
      "order": 4
    },
    {
      "id": "field_5",
      "name": "Error Message",
      "rawFieldName": "Error Message",
      "type": "Custom",
      "sourceFile": "Calculated Field",
      "sourceAlias": "Calculated Field",
      "vanityLabel": "Error Message",
      "description": "Audit result message.",
      "used": "Yes",
      "displayed": "Yes",
      "order": 5
    }
  ],
  "steps": [
    {
      "id": "step_1",
      "enabled": true,
      "parentId": null,
      "branchType": "root",
      "sortOrder": 1,
      "title": "Reference SAP HR Master",
      "type": "source",
      "step_type": "reference_source",
      "source": "SAP HR Master",
      "field": "",
      "action": "Reference source file \"SAP HR Master\" as \"sap.hr\":",
      "notes": "",
      "conditions": [],
      "params": { "source_file": "SAP HR Master", "source_alias": "sap.hr" }
    },
    {
      "id": "step_2",
      "enabled": true,
      "parentId": "step_1",
      "branchType": "then",
      "sortOrder": 2,
      "title": "Format Field",
      "type": "transform",
      "step_type": "format_field",
      "source": "SAP HR Master",
      "field": "persno",
      "action": "Format column \"persno\" as eight digits with leading zeroes.",
      "notes": "",
      "conditions": [],
      "params": {
        "source_file": "SAP HR Master",
        "source_alias": "sap.hr",
        "field_name": "persno",
        "format": "eight digits with leading zeroes"
      }
    },
    {
      "id": "step_3",
      "enabled": true,
      "parentId": "step_1",
      "branchType": "then",
      "sortOrder": 3,
      "title": "IF / THEN",
      "type": "if",
      "step_type": "if_then",
      "source": "SAP HR Master",
      "field": "",
      "action": "IF column \"status\" is equal to \"Withdrawn\" THEN do not display record.",
      "notes": "",
      "conditions": [],
      "params": {
        "source_file": "SAP HR Master",
        "source_alias": "sap.hr",
        "conditions_json": "[{\"id\":\"cond_1\",\"connector\":\"IF\",\"sourceFile\":\"SAP HR Master\",\"sourceAlias\":\"sap.hr\",\"fieldName\":\"status\",\"operator\":\"is equal to\",\"valueMode\":\"values\",\"compareValue\":\"Withdrawn\",\"compareSourceFile\":\"\",\"compareSourceAlias\":\"\",\"compareFieldName\":\"\",\"expression\":\"\"}]",
        "then_action_type": "do_not_display"
      }
    },
    {
      "id": "step_4",
      "enabled": true,
      "parentId": null,
      "branchType": "root",
      "sortOrder": 4,
      "title": "Reference Workday Workers",
      "type": "source",
      "step_type": "reference_source",
      "source": "Workday Workers",
      "field": "",
      "action": "Reference source file \"Workday Workers\" as \"wd.worker\":",
      "notes": "",
      "conditions": [],
      "params": {
        "source_file": "Workday Workers",
        "source_alias": "wd.worker"
      }
    },
    {
      "id": "step_5",
      "enabled": true,
      "parentId": null,
      "branchType": "root",
      "sortOrder": 5,
      "title": "Join",
      "type": "join",
      "step_type": "join",
      "source": "",
      "field": "",
      "action": "LEFT JOIN file sap.hr and file wd.worker on file sap.hr column \"persno\" and file wd.worker column \"Employee_ID\".",
      "notes": "",
      "conditions": [],
      "params": {
        "join_type": "LEFT JOIN",
        "left_source": "SAP HR Master",
        "left_alias": "sap.hr",
        "left_field": "persno",
        "right_source": "Workday Workers",
        "right_alias": "wd.worker",
        "right_field": "Employee_ID"
      }
    },
    {
      "id": "step_6",
      "enabled": true,
      "parentId": null,
      "branchType": "root",
      "sortOrder": 6,
      "title": "Create Column",
      "type": "create",
      "step_type": "create_column",
      "source": "Calculated Field",
      "field": "Error Message",
      "action": "Create new column \"Error Message\".",
      "notes": "",
      "conditions": [],
      "params": {
        "column_name": "Error Message",
        "value_mode": "Static value",
        "static_value": "",
        "source_file": "",
        "source_alias": "Calculated Field"
      }
    },
    {
      "id": "step_7",
      "enabled": true,
      "parentId": null,
      "branchType": "root",
      "sortOrder": 7,
      "title": "IF / THEN",
      "type": "if",
      "step_type": "if_then",
      "source": "",
      "field": "",
      "action": "IF file sap.hr column \"status\" is not equal to file wd.worker column \"Worker_Status\" THEN display \"Status mismatch\" in column \"Error Message\".",
      "notes": "",
      "conditions": [],
      "params": {
        "source_file": "",
        "source_alias": "",
        "conditions_json": "[{\"id\":\"cond_1\",\"connector\":\"IF\",\"sourceFile\":\"SAP HR Master\",\"sourceAlias\":\"sap.hr\",\"fieldName\":\"status\",\"operator\":\"is not equal to\",\"valueMode\":\"field\",\"compareValue\":\"\",\"compareSourceFile\":\"Workday Workers\",\"compareSourceAlias\":\"wd.worker\",\"compareFieldName\":\"Worker_Status\",\"expression\":\"\"}]",
        "then_action_type": "display_text",
        "then_text": "Status mismatch",
        "then_output_column": "Error Message",
        "include_else_branch": "Yes"
      }
    },
    {
      "id": "step_7_else",
      "enabled": true,
      "parentId": "step_7",
      "branchType": "else",
      "sortOrder": 8,
      "title": "ELSE",
      "type": "if",
      "step_type": "else",
      "source": "",
      "field": "",
      "action": "ELSE: do not display record.",
      "notes": "",
      "conditions": [],
      "params": {
        "managed_else_branch": "Yes",
        "parent_if_step_id": "step_7",
        "then_action_type": "do_not_display"
      }
    }
  ],
  "sourceMappings": [
    {
      "source": "SAP HR Master",
      "targetSource": "sap.hi0256",
      "fields": { "persno": "PA0000-PERNR", "status": "PA0000-STAT2" }
    }
  ],
  "customSources": [
    {
      "source": "Workday Workers",
      "sourceName": "Workday Workers",
      "sourceSystem": "Workday",
      "fields": [
        {
          "fieldName": "Employee_ID",
          "vanityLabel": "Workday Employee ID",
          "fieldFormat": "Text",
          "businessDescription": "Workday employee ID."
        },
        {
          "fieldName": "Worker_Status",
          "vanityLabel": "Workday Status",
          "fieldFormat": "Text",
          "businessDescription": "Workday worker status."
        }
      ]
    }
  ],
  "sourceMappings": [
    {
      "source": "SAP HR Master",
      "targetSource": "sap.hi0256",
      "fields": { "persno": "PA0000-PERNR", "status": "PA0000-STAT2" }
    }
  ],
  "customSources": [
    {
      "source": "Workday Workers",
      "sourceName": "Workday Workers",
      "sourceSystem": "Workday",
      "fields": [
        {
          "fieldName": "Employee_ID",
          "vanityLabel": "Workday Employee ID",
          "fieldFormat": "Text",
          "businessDescription": "Workday employee ID."
        },
        {
          "fieldName": "Worker_Status",
          "vanityLabel": "Workday Status",
          "fieldFormat": "Text",
          "businessDescription": "Workday worker status."
        }
      ]
    }
  ]
}
```

---

## 8. Quick reference

| Need                                 | Use                                                                 |
| ------------------------------------ | ------------------------------------------------------------------- |
| Start a source                       | `reference_source`                                                  |
| Combine two sources                  | `join` with `join_type`                                             |
| Filter out records                   | `if_then` with `then_action_type: do_not_display`                   |
| Flag an error                        | `create_column` "Error Message", then `if_then` with `display_text` |
| Handle "otherwise"                   | `else` step with `parent_if_step_id`                                |
| Test for empty                       | `valueMode: blank`, `operator: is blank/null`                       |
| Compare two fields                   | `valueMode: field`, fill the `compare*` keys                        |
| Several values                       | One per line: `"compareValue":"A\\nB"` inside `conditions_json`     |
| Compare with the run date            | `valueMode: parameter`, `compareParameter: runDate`                 |
| Several audits in one file           | `{ "audits": [ ... ] }`                                             |
| Source already in the Source Library | `sourceMappings` entry with `targetSource` and any renamed `fields` |
| New source the library doesn't have  | `customSources` entry with `sourceSystem` and typed `fields`        |
