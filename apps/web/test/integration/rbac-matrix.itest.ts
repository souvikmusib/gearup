import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { asRole, asRawToken, clearAuth, req, invoke, ensureSeedAdmin, resetDb, prisma } from './helpers';
import jwt from 'jsonwebtoken';
import { GET as listCustomers } from '@/app/api/admin/customers/route';
import { GET as listInventory } from '@/app/api/admin/inventory/items/route';
import { GET as listExpenses } from '@/app/api/admin/expenses/route';
import { GET as getSettings } from '@/app/api/admin/settings/route';
import { GET as listInvoices } from '@/app/api/admin/invoices/route';
import { GET as listAdmins } from '@/app/api/admin/settings/admins/route';

/**
 * RBAC matrix: each role must be allowed on its routes and forbidden elsewhere.
 * Driven off the code's ROLE_PERMISSIONS so it stays honest as the map evolves.
 */
describe('RBAC matrix (integration)', () => {
  beforeAll(async () => { await resetDb(); await ensureSeedAdmin(); });
  beforeEach(() => clearAuth());

  const cases: Array<[string, any, string, Record<string, 200 | 403>]> = [
    ['customers', listCustomers, '/api/admin/customers', { SUPER_ADMIN: 200, RECEPTIONIST: 200, MECHANIC: 403, INVENTORY_MANAGER: 200 }],
    // MECHANIC has inventory.view by design (sees parts on the floor).
    ['inventory', listInventory, '/api/admin/inventory/items', { SUPER_ADMIN: 200, INVENTORY_MANAGER: 200, MECHANIC: 200, RECEPTIONIST: 200 }],
    ['expenses', listExpenses, '/api/admin/expenses', { SUPER_ADMIN: 200, MECHANIC: 403, INVENTORY_MANAGER: 403 }],
    ['settings', getSettings, '/api/admin/settings', { SUPER_ADMIN: 200, MECHANIC: 403, RECEPTIONIST: 403 }],
    ['invoices', listInvoices, '/api/admin/invoices', { SUPER_ADMIN: 200, MECHANIC: 403, INVENTORY_MANAGER: 200 }],
    ['admins-mgmt', listAdmins, '/api/admin/settings/admins', { SUPER_ADMIN: 200, RECEPTIONIST: 403, MECHANIC: 403 }],
  ];

  for (const [name, handler, path, expected] of cases) {
    for (const [role, want] of Object.entries(expected)) {
      it(`${role} → ${name} expects ${want}`, async () => {
        asRole(role as any);
        const { status } = await invoke(handler, req('GET', path));
        // Allowed roles must be exactly 200; denied roles must be 403 (never 200, never 500).
        if (want === 200) expect(status).toBe(200);
        else { expect(status).toBe(403); }
      });
    }
  }

  it('an expired token is rejected with 401', async () => {
    const expired = jwt.sign({ sub: 'x', adminUserId: 'x', roles: ['SUPER_ADMIN'], permissions: ['customers.view'] }, process.env.JWT_SECRET as string, { expiresIn: -10 });
    asRawToken(expired);
    const { status } = await invoke(listCustomers, req('GET', '/api/admin/customers'));
    expect(status).toBe(401);
  });

  it('a token signed with the WRONG secret is rejected with 401', async () => {
    const forged = jwt.sign({ sub: 'x', adminUserId: 'x', roles: ['SUPER_ADMIN'], permissions: ['customers.view'] }, 'totally-wrong-secret-0123456789', { expiresIn: '1h' });
    asRawToken(forged);
    const { status } = await invoke(listCustomers, req('GET', '/api/admin/customers'));
    expect(status).toBe(401);
  });

  it('a token with empty permissions is forbidden (no implicit access)', async () => {
    const noperm = jwt.sign({ sub: 'x', adminUserId: 'x', roles: [], permissions: [] }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
    asRawToken(noperm);
    const { status } = await invoke(listCustomers, req('GET', '/api/admin/customers'));
    expect(status).toBe(403);
  });
});
