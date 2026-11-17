# Structured step settings for File Utility

This page lists the step settings that the ATLAS logic builder writes for
structured editors. File Utility's compiler (`atlas_compile.py`) reads these
settings and turns them into executable steps.

Each step stores its settings in `step.params` as strings. Lists are JSON text
in a `*_json` param, which is the pattern the builder already uses
(`duplicate_fields_json`, `sort_fields_json`).

New settings are additive. Existing audits keep their old settings, and the
builder keeps writing the older "mirror" params that the current compiler
reads. When the current compiler could not run a new setting correctly, the
builder leaves the mirror blank so that the compiler blocks the step instead
of running it wrongly. The cases where this does not hold are marked
**Compiler gap**.

The builder no longer offers Freeform Text as a THEN action for new steps.
Existing freeform actions are still shown and can be edited.

## THEN action: do not display all records for a key

This setting hides every record that shares a key value with a matching
record, such as all records for one employee. It is stored on an IF / THEN or
ELSE step whose `then_action_type` is `do_not_display`.

| Param                           | Value                                                                  |
| ------------------------------- | ---------------------------------------------------------------------- |
| `then_exclude_scope`            | `"key"`. Absent means only matching records are hidden (as before).    |
| `then_exclude_key_field`        | Key field name.                                                        |
| `then_exclude_key_source_file`  | Source file of the key field.                                          |
| `then_exclude_key_source_alias` | Alias of that source.                                                  |
| `then_exclude_key_fields_json`  | The same key as a JSON list of `{sourceFile, sourceAlias, fieldName}`. |

The builder removes all five params when the action is not `do_not_display`,
or when the scope is "matching records only".

```json
{
  "then_action_type": "do_not_display",
  "then_action": "Do not display all records for this key",
  "then_exclude_scope": "key",
  "then_exclude_key_field": "Personnel Number",
  "then_exclude_key_source_file": "PA0001",
  "then_exclude_key_source_alias": "sap.pa0001",
  "then_exclude_key_fields_json": "[{\"sourceFile\":\"PA0001\",\"sourceAlias\":\"sap.pa0001\",\"fieldName\":\"Personnel Number\"}]"
}
```

Map this to an `exclude` step with `groupBy` set to the key column references.
Read the key from `then_exclude_key_fields_json`. It is a list, so the rule can
later take more than one key field.

**Compiler gap:** the current compiler ignores `then_exclude_scope`. It hides
only the matching records, so a step with this setting runs and gives a
different result. Update the compiler before publishing audits that use it.

A new linked ELSE now starts as `then_action_type: "display_text"` instead of
`"freeform"`.

## Create column

### Date difference

This setting counts the days between a date field and a run parameter.

| Param                    | Value                                                                 |
| ------------------------ | --------------------------------------------------------------------- |
| `value_mode`             | `"Date difference"`                                                   |
| `date_diff_source_file`  | Source file of the date field.                                        |
| `date_diff_source_alias` | Alias of that source.                                                 |
| `date_diff_field`        | Date field name.                                                      |
| `date_diff_parameter`    | `"runDate"`. This is the only run parameter so far.                   |
| `date_diff_direction`    | `"parameter_minus_field"` (the default) or `"field_minus_parameter"`. |
| `date_diff_unit`         | `"days"`.                                                             |

```json
{
  "column_name": "Days Since Hire",
  "value_mode": "Date difference",
  "date_diff_source_file": "PA0041",
  "date_diff_source_alias": "sap.pa0041",
  "date_diff_field": "Hire Date",
  "date_diff_parameter": "runDate",
  "date_diff_direction": "parameter_minus_field",
  "date_diff_unit": "days"
}
```

Map it to `createColumn` with `kind: "dateDiff"`:

- For `parameter_minus_field`, use `start` = the field and
  `end` = `{"param": "runDate"}`.
- For `field_minus_parameter`, swap `start` and `end`.

The current compiler stops on this step with "the value mode … is not known".

### Concatenate with a separator

| Param              | Value                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `concat_separator` | Text placed between the two values. It can be 0–20 characters, and spaces count. Absent or `""` joins the values directly. |

```json
{
  "value_mode": "Concatenate fields",
  "concat_source_1": "PA0002",
  "concat_field_1": "First Name",
  "concat_source_2": "PA0002",
  "concat_field_2": "Last Name",
  "concat_separator": " "
}
```

Map it to `separator` on `createColumn` with `kind: "concat"`.

**Compiler gap:** the current compiler ignores `concat_separator` and joins
the values with no separator.

### Left, right, length and round

These settings are unchanged, and their params already exist:

- **left(n) and right(n):** `value_mode: "String transformation"`, with
  `string_operation` set to `first_characters` or `last_characters` and
  `string_character_count` set to n.
- **length:** `value_mode: "String transformation"` with
  `string_operation: "character_count"`.
