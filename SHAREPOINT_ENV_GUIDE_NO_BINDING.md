# SharePoint Access via `.env` — Implementation Guide

**Purpose:** Let any web app (Python, Node, .NET, etc.) read files from one SharePoint site using an Entra ID (Azure AD) app registration whose credentials live in a `.env` file.

**Audience:** Developers and AI coding assistants (Microsoft Copilot, Claude, ChatGPT, etc.). This document is self-contained. Everything needed to implement is on this page; nothing depends on the original project.

**Scope:** SharePoint only. No database content.

---

## 0. Summary for an AI assistant (read this first)

- **Auth model:** OAuth 2.0 *client credentials* flow (app-only, no user sign-in). The app exchanges `tenant id + client id + client secret` for a short-lived **bearer access token**, then calls **Microsoft Graph** (`https://graph.microsoft.com/v1.0`).
- **"The SharePoint API token" is not stored in `.env`.** What is stored is the **client secret**. The access token is minted at runtime (valid about 60–90 minutes) and must be cached in memory, never written to disk.
- **Least privilege:** the app has the Graph permission `Sites.Selected`, which grants access to **nothing** until a SharePoint admin has granted the app access to a specific site. **That site grant is assumed to be done already** (see the prerequisite in Section 3); this guide does not cover how to do it.
- **Never** hardcode, log, print, commit, or echo the secret or tokens. Never put values in code, docs, chat, or tickets.
- **Implementation order:** load `.env` → get token → resolve site ID → list/download files → handle errors (Section 7).

---

## 1. The `.env` variables

Create a file named `.env` in the project root. Copy this template; **leave real values out of anything you share.**

```dotenv
# --- Required for any SharePoint call ---
SP_TENANT_ID=
SP_CLIENT_ID=
SP_CLIENT_SECRET=
SP_HOST=your-tenant.sharepoint.com

# --- Which site / folder / file the app reads ---
SP_SITE=
SP_FOLDER=
SP_FILE=

# --- Optional tuning ---
SP_CACHE_SECONDS=300
```

| Variable | Required | Meaning | Where to find it |
|---|---|---|---|
| `SP_TENANT_ID` | Yes | Directory (tenant) GUID | Entra admin center → App registrations → your app → Overview → *Directory (tenant) ID* |
| `SP_CLIENT_ID` | Yes | Application (client) GUID of the app registration | Same page → *Application (client) ID* |
| `SP_CLIENT_SECRET` | Yes | The secret **Value** (not the Secret ID) | App → Certificates & secrets → New client secret. The value is shown **once**; copy it immediately |
| `SP_HOST` | Yes | SharePoint host name only, no `https://`, no path | e.g. `contoso.sharepoint.com` |
| `SP_SITE` | Yes | Site name: the segment after `/sites/` in the site URL | `https://contoso.sharepoint.com/sites/MyTeam` → `MyTeam` |
| `SP_FOLDER` | No | Folder path inside the site's default document library. Empty means library root | e.g. `Shared Documents/Reports` is written as `Reports` (the default library is the drive root, so **omit** the library name) |
| `SP_FILE` | App-specific | File name to read | e.g. `catalog.xlsx` |
| `SP_CACHE_SECONDS` | No | Seconds to reuse a downloaded file before re-checking SharePoint | Default 300 |

**Rules for the `.env` file**

1. Add `.env` to `.gitignore` and `.dockerignore`. Commit only a `.env.example` with blank values.
2. No quotes, no spaces around `=`, no trailing spaces.
3. In production (containers, App Service, etc.) inject the same names as **environment variables** or from a secret store (Key Vault). Code that reads `os.environ` / `process.env` works either way.
4. Client secrets expire (max 24 months). Put the expiry date in a calendar. When it expires, create a new secret, update `SP_CLIENT_SECRET`, restart the app.

---

## 2. How it works (flow)

```
.env ──► app starts, reads SP_* values
          │
          ▼
POST https://login.microsoftonline.com/{SP_TENANT_ID}/oauth2/v2.0/token
     grant_type=client_credentials
     client_id={SP_CLIENT_ID}
     client_secret={SP_CLIENT_SECRET}
     scope=https://graph.microsoft.com/.default
          │
          ▼  returns { access_token, expires_in }
GET https://graph.microsoft.com/v1.0/sites/{SP_HOST}:/sites/{SP_SITE}
     Authorization: Bearer {access_token}
          │
          ▼  returns site { id, displayName, webUrl }
GET  /sites/{site-id}/drive/root:/{folder}:/children      → list files
GET  /sites/{site-id}/drive/root:/{folder}/{file}:/content → download bytes
```

---

## 3. One-time setup (Entra ID + SharePoint)

