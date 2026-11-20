---
name: atlas-audit-json
description: Build an ATLAS Align audit import JSON file from an audit requirements document. Use when the user shares requirements (Word, Excel, PDF or text) or asks to create, convert or update an audit for ATLAS Align.
---

# Build an ATLAS Align audit JSON file

Follow these steps in order. The file format, recipes and self-check are in `AUDIT_JSON_FORMAT.md`; the step types are in the SharePoint step type folder and `STEP_TYPE_REFERENCE.md`.

## Read and extract

Find in the document:

- The audit's **name** and **purpose** (what it checks and why).
- Every **source** (file, report, table or system) and every **field** used or displayed, with the source it comes from.
- The **logic** in order: joins, filters, IF / THEN rules and their ELSE outcomes, new columns, formatting, splitting, sorting, duplicate removal.
- The **output**: which columns the report shows and in what order.
- For each source, whether it is **in the Source Library** (a library name or key such as `sap.hi0256`) or **new**.

Then map every rule to a step type and action kind with the `atlas-step-type-selection` skill before you ask questions, so the questions cover any gaps.

## Ask clarifying questions

Before you build anything, list what is missing or ambiguous and ask the user. Ask in **one numbered list**, grouped by topic, and offer a suggested answer for each question so the user can reply "yes" or "1: yes, 2: use LEFT JOIN". Always ask when:

| Situation                                               | Example question                                                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A source has no short alias                             | "What alias should I use for _Workday Worker Report_? Suggested: `wd.worker`."                                                                     |
| A field's source is unclear                             | "Is `Employee ID` from the SAP file or the Workday file?"                                                                                          |
| A join type is not stated                               | "When joining SAP to Workday on Employee ID, should unmatched SAP rows stay (LEFT JOIN) or drop (INNER JOIN)?"                                     |
| A condition is vague                                    | "'Recently hired' means hire date within how many days of the run date?"                                                                           |
| An outcome is vague                                     | "When the condition is true, should the record be hidden, or shown with an error message? If shown, what message text?"                            |
| An ELSE outcome is implied but not stated               | "What should happen to records that do not match this rule?"                                                                                       |
| Values look like codes                                  | "Are `2450, 3357, 3358` personnel area codes to match exactly?"                                                                                    |
| The document has several audits                         | "I found 3 audits in this document. Should I import all 3 as one bundle?"                                                                          |
| You can't tell if a source is in the Source Library     | "Is _Workday Workers_ already in the ATLAS Source Library? If so, what is its library name or key? If not, I'll define it as a new custom source." |
| A source's library field names differ from the document | "The document calls it `EMPNO`. What is the field called in the library source `sap.hi0256`?"                                                      |
| A new custom source's field formats aren't stated       | "For the new _Vendor Feed_ source, are `Amount` values Currency and `Invoice_Date` values Date? Everything else will be Text."                     |

Never invent field names, source names, or values. If the document doesn't say, ask. If the user says "use your best judgment", state the assumption you made in the preview.

## Show the previews

After the user answers, show these three previews **before** writing JSON. Use Markdown tables and code blocks so they render in chat.

**Preview A: Audit summary**

| Property    | Value                                                         |
| ----------- | ------------------------------------------------------------- |
| Name        | Rehire Status Compare                                         |
| Status      | Draft                                                         |
| Purpose     | Find rehired workers whose SAP status does not match Workday. |
| Sources     | 2                                                             |
| Fields      | 6                                                             |
| Logic steps | 7                                                             |

**Preview B: Sources and fields**

| #   | Source           | Alias            | Field           | Displayed in output |
| --- | ---------------- | ---------------- | --------------- | ------------------- |
| 1   | SAP HR Master    | `sap.hr`         | `persno`        | Yes                 |
| 2   | SAP HR Master    | `sap.hr`         | `status`        | Yes                 |
| 3   | Workday Workers  | `wd.worker`      | `Employee_ID`   | No                  |
| 4   | Calculated Field | Calculated Field | `Error Message` | Yes                 |

**Preview C: Logic flow** (indent child steps under their parent; mark THEN and ELSE branches)

```text
1. Reference source SAP HR Master as sap.hr
   2. ├─ THEN: Format persno as eight digits with leading zeroes
   3. └─ THEN: IF status is equal to "Withdrawn" THEN do not display record
4. Reference source Workday Workers as wd.worker
5. LEFT JOIN sap.hr.persno to wd.worker.Employee_ID
6. Create new column "Error Message"
7. IF sap.hr.status is not equal to wd.worker.Worker_Status
      THEN display "Status mismatch" in column "Error Message"
   8. └─ ELSE: do not display record
```

**Preview D: Source plan** (one row per source; see `AUDIT_JSON_FORMAT.md` Section 3.4)

| Source          | In Source Library?   | Import plan                                                            |
| --------------- | -------------------- | ---------------------------------------------------------------------- |
| SAP HR Master   | Yes, as `sap.hi0256` | Map `persno` → `PA0000-PERNR`, `status` → `PA0000-STAT2`               |
| Workday Workers | No                   | Create custom source _Workday Workers_ (system: Workday) with 2 fields |

Then ask: **"Does this match your requirements? Reply 'yes' to generate the JSON, or tell me what to change."** Repeat Phase 3 after every change until the user confirms.

## Generate and hand off

1. Write the whole audit as one downloadable `.json` file (`AUDIT_JSON_FORMAT.md` Sections 2 to 5). Suggest a kebab-case file name such as `rehire-status-compare.json`.
2. Run every check in `AUDIT_JSON_FORMAT.md` Section 6 and fix failures before you show the file.
3. Give the import steps (`AUDIT_JSON_FORMAT.md` Section 1).
4. Give the File Utility readiness summary (`atlas-file-utility-readiness` skill).
5. If the audit uses a new step type, say it must be published in the Step Type Builder before the audit is imported.

## Updating an existing audit

Keep the audit's `id`, step `id`s and source and field names. Warn that importing overwrites the audit with a new revision (history keeps the old one), and that a published audit has to be unlocked first.
