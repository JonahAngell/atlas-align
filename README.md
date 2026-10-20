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

## Repository layout

| Path | What it is |
| --- | --- |
| `server.js` | Express entry point. Serves the browser and the API. |
| `index.html`, `sections/`, `js/` | Browser shell, HTML partials, and classic scripts. Load order in `index.html` is a dependency. |
| `css/` | Feature CSS. `build-css.mjs` writes root `styles.css` from `css/manifest.json`. |
| `src/` | Server modules: repositories, authorization, local identity, and workflow flags. |
| `sql/` | SQL statements loaded by those repositories. |
| `.launch/migrations` | Ordered PostgreSQL migrations applied by Launch and by the local database container. |
| `local-db/` | Local init script and synthetic seed data. |
| `test/` | Node contract tests (`npm test`). |
| `tests/` | Playwright checks; run against a local server by default, or a deployed Preview when `PLAYWRIGHT_BASE_URL` is set. |

[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) lists every application file and the behavior it owns.

## Development

Node.js 22 or later. After cloning, install the tracked version hook with `npm run hooks:install`. `npm run version:bump`, `npm run version:sync`, and `npm run version:check` keep the browser version in `js/00-config-utils.js` aligned with the managed Markdown markers. `npm test` runs the Node suite. `node build-css.mjs --check` validates CSS source units without writing `styles.css`.
