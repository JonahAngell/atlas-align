# Studioshare Launch

A Studio platform that streamlines the entire application deployment process

Fully managed PaaS for containerized applications.

Apply when: deploying to Launch, configuring Dockerfiles for Launch, setting up webhooks, or accessing Launch services.

---

## Deployment Requirements

| Requirement    | Details                                                 |
| -------------- | ------------------------------------------------------- |
| EXPOSE         | Non-privileged port (3000, 8000, 8080)                  |
| USER directive | `USER 1000:1000` (Launch default non-root)              |
| File ownership | `--chown=1000:1000` on COPY                             |
| Health check   | `/health` or `/api/health` returning HTTP 200           |
| Git repository | GitLab with webhook                                     |
| Private repos  | Grant `f-pta-gitlab-svc` Reporter+                      |
| Webhook URL    | `https://api.studioshare.wds.io/launch/webhooks/gitlab` |
| App creation   | `https://developer.studioshare.wds.io/apps/create`      |

## Repository Setup

### Manual Setup (GitLab UI)

#### Add Webhook

1. Go to **Settings > Webhooks** in your GitLab repository
2. Click **Add new webhook**
3. Configure:
   - **URL**: `https://api.studioshare.wds.io/launch/webhooks/gitlab`
   - **Trigger**: Enable **Push events** and **Merge request events**
   - **SSL verification**: Enabled
4. Click **Add webhook**

#### Grant Service Account Access (Private Repos Only)

1. Go to **Settings > Members** (or **Manage > Members**)
2. Click **Invite members**
3. Search for `f-pta-gitlab-svc`
4. Select **Reporter** role (minimum required)
5. Click **Invite**

### Alternative: glab CLI Setup

If you have glab CLI installed and configured, use this from inside the cloned repo:

```bash
# Configure webhook + service account in one go
glab api --method POST projects/:id/hooks \
  -f url="https://api.studioshare.wds.io/launch/webhooks/gitlab" \
  -f push_events=true -f merge_requests_events=true -f enable_ssl_verification=true && \
glab api --method POST projects/:id/members \
  -f user_id=$(glab api users?username=f-pta-gitlab-svc | jq '.[0].id') \
  -f access_level=20

# Verify setup
glab api projects/:id/hooks && glab api projects/:id/members | jq '.[] | select(.username=="f-pta-gitlab-svc")'
```

**Requirements**: glab CLI with GitLab token (`api` scope, `write_repository` permission), Maintainer or Owner role on repo.

### Alpine Images

Alpine (`node:20-alpine`, `python:3.12-alpine`) already has UID 1000. Do NOT create new user:

```dockerfile
# WRONG - will fail
RUN addgroup --system --gid 1000 appgroup && adduser --system --uid 1000 appuser

# CORRECT
COPY --chown=1000:1000 ./app /app
USER 1000:1000
```

## Health Check

| Framework          | Path          | File                          |
| ------------------ | ------------- | ----------------------------- |
| Next.js App Router | `/api/health` | `src/app/api/health/route.ts` |
| Express.js         | `/health`     | Route handler                 |
| FastAPI            | `/health`     | Decorated function            |
| Flask              | `/health`     | Route decorator               |

```typescript
// Next.js: src/app/api/health/route.ts
import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
```

```javascript
// Express.js
app.get("/health", (req, res) => res.json({ status: "ok" }));
```

```
# FastAPI
@app.get("/health")
def health():
    return {"status": "ok"}

# Flask
@app.route('/health')
def health():
    return {'status': 'ok'}
```

## Dockerfile Examples

### Next.js Standalone

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder --chown=1000:1000 /app/.next/standalone ./
COPY --from=builder --chown=1000:1000 /app/.next/static ./.next/static
COPY --from=builder --chown=1000:1000 /app/public ./public
# Include .launch directory for migrations and other Launch-specific files
COPY --from=builder --chown=1000:1000 /app/.launch ./.launch
USER 1000:1000
EXPOSE 3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

**Note**: The `.launch/` directory contains migrations and other Launch-specific configuration. Always include it in the final image if your app uses Launch databases.

### Python FastAPI

