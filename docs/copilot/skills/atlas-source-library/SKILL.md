---
name: atlas-source-library
description: Decide how each audit source connects to the ATLAS Source Library and write the customSources and sourceMappings hints. Use when an audit names sources, library keys or field names that may differ from the library.
---

# Source Library mapping

The format is in `AUDIT_JSON_FORMAT.md` Section 3.4. Write the audit with the **document's** names; the hints tell the import how to translate them.

## For each source

| What you know                                                   | Do                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------ |
| The user or document gives a library key (`sap.hi0256`) or name | A `sourceMappings` entry with that `targetSource`                  |
| Field names differ from the library's                           | Add only the differing names to `sourceMappings.fields`            |
| The source is new                                               | A `customSources` entry with `sourceSystem` and typed `fields`     |
| You don't know                                                  | Ask. If still unknown, leave both out; the user decides at import. |

## Questions to ask

- "Is _<source>_ already in the ATLAS Source Library? If so, what is its library name or key?"
- "The document calls it `EMPNO`. What is the field called in `sap.hi0256`?"
- "For the new _<source>_, which fields are Number, Decimal, Currency, Date, Date/Time or Boolean? The rest will be Text."

## Rules

- Never guess a library key.
- One hint per source: a mapping or a custom source, never both.
- No hints for `Calculated Field` (columns the logic creates).
- Field names in a custom source use only letters, numbers, spaces and `. , & ' - _ ( ) : / +`. Ask about other characters.
- Fields used in calculations should be `Number`, `Decimal` or `Currency`.
- Tell the user which custom sources the import will create; everyone can see them.
- Show the plan as Preview D (source, in library?, import plan) before you write JSON.