Do these once per app. They need an Entra role that can register apps and grant admin consent.

> **Prerequisite (done by a SharePoint admin, not covered here):** the app must already be granted access to the target site. Without it, every site call returns 403/404 even with a valid token.

### Step 1 — Register the app
1. Entra admin center → **App registrations** → **New registration**.
2. Name it (for example `my-webapp-sharepoint-reader`). Single tenant. No redirect URI needed.
3. Copy **Application (client) ID** → `SP_CLIENT_ID` and **Directory (tenant) ID** → `SP_TENANT_ID`.

### Step 2 — Create the client secret
1. App → **Certificates & secrets** → **New client secret** → choose an expiry.
2. Copy the **Value** immediately → `SP_CLIENT_SECRET`. (The *Secret ID* column is not the secret.)

### Step 3 — Add the permission and consent
1. App → **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions**.
2. Select **`Sites.Selected`** → Add.
3. Click **Grant admin consent** (a tenant admin must do this). The status must show a green check.

> `Sites.Selected` alone gives **zero** access. Do not use `Sites.Read.All` or `Sites.ReadWrite.All` unless you really need tenant-wide access; they are far broader than necessary.

### Step 4 — Verify with curl before writing any code

```bash
# 1. Get a token (values come from your .env; do not paste secrets into shared chats)
curl -s -X POST "https://login.microsoftonline.com/$SP_TENANT_ID/oauth2/v2.0/token" \
  -d "grant_type=client_credentials" \
  -d "client_id=$SP_CLIENT_ID" \
  -d "client_secret=$SP_CLIENT_SECRET" \
  -d "scope=https://graph.microsoft.com/.default"

# 2. Resolve the site (use the access_token from step 1)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://graph.microsoft.com/v1.0/sites/$SP_HOST:/sites/$SP_SITE"
```

A JSON response with an `id` means setup is complete. See Section 7 for any error.

---

## 4. Reference implementation: Python

Dependencies: `pip install requests python-dotenv`

```python
"""sharepoint_client.py — minimal, reusable SharePoint reader using .env credentials."""
from __future__ import annotations

import os
import threading
import time
from urllib.parse import quote

import requests
from dotenv import load_dotenv

load_dotenv()  # reads .env if present; real environment variables also work

GRAPH = "https://graph.microsoft.com/v1.0"
_lock = threading.Lock()
_token = {"value": None, "expires": 0.0}
_site_ids: dict[str, str] = {}


def cfg(key: str, default: str | None = None) -> str:
    v = os.getenv(key, "").strip()
    if v:
        return v
    if default is not None:
        return default
    raise RuntimeError(f"{key} is not set")  # names the key, never prints a value


def access_token() -> str:
    """Get a bearer token, cached in memory until 60 s before expiry."""
    with _lock:
        if _token["value"] and time.time() < _token["expires"] - 60:
            return _token["value"]
        r = requests.post(
            f"https://login.microsoftonline.com/{cfg('SP_TENANT_ID')}/oauth2/v2.0/token",
            data={
                "grant_type": "client_credentials",
                "client_id": cfg("SP_CLIENT_ID"),
                "client_secret": cfg("SP_CLIENT_SECRET"),
                "scope": "https://graph.microsoft.com/.default",
            },
            timeout=30,
        )
        r.raise_for_status()
        body = r.json()
        _token["value"] = body["access_token"]
        _token["expires"] = time.time() + int(body.get("expires_in", 3600))
        return _token["value"]


def graph_get(path: str, **kw) -> requests.Response:
    r = requests.get(
        path if path.startswith("http") else f"{GRAPH}{path}",
        headers={"Authorization": f"Bearer {access_token()}"},
        timeout=120,
        **kw,
    )
    r.raise_for_status()
    return r


def site_id() -> str:
    site = cfg("SP_SITE")
    if site not in _site_ids:
        _site_ids[site] = graph_get(f"/sites/{cfg('SP_HOST')}:/sites/{site}").json()["id"]
    return _site_ids[site]


def _enc(path: str) -> str:
    """URL-encode each path segment (spaces, #, & and so on) but keep the slashes."""
    return "/".join(quote(p, safe="") for p in path.strip("/").split("/"))


def list_folder(folder: str | None = None) -> list[dict]:
    folder = cfg("SP_FOLDER", "") if folder is None else folder
    url = (
        f"/sites/{site_id()}/drive/root:/{_enc(folder)}:/children?$top=200"
        if folder
        else f"/sites/{site_id()}/drive/root/children?$top=200"
    )
    items: list[dict] = []
    while url:  # follow paging
        body = graph_get(url).json()
        items += body.get("value", [])
        url = body.get("@odata.nextLink")
    return items


def download(file_name: str | None = None, folder: str | None = None) -> bytes:
    folder = cfg("SP_FOLDER", "") if folder is None else folder
    file_name = file_name or cfg("SP_FILE")
    rel = f"{folder.strip('/')}/{file_name}" if folder else file_name
    return graph_get(f"/sites/{site_id()}/drive/root:/{_enc(rel)}:/content").content


if __name__ == "__main__":
    for it in list_folder():
        print(("[dir] " if it.get("folder") else "      ") + it["name"])
```

