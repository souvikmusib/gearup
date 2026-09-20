---
mode: verification-recipes
updated: 2026-09-20
verified_against: dfb9bec098b598ecddefb1b3324ec18d882a1782
---

# VERIFICATION. Every claim in the docs, opened.

> A number in the numbered spec set is only worth what the reader can re-
> derive from the tree. This file is the recipe list. Every command below
> was run against `dfb9bec` on 2026-09-20; the expected output shape is
> given inline. If a command returns a different shape today, the doc that
> cites the underlying claim is stale and section 9 tells you how to know
> that fast.

## Method

Every recipe is a single-line command that runs against the working tree
at the sha listed in the target doc's YAML frontmatter. Paths are
absolute or repo-relative (start every one from
`/Users/sagnikmitra/Desktop/GitHub/gearup`). Commands avoid any shell
built-in that mutates state; no `rm`, no `mv`, no `>` into a tracked path.
Every recipe declares the shape of a passing return so a caller can tell
"still true" from "stale" without a second thought.

## Did NOT do

- No em-dashes.
- No destructive command.
- No test run, no build, no `pnpm install`.
- No live database read; every DB-shape claim is derived from
  `schema.prisma`, not from an `SELECT`.
- No Vercel API read, no Sentry read, no Supabase read.

---

## 1. How to verify a route claim

A spec says "route X is protected by permission Y." To confirm:

```bash
grep -n 'requirePermission\|export async function' \
  apps/web/src/app/api/<path>/route.ts
```

**Expected shape.** For a permission-gated route, at least one line
matches `requirePermission(...)` above the first `export async function
GET|POST|PATCH|PUT|DELETE`. For an auth-only route, look for
`getSessionUser` or `requireSession` instead. For a public route (four
under `apps/web/src/app/api/public/`, plus the four
`api/admin/auth/{login,logout,me,change-password}` routes documented in
`docs/13-TECH-DEBT.md` D-11 as intentionally unprotected), neither call
appears.

**Full route count as a sanity check:**

```bash
find apps/web/src/app/api -name route.ts | wc -l
# expected: 83
```

If the number is not 83 at the sha the doc claims, section 9 applies.

---

## 2. How to verify a model claim

A spec says "model `<Name>` has fields F1, F2, F3":

```bash
awk '/^model <ModelName>/,/^}/' apps/web/prisma/schema.prisma
```

**Expected shape.** The block from `model <Name> {` to the matching
`}`. Fields are one per line. Modifiers such as `@id`, `@unique`,
`@default(...)`, `@relation(...)` sit on the same line as the field.
Composite constraints are declared as `@@index([...])`, `@@unique
([...])`, `@@map("...")` inside the block.

**Full model count:**

```bash
grep -c '^model ' apps/web/prisma/schema.prisma
# expected: 42
```

**Schema length:**

```bash
wc -l apps/web/prisma/schema.prisma
# expected: about 1060 lines
```

---

## 3. How to verify a permission claim

A spec says "`<PERM>` is a permission key defined in
`packages/types/src/domain.ts`":

```bash
grep -n '<PERM>' packages/types/src/domain.ts
```

**Expected shape.** At least one match in the `Permission` enum, union
type, or const list. If the file to grep is different in a future refactor,
try:

```bash
grep -rn '<PERM>' packages/types/src/
```

The permission list is the source of truth for RBAC across the app;
`docs/rbac.md` mirrors it. If the two disagree, `packages/types/` wins.

---

## 4. How to verify a test count

A spec says "there are N tests":

```bash
find apps/web -name '*.test.*' -o -name '*.spec.*' -o -name '*.itest.*' \
  | grep -v node_modules | wc -l
# expected: 39 (10 unit .test.ts + 22 integration .itest.ts + 4 E2E
# .spec.ts + 3 lib/reports co-located .test.ts)
```

**By kind:**

```bash
find apps/web -name '*.test.*' -not -path '*/node_modules/*' \
  -not -path '*/e2e/*' -not -name '*.itest.*' | wc -l
# expected: about 13 (unit + lib/reports)

find apps/web -name '*.itest.*' -not -path '*/node_modules/*' | wc -l
# expected: 22 (integration)

find apps/web/e2e -name '*.spec.ts' | wc -l
# expected: 4 (admin-e2e, features-e2e, role-access, ui-smoke)
```

Note that `docs/13-TECH-DEBT.md` D-20 quotes 17 tests and `docs/MAP.md`
§6 quotes 10 + 22 + 4 = 36. The discrepancy is the `-o` predicate: D-20
does not count `.itest.ts` and undercounts the lib/reports files.
Re-derive at read time and trust the number the reader ran, not the one
the doc printed.

