---
name: atlas-step-type-selection
description: Choose ATLAS step types and action kinds for each audit rule, checking the SharePoint step type folder first, and decide whether a new step type is truly needed. Use for every audit before writing JSON, and whenever a rule seems not to fit an existing step type.
---

# Choose step types

## 1. Gather the step types

1. Search the SharePoint step type folder (named in your instructions) for `.json` step type definitions. For each, note `id`, `version`, `label`, `description`, `kind` (`"action"` means an action kind), `status`, its `fields[].param` names, its `tests` (example params and English) and `export.fileUtility`.
2. Read `STEP_TYPE_REFERENCE.md` for the built-in types.
3. When both have the same `id`, use the higher `version`. Ignore `status: "legacy"` types for new audits.

## 2. Map each rule

| Requirement                                                                  | Step type                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| Start using a source                                                         | `reference_source` (one per source)                     |
| Combine two sources on keys / stack them                                     | `join` (`LEFT JOIN`, `INNER JOIN`, …, `UNION`)          |
| Keep, drop, flag or fill based on a condition                                | `if_then` + an action kind (`atlas-conditions-actions`) |
| Otherwise …                                                                  | `else` under the IF step                                |
| New column: fixed value, copy, join two fields, date difference, calculation | `create_column` with a `value_mode`                     |
| Change a field's format                                                      | `format_field`                                          |
| Keep part of a field split on a delimiter                                    | `split_field`                                           |
| Order the records                                                            | `sort_records`                                          |
| Remove duplicate records                                                     | `remove_duplicates`                                     |
| Anything a SharePoint type describes                                         | That type, with params from its `fields` and `tests`    |

Prefer a combination of existing steps over a new type: for example `create_column` then `if_then` with `set_column_calculation`, or two IF steps instead of nested grouping.

## 3. When to recommend a new step type

Recommend one only when at least one is true:

- No existing type or combination can express the rule.
- The only fit is a `freeform` action or a free-text expression, and the rule recurs or File Utility must run it.
- The same multi-step pattern appears in many audits and a single step would make them clearer.

Never recommend one just to rename or re-word an existing type.

## 4. Ask before creating

Ask the user, in one message:

> **New step type suggested: <Label> (`<id>`)**
>
> - **Requirement:** <the rule, quoted or summarized>
> - **Why existing types don't fit:** <types considered and why each falls short>
> - **What it would do:** <one or two sentences; its fields>
> - **File Utility:** <runs through the `<compiler>` compiler / can't run until a developer adds a compiler>
> - **Alternative without a new type:** <for example a `freeform` step the analyst completes by hand>
>
> Should I write this step type for the Step Type Builder, or use the alternative?

Only after a clear yes, use the `atlas-step-type-authoring` skill. If the user says no, use the alternative and note it in the preview.
