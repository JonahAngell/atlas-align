---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/next.config.*"
  - "**/app/**/*"
  - "**/pages/**/*"
---

# Next.js App Router

Next.js App Router patterns, components, and data fetching best practices

Next.js patterns for React applications with server components and file-based routing.

Apply when: building Next.js 13+ applications, adding pages or API routes, or using App Router patterns.

---

## Structure

All source code lives under `src/` for clean separation from config files:

| Directory            | Purpose                     |
| -------------------- | --------------------------- |
| `src/`               | All application source code |
| `src/app/`           | Pages, layouts, API routes  |
| `src/app/api/`       | Route handlers              |
| `src/components/`    | React components            |
| `src/components/ui/` | Primitives (Button, Card)   |
| `src/lib/`           | Utilities, data fetching    |
| `public/`            | Static assets (outside src) |

### File Conventions

| File            | Purpose                              |
| --------------- | ------------------------------------ |
| `page.tsx`      | Route UI (required)                  |
| `layout.tsx`    | Shared wrapper, persists on navigate |
| `loading.tsx`   | Suspense loading UI                  |
| `error.tsx`     | Error boundary (`'use client'`)      |
| `not-found.tsx` | 404 UI                               |
| `route.ts`      | API endpoint                         |

## Routing

| Pattern   | Example                        | Use Case          |
| --------- | ------------------------------ | ----------------- |
| Static    | `src/app/about/page.tsx`       | Fixed routes      |
| Dynamic   | `src/app/[slug]/page.tsx`      | Single param      |
| Catch-all | `src/app/[...slug]/page.tsx`   | Multiple segments |
| Optional  | `src/app/[[...slug]]/page.tsx` | Optional segments |
| Groups    | `src/app/(marketing)/`         | Organize, no URL  |

### Params (Next.js 15+)

```tsx
// params are Promise in Next.js 15+
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
}
```

## Server vs Client Components

| Aspect        | Server (default)   | Client (`'use client'`) |
| ------------- | ------------------ | ----------------------- |
| Data fetch    | Direct async/await | useEffect, SWR          |
| State/Effects | Not available      | useState, useEffect     |
| Events        | Not available      | onClick, onChange       |

## Data Fetching

```tsx
// Server Component - direct fetch
export default async function Page() {
  const data = await getData();
  return <div>{data.title}</div>;
}

// Static generation
export async function generateStaticParams() {
  return items.map((item) => ({ slug: item.slug }));
}

// Dynamic metadata
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: getItem(slug)?.title ?? "Not Found" };
}
```

## Route Handlers

```tsx
// src/app/api/items/[slug]/route.ts
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const data = getContent(slug);
  if (!data) return new Response("Not found", { status: 404 });
  return Response.json(data);
}
```

## Styling

```tsx
// src/lib/utils.ts - class merging
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
```

## Navigation

```tsx
import Link from "next/link";
<Link href="/about">About</Link>;

// Client: programmatic
("use client");
const router = useRouter();
router.push("/dashboard");

// Server: 404
if (!item) notFound();
```

## Configuration

```js
// next.config.js
module.exports = {
  output: "standalone",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.example.com" }],
  },
};
```

```json
{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }
```

## Security

### Version Requirements

**CRITICAL**: Always use patched versions to avoid security vulnerabilities.

| Package | Minimum Safe Version | Vulnerabilities to Avoid              |
| ------- | -------------------- | ------------------------------------- |
| Next.js | `15.4.8+`            | CVE-2025-66478 (CRITICAL, CVSS 10)    |
| React   | `18.3.1+` (React 18) | CVE-2025-55182, CVE-2025-66478        |
| React   | Avoid React 19       | Unpatched vulnerabilities in React 19 |

**Do NOT use**:

- Next.js < 15.4.8
- React 19 (unpatched versions)
- Any version with known CVEs

Always check for security advisories before deploying. Update dependencies regularly.

### JavaScript/TypeScript Security

| Rule                                           | Details                            |
| ---------------------------------------------- | ---------------------------------- |
| Use `===` over `==`                            | Prevents type coercion bugs        |
| Avoid `eval()`, `new Function()`               | Code injection risk                |
| Run `npm audit` regularly                      | Check for vulnerable dependencies  |
| No `dangerouslySetInnerHTML` without DOMPurify | XSS prevention                     |
| Sanitize user input                            | Before display or database storage |
| Validate API inputs                            | Server-side validation is required |

```typescript
// Bad - XSS vulnerability
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// Good - sanitized
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />

// Bad - type coercion
if (value == null) { }

// Good - strict equality
if (value === null || value === undefined) { }
```

## Initial Setup

### Creating a New Next.js App

1. **Generate package-lock.json**: Always run `npm install` after creating `package.json` to generate `package-lock.json` (required for `npm ci` in Docker builds).

2. **Create public directory**: Next.js may not create a `public` directory automatically. Create it if needed:

   ```bash
   mkdir -p public
   touch public/.gitkeep
   ```

3. **Verify standalone output**: Ensure `next.config.js` includes `output: 'standalone'` for containerized deployments.

### Docker Build Requirements

- **package-lock.json**: Required for `npm ci` in Dockerfile. Generate with `npm install`.
- **public directory**: Ensure it exists (even if empty) before Docker build, or handle in Dockerfile:
  ```dockerfile
  RUN mkdir -p public
  ```

## Quick Reference

| Task                 | Pattern                         |
| -------------------- | ------------------------------- |
| Add page             | `src/app/route/page.tsx`        |
| Add API              | `src/app/api/route/route.ts`    |
| Loading state        | `loading.tsx` in route folder   |
| Error handling       | `error.tsx` with `'use client'` |
| Client interactivity | Add `'use client'` directive    |
| Static generation    | `generateStaticParams()`        |

## Checklist

- [ ] Server Components by default, Client only when needed
- [ ] Colocate `loading.tsx` and `error.tsx` with dynamic routes
- [ ] Use `@/` path alias for imports
- [ ] Use `cn()` for conditional Tailwind classes
- [ ] Security: Next.js >= 15.4.8, React 18.3.1+ (avoid React 19)
- [ ] package-lock.json: Generated and committed (required for Docker builds)
- [ ] public directory: Created if needed for static assets
- [ ] Standalone output: Configured in `next.config.js` for containerized deployments
