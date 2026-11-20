# ATLAS Copilot Agent

Files for the Microsoft 365 Copilot agent that turns audit requirements into ATLAS Align audit JSON and, when the user approves, new step types for the Step Type Builder.

| Agent builder slot | File                                               | Notes                                                                                                                              |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Instructions       | `INSTRUCTIONS.md`                                  | Paste the whole file. It stays under 8,000 characters (a test checks). Replace `<SHAREPOINT_FOLDER>` with the folder's link first. |
| Knowledge          | `knowledge/ATLAS_PLATFORM.md`                      | The three applications and how they connect.                                                                                       |
| Knowledge          | `knowledge/AUDIT_JSON_FORMAT.md`                   | The audit import format and tested recipes.                                                                                        |
| Knowledge          | `knowledge/STEP_TYPE_REFERENCE.md`                 | Generated: built-in step types, action kinds, operators, controls, helpers, compilers.                                             |
| Knowledge          | `knowledge/STEP_TYPE_AUTHORING.md`                 | Writing a step type definition for the builder.                                                                                    |
| Knowledge          | The SharePoint step type folder                    | Add it as a SharePoint knowledge source.                                                                                           |
| Skills (6)         | `skills/<name>/SKILL.md`, uploaded as `<name>.zip` | Audit JSON, conditions and actions, Source Library, step type selection, step type authoring, File Utility readiness.              |

## Build the upload files

```bash
npm run copilot:build
```

This regenerates `knowledge/STEP_TYPE_REFERENCE.md` and writes `dist/copilot-agent/` (not committed): `INSTRUCTIONS.md`, `knowledge/*.md` and `skills/<name>.zip`, each zip holding `<name>/SKILL.md`. Upload those.

## The SharePoint step type folder

The agent searches this folder first for step types and action kinds published after the knowledge files were made. Keep one `.json` definition per file in it:

1. Publish the type in the Step Type Builder.
2. Export it from the builder as JSON and save the file to the folder, replacing the older version of the same type.

Copilot's SharePoint search may not index `.json` files. After saving the first one, ask the agent about that type to check it can read it. If it can't, save a copy with a `.txt` extension as well.

## Keeping it current

- After a change to step types, action kinds, operators, controls or the File Utility contract in this repository, run `npm run copilot:build`, commit the regenerated reference, and re-upload `STEP_TYPE_REFERENCE.md`. `npm test` fails while the reference is out of date.
- After a change to the import format, update `AUDIT_JSON_FORMAT.md`. `npm test` imports its complete example and checks every step renders.
- After editing a skill, rebuild and re-upload its zip.