- **round:** `value_mode: "Source field value"`, with `rounding_mode` set to
  `nearest`, `up` or `down` and `rounding_decimal_places` set to the number of
  places.

### Written expression becomes a description

The builder no longer offers "Expression / calculation" for new columns. An
existing column with `expression_type: "custom_expression"` keeps its
`expression` param, so the current compiler still sees it. Its text is also
copied into a new param:

| Param                | Value                                                                             |
| -------------------- | --------------------------------------------------------------------------------- |
| `column_description` | Free text for readers. It is never run. It is optional on any Create column step. |

In the builder, a column in this state is flagged "Written expression
(legacy)", and the step raises a warning in Audit Issues.

## Split field

| Param                    | Value                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `split_by`               | `"delimiter"` or `"width"`.                                                                                        |
| `split_mode`             | `"part"` (keep one part) or `"explode"` (one record per part).                                                     |
| `split_delimiter`        | A delimiter word, or `"custom"`. Blank when `split_by` is `"width"`.                                               |
| `split_custom_delimiter` | The custom delimiter text (1–20 characters, matched exactly). Blank unless `split_delimiter` is `"custom"`.        |
| `split_width`            | A whole number from 1 to 10000. Blank unless `split_by` is `"width"`.                                              |
| `split_part`             | `"1"` … `"1000"`, or `"last"`. Blank when `split_mode` is `"explode"`.                                             |
| `output_column`          | Required when `split_mode` is `"part"`. Blank when it is `"explode"`, because explode rewrites the field in place. |
| `split_on`               | Mirror for the current compiler. See below.                                                                        |

The delimiter words are `space`, `comma`, `hyphen`, `underscore`, `period`,
`slash`, `backslash`, `pipe`, `semicolon`, `colon` and `tab`. They match the
compiler's `DELIMITER_WORDS`.

`split_on` is the delimiter word, or the custom text, only when
`split_by: "delimiter"` and `split_mode: "part"`. In every other case it is
`""`, so the current compiler blocks the step with "the split has no
delimiter."

When an older step that has only `split_on` is opened, it is mapped to the new
params:

- `"comma"` becomes `split_delimiter: "comma"`.
- `"-"` becomes `"hyphen"`.
- Any other text becomes `"custom"`, with that text as the custom delimiter.
- `split_part` becomes a number, so "second value" becomes `"2"`.

```json
{
  "source_file": "PA0002",
  "field_name": "Full Name",
  "split_by": "delimiter",
  "split_mode": "part",
  "split_delimiter": "comma",
  "split_custom_delimiter": "",
  "split_width": "",
  "split_part": "2",
  "output_column": "Last Name",
  "split_on": "comma"
}
```

```json
{
  "source_file": "PA0105",
  "field_name": "Role Codes",
  "split_by": "width",
  "split_mode": "explode",
  "split_delimiter": "",
  "split_custom_delimiter": "",
  "split_width": "4",
  "split_part": "",
  "output_column": "",
  "split_on": ""
}
```

Map these to a v3 `split` step:

- `mode` is `split_mode`.
- Set `delimiter` (the resolved character) or `width`, never both.
- When `mode` is `"part"`, also set `part` and `outputColumn`.

Split Field can now be chosen as a new rule type.

## Format field

| Param                | Value                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `format_kind`        | `text`, `trim`, `upper`, `lower`, `number`, `date` or `zeroPad`. Required.               |
| `format_decimals`    | `"0"`–`"10"`, or `""` to keep the number as it is. Blank unless `format_kind` is number. |
| `format_date_output` | `MM/DD/YYYY`, `YYYY-MM-DD`, `YYYYMMDD` or `DD.MM.YYYY`. Blank unless the kind is date.   |
| `format_width`       | `"1"`–`"100"`. Blank unless the kind is `zeroPad`.                                       |
| `format`             | Mirror for the current compiler. See below.                                              |

A new step starts with no format, so the analyst must choose one. These
settings match the v3 `format` step (`format`, `decimals`, `dateFormat` and
`width`).

The `format` mirror is:

- `text`: `"text"`.
- `number`: `"number"`, or `"number (decimals)"` when `format_decimals` is set.
- `date`: the date format, such as `"YYYY-MM-DD"`.
- `zeroPad`: `"<width> digits with leading zeros"`.
- `trim`, `upper` and `lower`: the kind name.

The current compiler blocks a number with decimals, and blocks `trim`, `upper`
and `lower`, because it does not know those formats. It runs the others the
same way as v3.

An older step that has only `format` is mapped when it is opened. For example,
`"eight digits with leading zeros"` becomes `zeroPad` with width `8`, and
`"mm/dd/yyyy"` becomes `date` with `MM/DD/YYYY`. Text the builder can't read is
shown to the analyst, who must choose a format.