---

## 5. How to verify a dependency version

A spec says "package `<pkg>` is at version `<v>`":

```bash
jq '.dependencies["<pkg>"] // .devDependencies["<pkg>"]' \
  apps/web/package.json
```

**Expected shape.** A string like `"^14.2.0"` or `null` if absent.

**With pnpm's resolution:**

```bash
pnpm --filter @gearup/web why <pkg>
```

**Expected shape.** A tree showing every path in the workspace that
resolves the package, ending in the concrete resolved version. This is
what actually ships; the `package.json` string is the range, not the
lock. If the two disagree, `pnpm-lock.yaml` wins.

**All top-level deps:**

```bash
jq '.dependencies, .devDependencies' apps/web/package.json
```

---

## 6. How to verify PWA readiness

`docs/05-FRONTEND-SPEC.md` §7 rates PWA readiness "0 of 5":

```bash
ls apps/web/public/manifest.json apps/web/public/manifest.webmanifest \
  2>/dev/null
# expected at HEAD: no output (no manifest exists)

find apps/web -name 'sw.*' -o -name 'service-worker*' \
  -not -path '*/node_modules/*'
# expected at HEAD: no output (no service worker exists)
```

**If PWA has been added since:** the manifest lists at least `name`,
`short_name`, `start_url`, `display`, `icons` (192px and 512px), and a
service worker file lives under `apps/web/public/` or is generated by
`next-pwa` into `.next/`. When PWA is added, this recipe returns matches
and the "0 of 5" claim in `docs/05-FRONTEND-SPEC.md` needs a refresh.

---

## 7. How to verify the tx timeout convention

`docs/06-BACKEND-SPEC.md` §13.1 and `docs/13-TECH-DEBT.md` §4 both
describe a 30-second override on the four heaviest routes:

```bash
grep -rn '{ timeout: ' apps/web/src/app/api/
```

**Expected shape.** At least four matches, all `{ timeout: 30000 }`,
concentrated in `admin/invoices/[id]/finalize/route.ts`,
`admin/invoices/[id]/line-items/route.ts`,
`admin/invoices/[id]/payments/route.ts`, and one AMC handler.

**The client-level default:**

```bash
grep -n 'transactionOptions' apps/web/src/lib/prisma.ts
# expected: maxWait: 10000, timeout: 15000
```

If the four route-level overrides drop below 30000 or if the client
default is raised above 15000, the P2028 fix that PRs #58 and #59
institutionalised is being unwound and the doc set is out of date.

---

## 8. How to verify the current commit

Every spec doc's YAML frontmatter carries `verified_against: <sha>`.
Check that the tree has moved:

```bash
git rev-parse HEAD
# expected: a 40-char sha, e.g. dfb9bec098b598ecddefb1b3324ec18d882a1782
```

**Compare to a spec doc:**

```bash
grep -m1 verified_against docs/<file>.md
# expected: "verified_against: <sha>" in the YAML block
```

**Range from the spec's sha to HEAD:**

```bash
git log --oneline <spec-sha>..HEAD | wc -l
```

**Expected shape.** An integer number of commits between the spec's sha
and the current HEAD. Zero means the doc is current. Anything above zero
means at least one thing has changed since the doc was verified. Section
9 covers the threshold for calling that "stale."

---

## 9. Drift detection

A spec doc is a snapshot. The tree is not. A spec goes stale when the
tree has moved out from under it.

**The single command that answers "is this doc stale":**

```bash
DOC_SHA=$(grep -m1 verified_against docs/<file>.md \
  | awk '{print $2}')
git log --oneline "$DOC_SHA..HEAD" -- \
  apps/web/prisma/schema.prisma \
  apps/web/src/app/api/ \
  apps/web/src/lib/ \
  apps/web/package.json \
  | wc -l
```

**Expected shape.** An integer.

- **0:** the doc is current for the paths that matter.
- **1 to 20:** the doc is fresh; re-derive any load-bearing number before
  quoting it externally.
- **21 to 100:** the doc is drifting; re-derive the section you are
  about to quote before quoting it, and open a follow-up to refresh.
- **Over 100:** the doc is stale; refresh before use. Any number quoted
  from a stale doc without re-derivation is not verified for the purpose
  of RULE 1.

**Coarser check (any change in the tree):**

```bash
git log --oneline <DOC_SHA>..HEAD | wc -l
```

Use this only when the doc is a broad-scope reference (MAP.md, executive
summary). Prefer the path-scoped form for anything narrower.

---

## 10. Rebuild ownership

Which doc gets refreshed by whom when it goes stale. Ownership is a
convention, not a lockfile; the intent is that a stale doc has a name
attached, not that the named person is the only one who may fix it.

