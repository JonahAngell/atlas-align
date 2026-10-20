# ATLAS Align local database setup

This runs ATLAS Align against a local PostgreSQL 17 database. `ATLAS_APP_ENV=local` signs every request in as the development user. StudioShare session behavior is unchanged when that variable is not `local`.

## Start locally

```bash
docker compose up --build
```

Open [http://localhost:8081](http://localhost:8081). On startup PostgreSQL applies `.launch/migrations` and `local-db/seed.sql`. The app signs you in as `local-user-1` (`local.user`, Local Test User) with the `atlas-admin-team` and `atlas-align-admin` roles. `DEV_USER_ID` selects that user and defaults to `local-user-1`.

`local-user-2` (`local.reviewer`) is the seeded approver. Impersonation is enabled so you can switch to that profile without a StudioShare session.

The local services are:

- App: `http://localhost:8081`
- PostgreSQL: `localhost:5432`

## Health check

```bash
curl -i http://localhost:8081/api/health
curl -i http://localhost:8081/api/me
```

A working local database returns `{"status":"ok"}`. `/api/me` returns `local-user-1` with no cookie.

## Stop or reset

Preserve the local database volume:

```bash
docker compose down
```

Delete the local database and reapply migrations and seed data on the next start:

```bash
docker compose down -v
```

Seed changes apply only on an empty volume. After editing `local-db/seed.sql`, reset with `docker compose down -v`.

## Data and credentials

The Compose credentials are local-only and must not be reused outside this development stack. The local database is initialized from `.launch/migrations` and seeded with clearly synthetic records from `local-db/seed.sql`.

On Launch, `STUDIOSHARE_DB_URL` remains the preferred database connection. Locally, Compose sets both `DATABASE_URL` and `STUDIOSHARE_DB_URL`. No managed database URL is stored in this package.

To use a real StudioShare session instead of the development user, remove `ATLAS_APP_ENV` from the app service, set `STUDIOSHARE_API_URL` to the Launch proxy, and run `launch dev`. Open the Launch ingress at `http://localhost:3000`.

## Troubleshooting

View logs:

```bash
docker compose logs -f app db
```

If port 5432 is already in use, remove the `5432:5432` mapping from `docker-compose.yml`; the app container can still reach PostgreSQL through the `db` service.

If `/api/me` returns 401, confirm the app container has `ATLAS_APP_ENV=local`. Any other value, including an empty value, requires a StudioShare `access_token` cookie.

## Local workflow rollout

Compose enables all eight `ATLAS_WORKFLOW_*_ENABLED` flags in dependency order. Use the literal value `true` only. Disable a stage in `docker-compose.yml` to exercise non-destructive rollback; do not remove the workflow migration or local workflow records.

## End-to-end tests

Playwright starts `server.js` itself in local mode, so it only needs a migrated, seeded database. With Compose running, reuse its database:

```bash
npx playwright install chromium
STUDIOSHARE_DB_URL=postgresql://atlas:atlas-local-only@localhost:5432/atlas npx playwright test
```

The test server listens on port 8095 (`PLAYWRIGHT_LOCAL_PORT` changes it) with every workflow flag and impersonation enabled. Assignment and approver searches default to the seeded `local.user` and `local.reviewer`. Specs that need inputs the seed does not provide, such as `PLAYWRIGHT_SOURCE_ONE` and `PLAYWRIGHT_SOURCE_TWO`, skip with the variable they need. Tests create audits, so reset the database (`npm run local:reset`, then `npm run local:up`) for a clean run.

To run against a deployed Preview instead, set `PLAYWRIGHT_BASE_URL` to its HTTPS URL; `tests/auth.setup.js` then signs in through MyID.
