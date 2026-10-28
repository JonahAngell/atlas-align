# Source Library "Live / Backup / Unavailable" Lightboard — Debug Brief

> **For an AI assistant (Copilot, etc.):** This is a self-contained briefing on the ATLAS Align
> repository. The user is debugging locally. The **Source Library** panel on the Sources page always
> shows the yellow **Backup** lamp and never **Live**. Your job is to help find out why the server
> cannot load the SharePoint workbook, and to fix it. **Never ask for, print, log, or commit the
> real `SP_*` values.** Ask only for variable *names*, HTTP status codes, and sanitized error text.

---

## 1. TL;DR

- **Live** means the server downloaded and parsed an Excel workbook from **SharePoint via Microsoft Graph** during this request (or within the cache window).
- **Backup** means the SharePoint step failed **or isn't configured**, so the server served the copy stored in PostgreSQL (`atlas_field_library`).
- **Unavailable** means both SharePoint and the PostgreSQL table returned no rows.
- The decision is made **server-side** in `src/field-library-source.js` → `loadLiveFieldLibraryUncached()`. The browser only shows the `provenance.state` string it receives from `GET /api/source-library`.
- The automated tests for this feature pass (`node --test test/sharepoint-field-library.test.js` → 8/8). So the logic works, and the cause is almost certainly **configuration, credentials/permissions, network, or the workbook's contents**.

---

## 2. End-to-end flow

```
Browser (Sources page)
  js/11-repo-library.js  loadSourceFileLibrary()
    └─ js/17-source-database.js  atlasFetchSourceLibrary()  ──►  GET /api/source-library
                                                                     │
server.js  (loadEnvFile(".env") at startup, wires ctx)               │
  src/routes/source-library-routes.js  ◄──────────────────────────────┘
    └─ loadLiveFieldLibrary(pool)                    src/field-library-source.js
         └─ readSharePointWorkbook()                 src/sharepoint-client.js
              ├─ readSharePointConfig(process.env)   → not_configured / invalid_config?  → BACKUP
              ├─ POST login.microsoftonline.com/{tenant}/oauth2/v2.0/token  (client credentials)
              ├─ GET  graph /sites/{SP_HOST}:/sites/{SP_SITE}                → site id
              ├─ GET  graph /sites/{id}/drive/root:/{SP_FOLDER}/{SP_FILE}:   → eTag
              └─ GET  graph .../content                                     → .xlsx bytes
         └─ parseFieldLibraryWorkbook(bytes, {sheetName: SP_SHEET})  src/field-library-workbook.js
              └─ validateFieldLibraryTable()                         src/field-library.js
         └─ replaceFieldLibrary(pool, ...)  copies workbook into PostgreSQL (the future backup)
         └─ returns { state: "live", ... }
       Any exception → logs `sharepoint_field_library_failed` → reads PostgreSQL → { state: "backup" }
    └─ response JSON includes  provenance: { state, label, detail }
  ◄──
js/11-repo-library.js stores it in repoLibraryState.fieldLibraryProvenance
js/17-source-database.js atlasRenderFieldLibraryLightboard() lights the lamp whose data-lamp == state
```

### Provenance values (exact strings from `src/field-library-source.js`)

| `state` | `detail` text | Meaning |
|---|---|---|
| `live` | `SharePoint workbook loaded.` | Success |
| `backup` | `SharePoint is not configured. Saved field library.` | One or more required `SP_*` env vars is empty/missing in the **server process** |
| `backup` | `SharePoint workbook unavailable. Saved field library.` | Either `invalid_config` (bad `SP_HOST`/`SP_SITE` format) **or** any token/Graph/network error |
| `backup` | `SharePoint workbook could not be read. Saved field library.` | File downloaded but failed parsing/validation (`CsvValidationError`) |
| `unavailable` | `Field library unavailable.` | No SharePoint rows and no PostgreSQL rows |

The `detail` text is in the DOM but **visually hidden** (`#fieldLibraryLightboardText`, class `visually-hidden`). Read it with DevTools or via the API (see §5). **It is the most important clue.**

---

## 3. Related files

### Server (where the Live/Backup decision happens)

