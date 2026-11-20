# The ATLAS Platform: Three Applications

ATLAS turns audit requirements into checked, runnable audits. Three applications share one Postgres database.

| Application           | Who uses it                   | What it does                                                                                                                                                                                                                                                          |
| --------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ATLAS Align**       | Audit leads, analysts, admins | Where audits are written, reviewed and published. Imports audit JSON (**My Audits → Import JSON**), shows the logic in the Logic Builder and Requirements Preview, lists Audit Issues, and exports Developer Logic, SQL and Python scripts, qTest rows and workbooks. |
| **Step Type Builder** | ATLAS Align admins            | Where step types are created, tested, reviewed and published without code. Imports and exports step type definitions as JSON. Published types appear in ATLAS Align right away.                                                                                       |
| **File Utility**      | Analysts running audits       | Runs a published audit against the uploaded source files and produces the audit report. It reads the same step type definitions and runs each step with the compiler its definition names.                                                                            |

## How they fit together

```text
Requirements document
   │  (this agent)
   ▼
Audit JSON ──► ATLAS Align: import, review, fix Audit Issues, publish
                  ▲                                    │
                  │ step types                         ▼
Step Type JSON ──► Step Type Builder: import draft,   File Utility: runs the
                  test, publish                        published audit
```

1. The agent reads the requirements and builds the audit from existing step types.
2. If a requirement needs a step type that doesn't exist, and the user agrees, the agent writes a step type definition. An admin imports it into the Step Type Builder, tests it and publishes it.
3. The user imports the audit JSON into ATLAS Align and reviews it.
4. When the audit is published, File Utility can run it, as long as every step's type names a File Utility compiler and every action and operator is supported. ATLAS Align shows a readiness report that lists anything File Utility can't run.

## Step types

Every logic step in an audit has a **step type** (`step_type`), such as `if_then`, `join` or `create_column`. A step type is a JSON **definition**: its fields (the editor), its English sentence, its formulas (Excel, SQL, Python), its qTest row, its checks, and which File Utility compiler runs it.

- **Built-in types** ship with ATLAS Align and are listed in `STEP_TYPE_REFERENCE.md`.
- **Builder types** are published later in the Step Type Builder. Their definitions are saved to the SharePoint step type folder, and the agent reads them from there.
- **Action kinds** (`then_action_type`) are small shared definitions that say what an IF / THEN step does: hide records, show a message, set a column, and so on.
- **Versions.** Each publish makes a new version. A published audit keeps the versions it was published with, so changing a type never changes an existing audit's output.
- **Legacy types** (`else` as a standalone choice, `filter_rows`, `flag_records`, `union_sources`) only exist for older audits.

## Roles

| Role                | Can                                                                 |
| ------------------- | ------------------------------------------------------------------- |
| `atlas-admin-team`  | Import audit JSON in ATLAS Align.                                   |
| `atlas-align-admin` | Edit, import, publish, retire and export step types in the builder. |

## The Source Library

ATLAS Align keeps a shared Source Library of known sources and fields. An imported audit can map its sources onto library sources (`sourceMappings`) or create new ones (`customSources`). See `AUDIT_JSON_FORMAT.md` Section 3.4.

## Where to look

| Question                                       | File                                                 |
| ---------------------------------------------- | ---------------------------------------------------- |
| How do I write the audit JSON?                 | `AUDIT_JSON_FORMAT.md`                               |
| Which step types, actions and operators exist? | `STEP_TYPE_REFERENCE.md`, then the SharePoint folder |
| How do I write a new step type?                | `STEP_TYPE_AUTHORING.md`                             |
