---
name: atlas-conditions-actions
description: Turn audit rules into ATLAS IF / THEN conditions (conditions_json) and THEN / ELSE actions (then_action_type). Use when a requirement filters, flags, compares or fills columns based on a condition.
---

# Conditions and actions

The full keys are in `AUDIT_JSON_FORMAT.md` Section 5 (conditions) and Section 4.3 (`if_then`, `else`, action params). The operator and action kind lists are in `STEP_TYPE_REFERENCE.md` Sections 3 and 4, plus any action kinds in the SharePoint folder.

## 1. Split the rule

For each rule, write down: the **condition** (field, operator, compared value or field), the **THEN** outcome, and the **ELSE** outcome if the document states or implies one. Ask when an outcome is vague ("flag" could mean hide the record or write a message).

## 2. Pick the value mode and operator

| The document says                    | `valueMode` | `operator`                                                       | Compare with                                                  |
| ------------------------------------ | ----------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| equals / is / one of                 | `values`    | `is equal to`                                                    | `compareValue`, several values one per line                   |
| is not / not one of / excluding      | `values`    | `is not equal to`                                                | `compareValue`                                                |
| contains, starts with, ends with     | `values`    | `contains`, `starts with`, `ends with` (or the `does not` forms) | `compareValue`                                                |
| more / less than, at least, at most  | `values`    | `is greater than` … `is less than or equal to`                   | `compareValue`                                                |
| differs from / matches another field | `field`     | `is not equal to` / `is equal to`                                | `compareSourceFile`, `compareSourceAlias`, `compareFieldName` |
| before / after the run date, today   | `parameter` | `is less than` / `is greater than`                               | `compareParameter: "runDate"`                                 |
| is missing / empty / blank           | `blank`     | `is blank/null`                                                  | nothing (`compareValue: ""`)                                  |
| is present / filled                  | `blank`     | `is not blank/null`                                              | nothing                                                       |

Several compare values go **one per line**: `"compareValue":"2450\\n3357"` inside the `conditions_json` string. A comma-separated list is read as one value.

`AND` / `OR` join conditions left to right. For "A and (B or C)", split the rule into two IF steps or ask the user how to group it.

## 3. Pick the action

| Outcome                                       | `then_action_type`                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| Leave the records out of the report           | `do_not_display`                                                             |
| Leave out every record of the same person/key | `do_not_display` with `then_exclude_scope: "key"`                            |
| Keep only these records                       | `display` (and ELSE `do_not_display`)                                        |
| Write a message such as an error              | `display_text` (create the column first with `create_column`)                |
| Copy a field into a column                    | `set_column_value`                                                           |
| Calculate a value into a column               | `set_column_calculation`                                                     |
| First / last characters, length               | `set_column_string_transform`                                                |
| Something none of these do                    | Check SharePoint for an action kind, then ask; `freeform` is the last resort |

A builder action kind from SharePoint is used the same way: set `then_action_type` to its `name` and fill the params its `complete` list names.

## 4. ELSE

An ELSE outcome is an `else` step under the IF step: `parentId` = the IF's `id`, `branchType: "else"`, `sortOrder` = the IF's plus 1, `id` = the IF's `id` + `_else`, `params.parent_if_step_id` = the IF's `id`, its own `then_action_type`, and `include_else_branch: "Yes"` on the IF.

## 5. Check

- `conditions_json` is a **string**; the first condition's `connector` is `IF`; every key is present (`""` when unused).
- Every operator fits its value mode.
- Every column an action writes exists (a `create_column` step earlier, and a `Custom` field).
- Previews show conditions in plain English.