| File | Role |
|---|---|
| `src/sharepoint-client.js` | Reads `SP_*` config, gets an Entra ID token (client credentials), resolves the site, fetches eTag + file bytes from Microsoft Graph. In-memory token/site/file cache (`SP_CACHE_SECONDS`, default 300). Exports `readSharePointWorkbook`, `readSharePointConfig`, `resetSharePointState`, `SharePointError`. |
| `src/field-library-source.js` | `loadLiveFieldLibrary()` orchestrates download → parse → copy to DB → returns provenance. Fallback `readFieldLibraryRows()` reads PostgreSQL. `provenanceFor()` builds Backup/Unavailable objects. Calls are serialized through a promise queue. |
| `src/field-library-workbook.js` | `parseFieldLibraryWorkbook()` uses ExcelJS. Picks sheet `SP_SHEET` if set; otherwise the first sheet whose row 1 exactly equals the 33 expected headers. |
| `src/field-library.js` | `validateFieldLibraryTable()` (exact header match, 33 columns, non-blank unique `ID`), `CsvValidationError`, `replaceFieldLibrary()` (staged transactional replace of `atlas_field_library`). |
| `src/00-global-variables.js` | `FIELD_LIBRARY_TABLE` (`atlas_field_library`) and `FIELD_LIBRARY_COLUMNS` (the 33 exact header strings). |
| `src/routes/source-library-routes.js` | `GET /api/source-library` (returns `provenance`), `GET /api/source-library/access`, `POST /api/source-library/custom`. |
| `src/routes/field-library-routes.js` | `GET /api/field-library/summary` (row count in PostgreSQL), admin CSV replace/import history. |
| `src/source-library.js` | `sourceLibraryFromRows()` groups rows into sources by `Current Source`. |
| `src/load-env.js` | Minimal `.env` loader called at the top of `server.js`. |
| `server.js` | Line ~143: `loadEnvFile(path.join(__dirname, ".env"))`; builds the `ctx` passed to the routers. |
| `sql/field-library/` | SQL for staging, verify, truncate, copy, import completion. |
| `.launch/migrations/20260820112100_create_atlas_field_library.sql` | Creates the backup table. |

### Browser (only displays the result)

| File | Role |
|---|---|
| `sections/sources.html` | Lightboard markup: `#fieldLibraryLightboard`, three `.field-library-lamp[data-lamp="live|backup|unavailable"]`, hidden detail `#fieldLibraryLightboardText`. |
| `js/17-source-database.js` | `atlasFetchSourceLibrary()` (calls the API), `atlasRenderFieldLibraryLightboard()` (toggles `.is-lit`). |
| `js/11-repo-library.js` | `repoLibraryState.fieldLibraryProvenance`; `loadSourceFileLibrary()` sets it from the API payload. |
| `css/sources.css` | Lamp colors: `.field-library-lamp.is-lit[data-lamp="live"|"backup"]`, `.field-library-lightboard[data-state=...]`. |

### Config, tests, docs

| File | Role |
|---|---|
| `.env.example` | Variable names (blank): `SP_TENANT_ID`, `SP_CLIENT_ID`, `SP_CLIENT_SECRET`, `SP_HOST`, `SP_SITE`, `SP_FOLDER`, `SP_FILE`, `SP_SHEET`, `SP_CACHE_SECONDS`. |
| `docker-compose.yml` | Passes `SP_*` into the `app` container via `${SP_*:-}` interpolation. App at `http://localhost:8081`. |
| `.dockerignore` | Excludes `.env` from the image (intentional). |
| `test/sharepoint-field-library.test.js` | Unit tests for the client, parser, reload/fallback, and the lightboard. Good examples of how to stub `fetchImpl`/`env`. |
| `SHAREPOINT_ENV_GUIDE_NO_BINDING.md` | Entra app registration, `Sites.Selected`, curl smoke test, troubleshooting table. |
| `PROJECT_CONTEXT.md` | Search "SharePoint workbook" for the architectural description. |
| `README-local.md` | Local Docker setup; `ATLAS_APP_ENV=local` signs you in as a dev user. |

---

## 4. Configuration contract

| Variable | Required | Rules enforced in `readSharePointConfig()` |
|---|---|---|
| `SP_TENANT_ID` | yes | non-empty after trim |
| `SP_CLIENT_ID` | yes | non-empty |
| `SP_CLIENT_SECRET` | yes | non-empty. Must be the secret **Value**, not the Secret ID |
| `SP_HOST` | yes | must match `^[A-Za-z0-9.-]+$` → e.g. `contoso.sharepoint.com`. **No `https://`, no slash.** Otherwise `invalid_config` |
| `SP_SITE` | yes | must match `^[^/?#\\]+$` → only the segment after `/sites/`. **No slashes.** Otherwise `invalid_config` |
| `SP_FILE` | yes | file name, e.g. `ATLAS Field Library.xlsx` |
| `SP_FOLDER` | no | path inside the site's **default** document library. **Do not** include `Shared Documents`/`Documents` |
| `SP_SHEET` | no | exact worksheet name. If set and wrong, parsing fails ("could not be read") |
| `SP_CACHE_SECONDS` | no | default 300 |

