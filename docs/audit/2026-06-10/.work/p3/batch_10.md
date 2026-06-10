Apply small P3 nit fixes to gearup. Repo root: /Users/sagnikmitra/Desktop/GitHub/gearup.
- Next.js 14 App Router, Prisma 5 + Postgres, JWT auth.
- PERMISSIONS at `packages/types/src/domain.ts` (`@gearup/types`).
- AppError signature: `(statusCode: number, message: string, code: string)`.
- logActivity params: `actorType, actorId, action, entityType, entityId, previousValue?, newValue?, tx?`.
  NEVER use `adminUserId` or `metadata` — use `actorId: user.sub` and `previousValue/newValue`.
- handleApiError from `@/lib/errors`.

Rules:
1. Read each file before editing.
2. Apply EVERY finding to its target file. P3s are quality nits — make them ALL.
3. Preserve unrelated code. No reformatting outside the fix.
4. Don't run build.

Return JSON: {"files_edited": [...], "applied_ids": [...], "skipped": [{"id":"","reason":""}], "notes":"..."}.


## Target: `apps/web/src/components/layout/admin-sidebar.tsx` (1 findings)

### [P3] Layouts use raw `<img>` for the logo instead of `next/image`
- id: `img-tag-not-next-image` · cat: performance
- loc: `apps/web/src/components/layout/admin-sidebar.tsx:86, apps/web/src/app/(public)/layout.tsx:10`
- evidence:
```
<img src="/brand/gearup-logo.png" alt="GearUp" className="h-8 w-auto object-contain" />
```
- impact: No automatic responsive sizing, no AVIF/WebP, no priority hint, no width/height attribute → CLS on every navigation. Will also trigger `<img>` ESLint warning if next/eslint is enabled.
- fix: Use `next/image` with explicit `width`/`height` and `priority` on the sidebar logo.

---

## Target: `apps/web/src/lib/auth.ts` (1 findings)

### [P3] No rate limiting on admin routes (defense-in-depth)
- id: `no-rate-limit-public-vector` · cat: security
- loc: `apps/web/src/lib/auth.ts:7-21`
- evidence:
```
export function getAuthToken(): string { const h = headers(); const auth = h.get('authorization'); if (!auth?.startsWith('Bearer ')) throw new UnauthorizedError('Missing token'); return auth.slice(7); }
```
- impact: All admin routes are JWT-gated, so low-risk, but a compromised low-perm token (VIEW-only) could enumerate by spamming GET. No per-IP / per-token throttling.
- fix: Add Upstash-Ratelimit or middleware-based limiter (e.g. 60 rpm per token) at apps/web/src/middleware.ts.

---

## Target: `apps/web/src/lib/auth/auth-context.tsx` (1 findings)

### [P3] No server-side logout — only client-side localStorage clear
- id: `no-logout-endpoint` · cat: auth
- loc: `apps/web/src/lib/auth/auth-context.tsx:83-89`
- evidence:
```
const logout = () => {
  localStorage.removeItem('gearup_token');
  localStorage.removeItem('gearup_demo');
  writeCachedUser(null);
  api.clearCache();
  setUser(null);
};
```
- impact: Logout is purely client-side. Token remains valid server-side until 24h expiry. No audit log entry for logout. Combined with no-revocation list, there is no way for a user to forcibly end a session.
- fix: Add POST /api/admin/auth/logout that bumps tokenVersion (or stores token jti in a revocation set with TTL = remaining exp). Log activity.

---

## Target: `apps/web/src/lib/errors.ts` (1 findings)

### [P3] handleApiError leaks Prisma field names to client on P2003
- id: `errors-prisma-p2003-leaks-field-name` · cat: security
- loc: `apps/web/src/lib/errors.ts:82-88`
- evidence:
```
case 'P2003': {
  const field = (error.meta?.field_name as string) || 'reference';
  return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Invalid ${field}: referenced record does not exist` } }, { status: 400 });
}
```
- impact: Reveals internal DB column names (e.g., `AdminUserRole_roleId_fkey`) to API consumers. Mild info disclosure useful to attackers mapping the schema.
- fix: Return a generic 'Invalid reference' message. Log the field name server-side only.

---

## Target: `apps/web/src/lib/format-reg.ts` (1 findings)

### [P3] formatRegNumber regex greedy match breaks for BH-series and 3-letter state codes (DL, etc.)
- id: `format-reg-overlapping-regex` · cat: validation
- loc: `apps/web/src/lib/format-reg.ts:8-21`
- evidence:
```
const state = clean.slice(i).match(/^[A-Z]{1,2}/)?.[0] || '';  // BH-series is 'BH' then year digits — works
// but DL5SAB1234 → state='DL', dist='5', series='SAB', num='1234' OK; KL01CA1234 OK. However a typo with no district digits → entire alpha block consumed as state-then-series mash
```
- impact: Minor — display-only formatting. Validation `isValidRegNumber` only checks length >= 4, so junk like 'AAAAA' passes.
- fix: Tighten isValidRegNumber with a regex matching real Indian reg formats; keep formatter forgiving but add unit tests for BH and 3-letter series.