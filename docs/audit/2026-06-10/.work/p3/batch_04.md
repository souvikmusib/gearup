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


## Target: `apps/web/src/app/admin/settings/admins/page.tsx` (1 findings)

### [P3] Admin users table has 5 columns but only 4 headers (Edit cell has no header)
- id: `service-request-detail-row-key-missing` · cat: ux
- loc: `apps/web/src/app/admin/settings/admins/page.tsx:47-67`
- evidence:
```
<thead ...><tr>
  <th ...>Admin</th>
  <th ...>Role</th>
  <th ...>Status</th>
  <th ...>Last Login</th>
</tr></thead>
<tbody>
  {data.map((admin) => (<tr key={admin.id}>
    <td>...<td>...<td>...<td>...
    <td ...><button onClick={() => { setEditUser(admin); ... }} className="text-xs text-blue-600 hover:underline">Edit</button></td>
```
- impact: Misaligned table header/body — minor visual bug, screen readers will mis-associate the Edit button column.
- fix: Add an empty `<th>` for the Edit column.

---

## Target: `apps/web/src/app/admin/vehicles/page.tsx` (1 findings)

### [P3] Vehicles list search fires on every keystroke (no debounce)
- id: `vehicles-search-no-debounce` · cat: performance
- loc: `apps/web/src/app/admin/vehicles/page.tsx:73`
- evidence:
```
<input ... onChange={(e) => { setSearch(e.target.value); load(e.target.value); }} />
```
- impact: Every keystroke hits /api/admin/vehicles. Customers page debounces 300ms (correctly) — vehicles page does not. Burns server, flicker UI.
- fix: Mirror the customers/page.tsx debounce pattern with a `useRef<NodeJS.Timeout>` 300ms timer.

---

## Target: `apps/web/src/app/api/admin/amc/contracts/[id]/route.ts` (1 findings)

### [P3] AMC use form has client-side disable but no server min(1) on optional fields
- id: `empty-string-jobcardid-bypass` · cat: validation
- loc: `apps/web/src/app/api/admin/amc/contracts/[id]/route.ts:51-55`
- evidence:
```
const body = z.object({ jobCardId: z.string().min(1), serviceDate: z.string().optional(), notes: z.string().optional() }).parse(await req.json());
```
- impact: jobCardId is correctly guarded but `serviceDate: z.string().optional()` accepts any string; `new Date('garbage')` → Invalid Date → stored as 1970-01-01 in many drivers. Cosmetic but tarnishes reports.
- fix: `serviceDate: z.string().datetime().optional()` or coerce + validate.

---

## Target: `apps/web/src/app/api/admin/amc/contracts/route.ts` (1 findings)

### [P3] AMC contracts list has no search / customer filter — only status
- id: `amc-contracts-list-no-search` · cat: ux
- loc: `apps/web/src/app/api/admin/amc/contracts/route.ts:20-42`
- evidence:
```
const status = sp.get('status') || undefined;
const p = paginate({ page, pageSize });
const where = status ? { status: status as any } : {};
```
- impact: Operators on a busy day can't find a contract by customer phone or reg number; must page through 20-at-a-time. UX friction.
- fix: Accept `search` and OR filter on customer.fullName, customer.phoneNumber, vehicle.registrationNumber, contractNumber.

---

## Target: `apps/web/src/app/api/admin/amc/plans/[id]/route.ts` (1 findings)

### [P3] AmcPlan DELETE blocks on any contract, but no soft-archive/restore
- id: `plan-delete-no-block-active-contract` · cat: tech-debt
- loc: `apps/web/src/app/api/admin/amc/plans/[id]/route.ts:38-47`
- evidence:
```
const contracts = await prisma.amcContract.count({ where: { amcPlanId: params.id } });
if (contracts > 0) { return NextResponse.json({ ... 'Deactivate instead.' }, { status: 409 }); }
await prisma.amcPlan.delete({ where: { id: params.id } });
```
- impact: Once a plan ever has a contract it can never be deleted, even after all contracts are archived. There's no archivedAt on AmcPlan. Mild data-debt.
- fix: Use isActive flag (already exists) as canonical 'archived' state; remove DELETE entirely or restrict to plans with zero contracts ever, which is what's done — acceptable but document.