Required Entra setup: app registration with **Microsoft Graph Application permission `Sites.Selected`**, admin consent granted, **and** a SharePoint admin must grant that app access to the specific site. Without the site grant, the token works but the site lookup returns 403/404.

---

## 5. Debugging playbook (in order)

### Step 1 — Read the provenance detail

With the app running locally (Docker: `http://localhost:8081`; `ATLAS_APP_ENV=local` bypasses login):

```bash
curl -s http://localhost:8081/api/source-library | jq .provenance
```

Or in browser DevTools console on the Sources page:

```js
document.getElementById("fieldLibraryLightboardText").textContent
```

Then branch on the `detail`:

- **"SharePoint is not configured"** → go to Step 2.
- **"SharePoint workbook unavailable"** → Step 2 (check `invalid_config`), then Steps 3–4.
- **"SharePoint workbook could not be read"** → Step 5.

### Step 2 — Confirm the server process actually sees the variables

Pitfalls specific to this repo:

1. **How you run the server matters.**
   - `npm start` / `node server.js`: `src/load-env.js` reads `./.env`. It does **not** strip quotes. `SP_CLIENT_SECRET="abc"` becomes the literal value `"abc"` *with quotes*, so the token request fails. **Remove all quotes** in `.env`.
   - `src/load-env.js` **does not override existing environment variables**. If your shell or IDE exports `SP_HOST=` (even empty), the `.env` value is ignored.
   - `docker compose up`: the container gets `SP_*` only through `${SP_*:-}` interpolation in `docker-compose.yml`. Compose reads `.env` from the **directory you run compose in**. `.env` is not copied into the image (`.dockerignore`). Check with `docker compose exec app sh -c 'env | grep ^SP_ | cut -d= -f1'`, which prints names only.
2. Windows line endings: the loader splits on `\r?\n` and trims, so CRLF is fine. Stray spaces around `=` are trimmed.
3. Check `SP_HOST` (no scheme/slash) and `SP_SITE` (no slash) against the regexes in §4.

Safe check that prints names and lengths, never values:

```bash
node -e 'import("./src/load-env.js").then(m=>{m.loadEnvFile(".env");for(const k of ["SP_TENANT_ID","SP_CLIENT_ID","SP_CLIENT_SECRET","SP_HOST","SP_SITE","SP_FOLDER","SP_FILE","SP_SHEET"])console.log(k,(process.env[k]||"").length)})'
node -e 'import("./src/load-env.js").then(async m=>{m.loadEnvFile(".env");const c=await import("./src/sharepoint-client.js");const r=c.readSharePointConfig();console.log({configured:r.configured,invalid:!!r.invalid})})'
```

### Step 3 — Read the server log

On failure the server logs one JSON line, which never contains secrets:

```json
{"level":"error","event":"sharepoint_field_library_failed","message":"..."}
```

| `message` | Cause |
|---|---|
| `Token request failed (400/401)` | Wrong tenant/client ID, Secret ID used instead of Value, expired secret, quotes in `.env` |
| `SharePoint workbook unavailable (HTTP 403)` | `Sites.Selected` site grant missing, or admin consent missing |
| `SharePoint workbook unavailable (HTTP 404)` | Wrong `SP_HOST`/`SP_SITE`, or `SP_FOLDER` includes the library name, or wrong file name or case |
| `SharePoint workbook unavailable (HTTP 429/503)` | Throttled |
| `SharePoint workbook unavailable.` (no status) | **Network-level failure.** `fetch` threw: DNS, corporate proxy, TLS interception, firewall. See Step 4 |
| A `CsvValidationError` message (e.g. `Workbook header mismatch.`) | Workbook contents; see Step 5 |

Note: `not_configured` / `invalid_config` produce **no log line**. Use Step 1/2 for those.

Also check for `field_library_backup_failed` (PostgreSQL read failed). That leads to "Unavailable", not "Backup".

### Step 4 — Network problems (most likely on a corporate laptop or in Docker)

`src/sharepoint-client.js` catches network errors and replaces them with a generic message, so the root cause is hidden. Lines ~112 and ~139 use `catch { throw new SharePointError(...) }`.