```json
{
  "source_file": "PA0001",
  "field_name": "Personnel Number",
  "format_kind": "zeroPad",
  "format_decimals": "",
  "format_date_output": "",
  "format_width": "8",
  "format": "8 digits with leading zeros"
}
```

## Remove duplicates

These params are unchanged. The builder now reports a step that can't run.

| Param                   | Value                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `duplicate_fields_json` | The key fields, as a JSON list of `{sourceFile, sourceAlias, fieldName}`. At least one required. |
| `duplicate_action`      | `"Keep first record"`, `"Keep last record"` or `"Drop all duplicated records"`. Required.        |

They map to the contract's `duplicateActions`: `first`, `last` and `none`.

## Conditions

Conditions are stored in `conditions_json` as before: a list of conditions and
groups. A group is `{"conditionType": "group", "groupConnector": "AND" | "OR",
"items": [...]}` and is shown as `( )` in the builder. These group params and
`compareMathJson` (arithmetic on a compared field) already exist.

### Operators

Values and Compare to Field conditions offer the contract's 12 operators:

- `is equal to`
- `is not equal to`
- `contains`
- `does not contain`
- `starts with`
- `does not start with`
- `ends with`
- `does not end with`
- `is greater than`
- `is greater than or equal to`
- `is less than`
- `is less than or equal to`

Blank / Null conditions use `is blank/null` and `is not blank/null`.

The Expression value mode and its operators (`matches expression`,
`does not match expression`) are offered only for a condition that already
uses them.

### Run parameter

A condition can compare a field with a run parameter. The run date is the only
run parameter so far.

| Param              | Value                                                                             |
| ------------------ | --------------------------------------------------------------------------------- |
| `valueMode`        | `"values"`.                                                                       |
| `compareParameter` | `"runDate"`.                                                                      |
| `compareValue`     | Mirror: `"run date"`, which the current compiler reads as `{"param": "runDate"}`. |
| `operator`         | `is equal to`, `is not equal to`, or one of the greater / less than operators.    |

The builder shows these conditions as the "Run Parameter" value mode. They are
stored as `values` so that the current compiler runs them correctly.

If the operator is a text match, such as `contains`, the builder leaves
`compareValue` blank so the current compiler blocks the condition. Audit
Issues also reports it.

```json
{
  "id": "cond_1",
  "connector": "IF",
  "sourceFile": "PA0000",
  "sourceAlias": "sap.pa0000",
  "fieldName": "End Date",
  "operator": "is less than",
  "valueMode": "values",
  "compareParameter": "runDate",
  "compareValue": "run date"
}
```

Map it to a condition whose `right` is `{"param": <compareParameter>}`, here
`{"param": "runDate"}`.

### Value lists

| Param           | Value                                                                        |
| --------------- | ---------------------------------------------------------------------------- |
| `compareValues` | The values as a JSON array of strings. Written for every `values` condition. |
| `compareValue`  | The same values, one per line, which the current compiler reads.             |

Read `compareValues` when it is present. Unlike commas in `compareValue`, it
keeps commas inside a value. `compareValues` is removed for other value modes
and for run parameter conditions.

## Run settings (`execution`)

These settings are for the whole audit, not one step. They are stored at the
top level of the audit document as `audit.execution` and set on the Overview
page in the "Run settings" card. The current compiler already reads them
(`execution()` in `atlas_compile.py`).

| Key             | Value                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `resultRows`    | `"all_except_excluded"` (default) or `"only_flagged"` (only records a Display Text step wrote on). |
| `textCombine`   | `"append"` (default) or `"last"`.                                                                  |
| `textSeparator` | 1–10 characters. The default is `"; "`.                                                            |
| `resultSource`  | The alias of the source whose table makes up the result. Absent means the last step's table.       |

The builder stores only the keys that differ from the defaults. An audit that
keeps every default has no `execution` key, so its saved document does not
change.

```json
{
  "execution": {
    "resultRows": "only_flagged",
    "textSeparator": " | "
  }
}
```

The `then_text_separator` param on a Display Text step (default `"||"`) is
used only in the step's ATLAS logic text. `textSeparator` is what File Utility
places between messages when it adds them together.

## Audit Issues

The new rule `audit.logic.structured-step-integrity` reports these problems:

- A split field that is missing its field, delimiter, width, part or output
  column.
- A Date difference column that has no date field.
- A separator longer than 20 characters.
- A Do Not Display by key that has no key field.
- A Format field step with no field or format, or with decimals, a date format
  or a width that is out of range.
- A Remove duplicates step with no key field, or with an unknown keep choice.
- A run date condition with an operator it can't use.

These are critical. Each one opens a fix dialog that sets the missing setting.
A legacy written expression is reported as a warning.

The Run settings card shows its own problems, such as a separator that is too
long or a result source that is not loaded.