| Doc | Rebuild owner | Recipe |
|---|---|---|
| `docs/MAP.md` | Sagnik (souvikmusib) | Re-run every count in §2 against HEAD; regenerate §3 domain tables from `find apps/web/src/app -name page.tsx` and `find apps/web/src/app/api -name route.ts` |
| `docs/00-EXECUTIVE-SUMMARY.md` | Sagnik | Re-run every command in the doc's own Method block against HEAD; refresh §5's PR list from `git log --oneline main | grep -oE '#[0-9]+' | head -30` |
| `docs/01-PRODUCT-AND-DOMAIN.md` | Sagnik | Product intent rarely drifts; refresh when a new module lands. Cross-check against `docs/rbac.md` and `docs/notifications.md`. |
| `docs/03-DATA-MODEL.md` | Sagnik | Re-run `grep -c '^model '`, `wc -l apps/web/prisma/schema.prisma`, and `grep -c '@@index\|@index'` at HEAD |
| `docs/04-API-REFERENCE.md` | Sagnik | Re-run the 83-route count; refresh any handler section whose file mtime is newer than the doc's `verified_against` sha |
| `docs/05-FRONTEND-SPEC.md` | Sagnik | Re-run the PWA readiness check (§6 above), the page count, and the component count |
| `docs/06-BACKEND-SPEC.md` | Sagnik | Re-run the Zod-parse audit (§5.1), the transaction-timeout audit (§7 above), and the `as any` count |
| `docs/07-INTEGRATIONS.md` | Sagnik and Arnab (joint) | Refresh whenever an env var is added, removed, or repurposed; the WhatsApp adapter status here is load-bearing for external claims |
| `docs/09-ENVIRONMENT.md` | Sagnik and Arnab (joint) | Cross-check every env var in the doc against `apps/web/src/**/*.ts` grep for `process.env.<VAR>` |
| `docs/10-LOCAL-SETUP.md` | Sagnik | Re-run the setup end-to-end on a fresh clone every quarter |
| `docs/11-DEPLOYMENT.md` | Sagnik | Re-verify against `apps/web/vercel.json` and against the Vercel dashboard; the latter is out of scope for the read-only doc pass and must be done live |
| `docs/12-SECURITY-REVIEW.md` | Sagnik | Re-run the middleware audit, the Zod-parse audit, and the `as any` count; refresh after any auth change |
| `docs/13-TECH-DEBT.md` | Sagnik | Re-run every command in the doc's own Method block at HEAD; correct D-2 (CI does exist at HEAD, see §1.4 of `docs/CRITIQUE.md`) |
| `docs/14-TESTING.md` | Sagnik | Re-run the counts in §4 above |
| `docs/15-GLOSSARY.md` | Sagnik | Refresh when a new domain term lands in `packages/types/src/domain.ts` |
| `docs/17-CODEMAP.md` | Sagnik | Re-run the file counts in `docs/MAP.md` §2 and reflect any moves |
| `docs/29-RUNBOOK.md` | Sagnik and Arnab (joint) | Refresh whenever an on-call routine changes; a runbook a two-person team keeps stale is a runbook nobody uses |

**Rebuild trigger.** A doc is up for rebuild when any of:

1. Section 9's drift check on the doc's `verified_against` sha returns
   more than 100 commits.
2. A hostile reviewer names a claim in the doc as unverified in the last
   week and the recipe here cannot reproduce it.
3. The team ships a schema change, an auth change, or an env var change
   without updating the affected doc in the same PR.

**Rebuild output.** The rebuild is not a partial edit. The doc's YAML
frontmatter's `verified_against` sha is bumped to the sha under which the
rebuild ran; every command in the doc's own Method block is re-run and
the numbers refreshed; the "Did NOT do" block is refreshed to reflect
what this pass did not touch. A refresh that does not bump the sha is not
a refresh.

---

## 11. The one recipe that catches half the drift

If a reader has time for only one command, run this:

```bash
git rev-parse HEAD && \
for f in docs/00-EXECUTIVE-SUMMARY.md docs/03-DATA-MODEL.md \
         docs/04-API-REFERENCE.md docs/06-BACKEND-SPEC.md \
         docs/13-TECH-DEBT.md docs/MAP.md; do
  printf "%-40s %s\n" "$f" \
    "$(grep -m1 verified_against "$f" | awk '{print $2}')"
done
```

**Expected shape.** A single sha at the top, then six lines mapping doc
paths to the sha each was verified against. Every sha should be within
100 commits of HEAD per `git log --oneline <sha>..HEAD | wc -l`. Any doc
whose sha is further out is on the stale list and should be re-derived
before its numbers are used.