- **Corporate proxy:** Node's built-in `fetch` (undici) does **not** use `HTTP_PROXY`/`HTTPS_PROXY` by default. Recent Node releases support `NODE_USE_ENV_PROXY=1`; check your Node version's docs. The repo requires Node ≥ 22 (`.nvmrc` = 22).
- **TLS inspection (Zscaler etc.):** set `NODE_EXTRA_CA_CERTS=/path/to/corp-root.pem`. In Docker, the container has no corporate CA unless you add it.
- **Docker networking:** the container may not reach the proxy or corporate DNS that the host can.
- Verify reachability outside Node with the curl smoke test in `SHAREPOINT_ENV_GUIDE_NO_BINDING.md` §3 Step 4. If curl works and Node doesn't, it's proxy or CA.

**Temporary diagnostic (DEV ONLY, remove before committing):** in `accessToken()` and `graphGet()`, change `catch {` to `catch (cause) {` and log `cause?.cause?.code || cause?.code || cause?.name` (for example `ENOTFOUND`, `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `ECONNREFUSED`). **Never log the token, the request body, headers, or the secret.**

### Step 5 — Workbook contents ("could not be read")

`parseFieldLibraryWorkbook()` and `validateFieldLibraryTable()` are strict:

- The file must be a real `.xlsx` (ExcelJS). `.xls`, `.xlsb`, `.csv`, or a password-protected file won't parse.
- Without `SP_SHEET`, a sheet is used only if **row 1 exactly equals** the 33 headers in `FIELD_LIBRARY_COLUMNS`, in order. With `SP_SHEET`, that sheet must exist (exact name) and still pass header validation.
- **Watch the whitespace in the expected headers.** It is easy to "fix" these in Excel by accident:
  - `"Sample Value 1 "` — **trailing space**
  - `"History -  Source File Name"` — **two spaces** after the hyphen
  - `"Schema Location "` — **trailing space**
  - `"Audit - Authority Type"`, `"Current Source: Frequency"`, etc. must match character for character
- No data in column 34 or beyond (row 1 or any data row).
- At least one data row. `ID` (last column) must be non-blank and unique.

Debug locally by downloading the workbook manually and running:

```bash
node -e 'import("./src/field-library-workbook.js").then(async m=>{const fs=await import("node:fs");try{const r=await m.parseFieldLibraryWorkbook(fs.readFileSync(process.argv[1]),{sheetName:process.env.SP_SHEET||""});console.log("OK rows:",r.rows.length)}catch(e){console.log(e.name,e.message,e.details)}})' "/path/to/workbook.xlsx"
```

`e.details` shows `position`, `expected`, and `received` for header mismatches.

### Step 6 — Confirm Live

After fixing, restart the server, because the token, site ID, and file are cached in memory (`resetSharePointState()` exists for tests). Then repeat Step 1. Expected: `{"state":"live","label":"Live","detail":"SharePoint workbook loaded."}`. Also confirm `GET /api/field-library/summary` row count matches the workbook, since a successful reload copies it into PostgreSQL.

---

## 6. Caching and behavior notes

- Calls to SharePoint and to `loadLiveFieldLibrary` are **serialized** (promise queues), so concurrent requests don't double-download.
- Within `SP_CACHE_SECONDS`, the client returns `outcome: "cached"`. That's still **Live**, and the DB is not rewritten.
- After the TTL, the client fetches metadata. If the eTag is unchanged it reuses the bytes, but the outcome is still `"reloaded"`, so the DB copy is rewritten each TTL. This is harmless but worth knowing.
- The access token is cached until 60 s before expiry; the site ID is cached for the process lifetime.
- The lightboard re-renders on every `loadSourceFileLibrary()` call. It shows "checking" (no lamp lit) while the request is in flight.

---

## 7. Useful commands

```bash
npm ci
node --test test/sharepoint-field-library.test.js   # feature tests (currently 8/8 pass)
npm test                                            # full unit suite
npm run local:up                                    # docker compose: app :8081 + postgres :5432
npm run local:logs                                  # follow app + db logs; look for sharepoint_field_library_failed
npm start                                           # run directly (needs STUDIOSHARE_DB_URL + .env)
```

---

## 8. Rules for the assistant

- Don't hardcode or echo credentials. Don't add logging that could include tokens, `Authorization` headers, request bodies, or `SP_CLIENT_SECRET`. Error codes and HTTP statuses are fine.
- Keep any diagnostic code clearly marked `DEV ONLY` and remove it before committing.
- Don't weaken the header/ID validation to get Live; fix the workbook or config instead.
- Keep `.env` out of git and Docker images; `.env.example` stays blank.
- Commits follow Conventional Commits (`fix: ...`), and branches are named `bugfix-{ISSUE}-{description}`.