```dockerfile
FROM python:3.12-alpine AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.12-alpine
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --chown=1000:1000 . .
USER 1000:1000
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## Environments

| Type       | Behavior                                      |
| ---------- | --------------------------------------------- |
| Production | Main branch, single instance, HA via replicas |
| Preview    | Other branches, per-commit, auto-deleted      |

## Environment Variables

### Auto-Injected

| Variable                   | Description                |
| -------------------------- | -------------------------- |
| `STUDIOSHARE_API_URL`      | Studioshare API URL        |
| `STUDIOSHARE_APP_ENV`      | Environment (prod/preview) |
| `STUDIOSHARE_APP_HOSTNAME` | Deployment hostname        |
| `STUDIOSHARE_STORE_BUCKET` | Object store bucket        |
| `STUDIOSHARE_STORE_PREFIX` | Object store prefix        |

### Custom Variables

Set in app settings. Options: target environment, sensitive flag (hidden), build arguments (non-sensitive only). Encrypted at rest.

## Authentication (Disney MyID)

Enable: Settings > Authentication > Login toggle

| Feature          | Behavior                               |
| ---------------- | -------------------------------------- |
| Token storage    | JWT in `access_token` cookie           |
| Token validation | Launch sidecar handles automatically   |
| API auth         | `Authorization: Bearer $TOKEN`         |
| User info        | `GET {STUDIOSHARE_API_URL}/me`         |
| Exclusions       | Configure in authentication exceptions |

| Role      | Capabilities                         |
| --------- | ------------------------------------ |
| Login     | App access only                      |
| Developer | Deploy, view logs                    |
| Owner     | Full control (permissions, settings) |

### User Info Endpoint

Fetch authenticated user details:

```bash
curl -X GET https://api.studioshare.wds.io/me \
  -H "Authorization: Bearer {token}"
```

**Response:**

```json
{
  "avatar": "https://example.com/avatar.png",
  "createdBy": {},
  "disabled": false,
  "email": "john.doe@disney.com",
  "fullName": "John Doe",
  "id": "123456",
  "lastLoginAt": "2024-01-15T10:30:00Z",
  "lastOnlineAt": "2024-01-15T12:45:00Z",
  "permissions": [{}],
  "roles": [{}],
  "username": "john.doe"
}
```

| Field          | Type    | Description            |
| -------------- | ------- | ---------------------- |
| `id`           | string  | Unique user identifier |
| `email`        | string  | User's email address   |
| `fullName`     | string  | Display name           |
| `username`     | string  | Login username         |
| `avatar`       | string  | Profile picture URL    |
| `disabled`     | boolean | Account status         |
| `lastLoginAt`  | string  | ISO 8601 timestamp     |
| `lastOnlineAt` | string  | ISO 8601 timestamp     |
| `roles`        | array   | User roles             |
| `permissions`  | array   | User permissions       |
| `createdBy`    | object  | Account creator info   |

**Next.js example:**

```typescript
// src/app/api/user/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const apiUrl = process.env.STUDIOSHARE_API_URL;
  const accessToken = request.cookies.get("access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const response = await fetch(`${apiUrl}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: response.status },
    );
  }

  return NextResponse.json(await response.json());
}
```

## Databases (PostgreSQL - Beta)

Create: `https://developer.studioshare.wds.io/dbs` (auto-creates preview + production)

| Variable                  | Description                           |
| ------------------------- | ------------------------------------- |
| `STUDIOSHARE_DB_URL`      | `postgresql://user:pass@host:port/db` |
| `STUDIOSHARE_DB_HOST`     | Hostname                              |
| `STUDIOSHARE_DB_PORT`     | Port (default: 5432)                  |
| `STUDIOSHARE_DB_NAME`     | Database name                         |
| `STUDIOSHARE_DB_USER`     | Username                              |
| `STUDIOSHARE_DB_PASSWORD` | Password                              |

```
# SQLAlchemy
from sqlalchemy import create_engine
engine = create_engine(os.getenv('STUDIOSHARE_DB_URL'))
```

```javascript
// Node.js pg
const { Pool } = require("pg");
const pool = new Pool({
  connectionString: process.env.STUDIOSHARE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
```