**Smoke test:** `python sharepoint_client.py` lists the configured folder. If it prints file names, the integration works.

### Optional: reuse a downloaded file (cache by change marker)

```python
_cache = {"checked": 0.0, "etag": None, "bytes": None}

def download_cached() -> bytes:
    ttl = int(cfg("SP_CACHE_SECONDS", "300"))
    with _lock:
        if _cache["bytes"] and time.time() - _cache["checked"] < ttl:
            return _cache["bytes"]
    folder, name = cfg("SP_FOLDER", "").strip("/"), cfg("SP_FILE")
    item = f"/sites/{site_id()}/drive/root:/{_enc(f'{folder}/{name}' if folder else name)}:"
    etag = graph_get(item).json().get("eTag")          # cheap metadata call
    with _lock:
        if _cache["bytes"] and _cache["etag"] == etag:
            _cache["checked"] = time.time()
            return _cache["bytes"]
    data = graph_get(f"{item}/content").content        # full download only when changed
    with _lock:
        _cache.update(checked=time.time(), etag=etag, bytes=data)
    return data
```

---

## 5. Reference implementation: Node.js (18+)

`npm i dotenv` (built-in `fetch`).

```js
// sharepoint-client.js
import 'dotenv/config';

const GRAPH = 'https://graph.microsoft.com/v1.0';
let token = { value: null, expires: 0 };
const siteIds = {};

const cfg = (k, d) => {
  const v = (process.env[k] || '').trim();
  if (v) return v;
  if (d !== undefined) return d;
  throw new Error(`${k} is not set`);
};

async function accessToken() {
  if (token.value && Date.now() < token.expires - 60_000) return token.value;
  const r = await fetch(`https://login.microsoftonline.com/${cfg('SP_TENANT_ID')}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cfg('SP_CLIENT_ID'),
      client_secret: cfg('SP_CLIENT_SECRET'),
      scope: 'https://graph.microsoft.com/.default',
    }),
  });
  if (!r.ok) throw new Error(`Token request failed (${r.status})`);
  const b = await r.json();
  token = { value: b.access_token, expires: Date.now() + (b.expires_in ?? 3600) * 1000 };
  return token.value;
}

async function graphGet(path, raw = false) {
  const r = await fetch(path.startsWith('http') ? path : GRAPH + path, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
  });
  if (!r.ok) throw new Error(`Graph ${r.status} on ${path.split('?')[0]}`);
  return raw ? Buffer.from(await r.arrayBuffer()) : r.json();
}

const enc = (p) => p.replace(/^\/|\/$/g, '').split('/').map(encodeURIComponent).join('/');

export async function siteId() {
  const s = cfg('SP_SITE');
  siteIds[s] ??= (await graphGet(`/sites/${cfg('SP_HOST')}:/sites/${s}`)).id;
  return siteIds[s];
}

export async function listFolder(folder = cfg('SP_FOLDER', '')) {
  const id = await siteId();
  let url = folder ? `/sites/${id}/drive/root:/${enc(folder)}:/children?$top=200`
                   : `/sites/${id}/drive/root/children?$top=200`;
  const items = [];
  while (url) { const b = await graphGet(url); items.push(...b.value); url = b['@odata.nextLink']; }
  return items;
}

export async function download(file = cfg('SP_FILE'), folder = cfg('SP_FOLDER', '')) {
  const rel = folder ? `${folder.replace(/^\/|\/$/g, '')}/${file}` : file;
  return graphGet(`/sites/${await siteId()}/drive/root:/${enc(rel)}:/content`, true);
}
```

For .NET, use `Azure.Identity` (`ClientSecretCredential`) with `Microsoft.Graph`. The same three values (`SP_TENANT_ID`, `SP_CLIENT_ID`, `SP_CLIENT_SECRET`) and scope `https://graph.microsoft.com/.default` apply.

---

## 6. Graph endpoint cheat sheet

All paths are relative to `https://graph.microsoft.com/v1.0` and need the header `Authorization: Bearer <token>`.

