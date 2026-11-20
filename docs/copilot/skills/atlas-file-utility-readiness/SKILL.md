---
name: atlas-file-utility-readiness
description: Check whether an ATLAS audit or step type can run in File Utility, and suggest changes that let it run. Use after building an audit or step type, or when the user asks whether an audit will run.
---

# File Utility readiness

File Utility runs a published audit against the uploaded files. ATLAS Align shows the same check as a readiness report. Use `STEP_TYPE_REFERENCE.md` (each type's "Runs in File Utility" row, the action kinds' File Utility column and the operators' last column) and, for SharePoint types, their `export.fileUtility`.

## Check each step

| Check                      | Runs when                                                                                              | Blocker when                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Step type                  | Its definition names a File Utility compiler                                                           | No `export.fileUtility.compiler`                                                                 |
| Limits in the reference    | The step fits the "when" note (for example joins, sorts and duplicate removal not inside an IF branch) | It breaks the limit                                                                              |
| Action kind                | Its handler is `supported`, or `partial` and the step fits the note                                    | Unsupported, or `freeform` text other than `DISPLAY "text" in column "name"` or `Do Not Display` |
| Operator                   | It runs in File Utility                                                                                | `matches expression` / `does not match expression`                                               |
| `create_column` expression | A listed value mode                                                                                    | Free-text expressions                                                                            |
| `format_field`             | `text`, `number`, a date format, or `<n> digits with leading zeros`                                    | Other formats, such as upper case or trim                                                        |
| Run date                   | `parameter` mode with `runDate`, or the tokens `run date`, `today`                                     | Other date expressions                                                                           |

## Report

After the JSON, give a short table: step, what File Utility does with it, and "Runs" or "Blocker: <why>". For each blocker suggest an alternative that runs (for example `display_text` instead of `freeform`, or a supported format). If the audit has no blockers, say "File Utility can run every step."

A new step type that names an existing compiler runs with no developer work. One that needs new logic can be published, but File Utility can't run audits that use it until a developer adds a compiler; say so before the user approves it.