### Migrations

Location: `.launch/migrations/` (auto-executed on deploy)

```bash
npx dbmate --migrations-dir .launch/migrations new create_users_table
```

```
-- migrate:up
CREATE TABLE users (...);

-- migrate:down
DROP TABLE users;
```

## Object Stores

Create: `https://developer.studioshare.wds.io/stores` (credentials auto-injected)

```
s3_client = boto3.client('s3')  # credentials auto-injected
s3_client.list_objects_v2(Bucket=BUCKET, Prefix=PREFIX)
```

### Tork Integration

```yaml
mounts:
  - type: store
    source: my-store/production/
    target: /data
```

Limitations: Not fully POSIX-compliant; mount overhead at startup; server-side operations required.

## Service Mesh

Internal discovery via sidecar. Provides mTLS, load balancing, circuit breaking.

| Target         | URL Pattern                                  |
| -------------- | -------------------------------------------- |
| Production     | `http://{app-name}.launch.internal`          |
| Latest preview | `http://preview.{app-name}.launch.internal`  |
| Branch preview | `http://{branch}.{app-name}.launch.internal` |
| Deployment     | `http://{slug}.{app-name}.launch.internal`   |

**Warning**: Mesh overwrites `Authorization` header. Use custom header (e.g., `X-MyApp-Authorization`) for app tokens. Not available outside Studioshare VPC.

## Deploy Hooks

```bash
curl -X POST https://api.studioshare.wds.io/launch/apps/deploy/[HOOK_ID] \
  -H "Content-Type: application/json" \
  -d '{"branch": "main", "message": "optional", "commit": "optional"}'
```

Treat hook URLs as secrets; revoke if compromised.

## Build Options

| Trigger         | Behavior                |
| --------------- | ----------------------- |
| Production Push | Deploy on main push     |
| Preview Push    | Deploy on non-main push |
| Manual          | Via UI or deploy hook   |

Build cache: Per-commit SHA, Docker BuildKit registry cache. Security scans always run.

## Firewall

- **Inbound**: All blocked except ingress
- **Outbound**: All allowed
- **Service mesh**: Allowed within VPC
- **Custom rules**: IPs, CIDR (e.g., `192.168.1.0/24`), other Launch apps

## Runtime Logs

View: Deployment details > Runtime Logs. Use JSON logging.

| Operator | Example                              |
| -------- | ------------------------------------ |
| `&&`     | `status: error && message: database` |
| `\|\|`   | `status: error \|\| status: warning` |
| `-`      | `-status: debug`                     |

Fields: `message`, `status` (error/warning/info), `timestamp`. Tags lowercase.

## Responsibility Model

| Launch Team                        | User                                |
| ---------------------------------- | ----------------------------------- |
| Compute, networking                | Application code                    |
| DB provisioning, backups, patching | App security, secure coding         |
| Object storage reliability         | Config, data management, compliance |

## Quick Reference

| Task                      | Action                                                  |
| ------------------------- | ------------------------------------------------------- |
| Add webhook (manual)      | Settings > Webhooks > Add URL with push/MR events       |
| Grant service account     | Settings > Members > Add `f-pta-gitlab-svc` as Reporter |
| Setup via glab (optional) | Run one-shot commands from repo directory               |
| Enable auth               | Settings > Authentication > Login toggle                |
| Add database              | Databases > New Database > Connect to app               |
| Internal call             | `http://{app}.launch.internal`                          |
| Query error logs          | `status: error && message: {keyword}`                   |
| CI deploy                 | POST to deploy hook with branch                         |

## Checklist

- [ ] Health endpoint (`/health` or `/api/health`)
- [ ] EXPOSE directive (non-privileged port)
- [ ] `USER 1000:1000` (no new user on Alpine)
- [ ] `--chown=1000:1000` on COPY
- [ ] Webhook configured (Settings > Webhooks)
- [ ] Service account added for private repos (`f-pta-gitlab-svc`)
- [ ] Environment variables set
- [ ] Migrations in `.launch/migrations/` (if DB)
- [ ] Internal URLs use `.launch.internal`
- [ ] Custom auth header for mesh calls (if needed)
