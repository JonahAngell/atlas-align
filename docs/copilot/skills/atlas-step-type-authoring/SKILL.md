---
name: atlas-step-type-authoring
description: Write a new or changed ATLAS step type definition as a .json file the Step Type Builder imports. Use only after the user has approved a new step type or a change to an existing one.
---

# Write a step type for the Step Type Builder

Follow `STEP_TYPE_AUTHORING.md`. Use only the controls, helpers, script roles and compilers listed in `STEP_TYPE_REFERENCE.md`.

## Steps

1. **Start from the closest existing type.** Copy its field pattern and English style from the reference or the SharePoint folder. Reuse its param names so File Utility's compiler for that type can run the new one.
2. **Pick the `id` and label.** Check the `id` isn't used in SharePoint or the reference.
3. **Write the fields**, then the `english` sentence in the built-in style, then the `excel`, `sql` and `python` formulas.
4. **Fill `export`:** `scriptRole`, `fileUtility.compiler` (or explain why none fits), and `qtest` outcomes.
5. **Write `tests`:** at least one case per mode, with the expected English worked out by hand from the template.
6. **Run the self-check** in `STEP_TYPE_AUTHORING.md` Section 8.
7. **Show a summary** before the file: id, label, fields (param, control, label), the English for each test, and File Utility status.
8. **Deliver** the definition as its own downloadable `.json` file named `<id>.json`, then the hand-off steps in `STEP_TYPE_AUTHORING.md` Section 9.
9. **Then** write the audit JSON that uses the type, with `step_type` = the `id` and `type` = its `legacyType`.

## Changing an existing type

- Start from the latest definition (SharePoint first, then the reference).
- Set `version` to the current version plus 1. Keep the `id` and every existing param name; add new params rather than renaming.
- List what changed and what existing audits keep: published audits keep their pinned version.
- Built-in types are maintained in the ATLAS Align repository; a change to one should also go to its developers.

## Don't

- Don't write code, scripts or JavaScript in templates; templates are only filled in.
- Don't add `migrations`, `aliases`, `partials`, `editorFrame`, `block` or `subtypes` unless a developer asks.
- Don't put real personal data in `tests`.