| Goal | Request |
|---|---|
| Resolve site | `GET /sites/{host}:/sites/{siteName}` |
| List library root | `GET /sites/{siteId}/drive/root/children` |
| List a folder | `GET /sites/{siteId}/drive/root:/{folder}:/children` |
| File metadata (name, size, `eTag`, `lastModifiedDateTime`) | `GET /sites/{siteId}/drive/root:/{folder}/{file}:` |
| Download file | `GET /sites/{siteId}/drive/root:/{folder}/{file}:/content` (follows a 302 redirect; keep redirects on) |
| Upload (<4 MB, needs `Write` grant) | `PUT /sites/{siteId}/drive/root:/{folder}/{file}:/content` with the file bytes as body |
| Other document libraries | `GET /sites/{siteId}/drives` then use `/drives/{driveId}/root:/...` instead of `/sites/{siteId}/drive/...` |

Notes:
- `/drive` means the site's **default** document library (usually "Documents" / "Shared Documents"). Its name is **not** part of the path.
- URL-encode every path segment but keep `/` separators.
- Large result sets page through `@odata.nextLink`; follow it until absent.

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Token call: `AADSTS7000215 invalid client secret` | Used the Secret **ID** instead of the **Value**, a typo, or stray whitespace/quotes in `.env` | Create a new secret, copy the **Value** |
| Token call: `AADSTS7000222 client secret expired` | Secret passed its expiry | Create a new secret, update `SP_CLIENT_SECRET`, restart |
| Token call: `AADSTS700016 application not found` | Wrong `SP_CLIENT_ID` or `SP_TENANT_ID` | Re-copy from the app's Overview page |
| Site lookup `403` or `404`, token OK | App has not been granted access to the site (the most common problem) | Ask the SharePoint site admin to grant this app (by client ID) access to the site; allow 1–2 minutes |
| Any other Graph `403` | Admin consent missing, or the site grant is read-only but the call writes | Check API permissions show a green check; ask the site admin to raise the grant to write |
| Site lookup `404` | `SP_SITE` or `SP_HOST` is wrong | `SP_SITE` is only the part after `/sites/`; `SP_HOST` has no `https://` |
| Folder or file `404` | Included the library name in `SP_FOLDER`, wrong case/spelling, or the file was renamed | Run the folder listing; copy the exact names |
| `401` mid-run | Cached token expired | Use the caching pattern with an expiry margin (Section 4) |
| `429` or `503` | Throttled | Honor the `Retry-After` header, back off, add caching |
| Works locally, fails in container | `.env` not copied (correct) and variables not injected | Pass the `SP_*` values as container environment variables or secrets |

---

## 8. Security checklist

- [ ] `.env` is in `.gitignore` and `.dockerignore`; only `.env.example` (blank values) is committed.
- [ ] Permission is `Sites.Selected`, granted on the single site only, read-only unless writes are required.
- [ ] The secret is never logged, printed, returned from an API, or pasted into chat, tickets, or AI prompts. Share variable **names**, never values.
- [ ] Production secrets come from a secret store or injected environment variables.
- [ ] Secret expiry date is tracked; rotation procedure is documented.
- [ ] Error messages shown to users name the failure type only (for example `Catalog unavailable: HTTPError`), never the token or request headers.
- [ ] If the secret is ever exposed, delete it in Entra (App → Certificates & secrets) and create a new one at once.

---

## 9. Integration checklist (copy into your task tracker)

1. [ ] App registration created; tenant ID and client ID recorded.
2. [ ] Client secret created; **Value** stored in `.env` (or the secret store).
3. [ ] `Sites.Selected` (Application) added and admin consent granted.
4. [ ] Site admin confirmed the app has been granted access to the target site (read, or write if needed).
5. [ ] curl smoke test (Section 3, Step 4) returns a site `id`.
6. [ ] Client module (Section 4 or 5) added to the web app.
7. [ ] Folder listing prints the expected files.
8. [ ] Token and file caching in place.
9. [ ] `.env` excluded from git and Docker; `.env.example` committed.
10. [ ] Secret expiry reminder created.

---

## 10. Prompt to give an AI assistant

Paste this, **plus the contents of this guide**, but **never your real `.env` values**:

> Using the attached guide, add SharePoint file access to my `<framework>` web app. Read `SP_TENANT_ID`, `SP_CLIENT_ID`, `SP_CLIENT_SECRET`, `SP_HOST`, `SP_SITE`, `SP_FOLDER`, and `SP_FILE` from environment variables. Use the client-credentials flow against Microsoft Graph, cache the access token in memory, resolve the site ID once, and expose a function that returns the bytes of `SP_FILE`. Do not log or return any secret. Add the variable names to `.env.example` with blank values and make sure `.env` is git-ignored.
