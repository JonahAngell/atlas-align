# ATLAS Align

ATLAS Align is a browser application for writing, reviewing, and publishing audit requirements. Analysts keep one shared audit in PostgreSQL, build its logic from source fields, and move that exact revision through review and publication. StudioShare Launch hosts the deployed app: it injects the database URL and resolves the signed-in user.

## Workflow

1. Find an existing audit or create one from My Audits. Deleted Items holds archived audits.
2. Describe the audit, assign analysts, and choose the source files and fields the logic will use.
3. Build the requirement in Logic Builder. Display Fields and Requirements Preview show what the published audit will contain.
4. Submit the saved revision for review. The assigned approver works in Reviewer Mode. Inbox carries the request, the decision, and later messages.
5. Publish the approved revision as a numbered snapshot. History keeps earlier revisions. Recently Deleted Publications administers publication records separately from the audit archive.

## Run locally

Docker Compose starts the app and PostgreSQL 17:

```bash
docker compose up --build
```

Open [http://localhost:8081](http://localhost:8081). `ATLAS_APP_ENV=local` signs every request in as Local Test User (`local-user-1`) with the `atlas-admin-team` and `atlas-align-admin` roles. No StudioShare session is required. [README-local.md](README-local.md) covers the seed users, a volume reset, and the optional `launch dev` path for a real StudioShare session.

## StudioShare

On Launch, leave `ATLAS_APP_ENV` unset. Launch injects `STUDIOSHARE_DB_URL` and `STUDIOSHARE_API_URL`. The server reads the `access_token` cookie and resolves the user with `GET {STUDIOSHARE_API_URL}/me`. Any value other than the literal `local` uses that path, including an empty value.

Workflow stages stay off until each `ATLAS_WORKFLOW_*_ENABLED` flag is the literal value `true`, in dependency order from reads through publication deletion. A later stage stays off when an earlier one is off. Local Compose turns all eight on.

## Step types

Every step type (Reference, Create Column, IF / THEN, Join and the rest) is a JSON definition in `catalogs/step-types/`, not hand-written code. A definition describes the editor, the English and Developer Logic wording, the Excel, SQL and Python formulas, the qTest rows, validation, text import and what File Utility can run. The engine in `js/step-types/` reads definitions; the server stores them as versioned rows in PostgreSQL and serves them at `GET /api/step-types`, and each publication records the versions it was made with.

After changing a definition, run `npm run step-types:manifest` to rebuild the generated files, then `npm test`. [docs/HOW_TO_ADD_A_STEP_TYPE.md](docs/HOW_TO_ADD_A_STEP_TYPE.md) is the developer guide, [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) describes the engine, and [docs/DYNAMIC_STEP_TYPE_BUILDER_PLAN.md](docs/DYNAMIC_STEP_TYPE_BUILDER_PLAN.md) holds the design.

## Step Type Builder

[atlas-step-type-builder](https://github.com/JonahAngell/atlas-step-type-builder) is a separate app where `atlas-align-admin` users create, test and publish step types without editing JSON. It previews each change with this repository's own engine, publishes to the same database tables, and exports a `.zip` laid out from this repository's root. Unzip it at the root, run `npm run step-types:manifest` and `npm test`, and open a pull request. See [docs/HOW_TO_ADD_A_STEP_TYPE.md](docs/HOW_TO_ADD_A_STEP_TYPE.md).

## File Utility

[audit-file-utility](https://github.com/JonahAngell/audit-file-utility) runs published audits. Each definition's `export.fileUtility` block names the File Utility compiler that runs the type, checked against the contract `catalogs/file-utility/executable-steps.json`, which both repositories keep identical. Readiness & Review uses the same contract to show which steps File Utility cannot run.

## Repository layout

| Path                             | What it is                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `server.js`                      | Express entry point. Serves the browser and the API.                                                                        |
| `index.html`, `sections/`, `js/` | Browser shell, HTML partials, and classic scripts. Load order in `index.html` is a dependency.                              |
| `catalogs/step-types/`           | Step type definitions, action kinds, the schema and the control palette.                                                    |
| `css/`                           | Feature CSS. `build-css.mjs` writes root `styles.css` from `css/manifest.json`.                                             |
| `src/`                           | Server modules: repositories, authorization, local identity, workflow flags, and the step type engine check and repository. |
| `sql/`                           | SQL statements loaded by those repositories.                                                                                |
| `.launch/migrations`             | Ordered PostgreSQL migrations applied by Launch and by the local database container.                                        |
| `local-db/`                      | Local init script and synthetic seed data.                                                                                  |
| `test/`                          | Node contract tests (`npm test`).                                                                                           |
| `tests/`                         | Playwright checks; run against a local server by default, or a deployed Preview when `PLAYWRIGHT_BASE_URL` is set.          |

[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) lists every application file and the behavior it owns.

## Development

Node.js 22 or later. After cloning, install the tracked version hook with `npm run hooks:install`. `npm run version:bump`, `npm run version:sync`, and `npm run version:check` keep the browser version in `js/00-config-utils.js` aligned with the managed Markdown markers. `npm test` runs the Node suite. `node build-css.mjs --check` validates CSS source units without writing `styles.css`.

### CodeGraph (optional, for AI coding agents)

The repository is set up for [CodeGraph](https://github.com/colbymchenry/codegraph), a local code graph that lets Claude Code look up symbols, callers, and call paths across the `js/` scripts without reading whole files. Nothing is sent to a server except optional anonymous usage statistics.

One-time setup on your machine:

```bash
npm i -g @colbymchenry/codegraph
codegraph telemetry off   # optional
codegraph init            # builds .codegraph/ (gitignored); it stays in sync while the MCP server runs
```

Claude Code picks up the committed `.mcp.json` (the `codegraph` MCP server), `.claude/settings.json` (allows its tools and adds a prompt hook that injects relevant code for structural questions), and `.claude/CLAUDE.md` (tells agents to use it). Without the CLI installed the hook does nothing and the MCP server simply fails to start. To rebuild the index from scratch, run `codegraph index --force`. Script overrides such as `renderGuidedBuilder = function …` are indexed under their inner function names, and tests that load scripts with `vm` are not linked to the code they test.
