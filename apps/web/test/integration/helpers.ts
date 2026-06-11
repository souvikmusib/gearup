/**
 * Integration-test helpers: real Prisma against the ephemeral test DB, a JWT
 * minter wired to the next/headers mock, a NextRequest builder, and seed/reset
 * utilities. Route handlers are invoked directly as functions.
 */
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { ROLE_PERMISSIONS, type RoleKey } from '@gearup/types';
import { prisma } from '../../src/lib/prisma';

export { prisma };

const SEED_ADMIN_ID = 'itest-admin-0000000000000000';

/** Mint a JWT for a role and arm the next/headers mock to present it. */
export function asRole(role: RoleKey, sub = SEED_ADMIN_ID): string {
  const token = jwt.sign(
    { sub, adminUserId: 'itest-admin', roles: [role], permissions: ROLE_PERMISSIONS[role] },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' },
  );
  (globalThis as Record<string, unknown>).__TEST_AUTH_TOKEN__ = token;
  return token;
}

/** Mint a token with an explicit permission list (for negative RBAC tests). */
export function asPermissions(permissions: string[], sub = SEED_ADMIN_ID): string {
  const token = jwt.sign(
    { sub, adminUserId: 'itest-admin', roles: [], permissions },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' },
  );
  (globalThis as Record<string, unknown>).__TEST_AUTH_TOKEN__ = token;
  return token;
}

/** Present a token string verbatim (e.g. an expired or stale-sub token). */
export function asRawToken(token: string | undefined) {
  (globalThis as Record<string, unknown>).__TEST_AUTH_TOKEN__ = token;
}

export function clearAuth() {
  (globalThis as Record<string, unknown>).__TEST_AUTH_TOKEN__ = undefined;
}

type Json = Record<string, unknown> | unknown[] | undefined;

/** Build a NextRequest for a route handler. */
export function req(
  method: string,
  url: string,
  body?: Json,
): NextRequest {
  const full = url.startsWith('http') ? url : `http://localhost${url}`;
  return new NextRequest(full, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Invoke a route handler and return { status, body }. Handler typed loosely
 *  because Next route handlers have heterogeneous (req, { params }) signatures. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function invoke(
  handler: (...args: any[]) => Promise<Response>,
  request: NextRequest,
  params?: Record<string, string>,
): Promise<{ status: number; body: any }> {
  const res = await handler(request, params ? { params } : undefined);
  let body: unknown = undefined;
  try {
    body = await res.json();
  } catch {
    /* non-JSON (e.g. PDF) */
  }
  return { status: res.status, body };
}

/** Ensure the seed admin exists so logActivity/createdBy FKs resolve. */
export async function ensureSeedAdmin() {
  await prisma.adminUser.upsert({
    where: { id: SEED_ADMIN_ID },
    create: {
      id: SEED_ADMIN_ID,
      adminUserId: 'itest-admin',
      fullName: 'Integration Test Admin',
      passwordHash: 'x',
    },
    update: {},
  });
}

/** Truncate all business tables between suites for isolation. */
export async function resetDb() {
  const tables = [
    'ActivityLog', 'Payment', 'InvoiceLineItem', 'Invoice', 'WorkerAssignment',
    'JobCardTask', 'JobCardPart', 'JobCard', 'AmcServiceUsage', 'AmcContract',
    'Appointment', 'ServiceRequest', 'StockMovement', 'InventoryItem',
    'InventoryCategory', 'Supplier', 'Expense', 'ExpenseCategory', 'WorkerLeave',
    'Worker', 'Vehicle', 'Customer', 'AmcPlan', 'BlockedSlot', 'Holiday',
    'AppointmentSlotRule', 'NotificationTemplate', 'Notification', 'Setting',
    'AdminUserRole', 'RolePermission', 'Permission', 'Role', 'AdminUser',
  ];
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`,
  );
}

export { SEED_ADMIN_ID };

/** Convenience seeders returning ids for chaining. */
export const seed = {
  async customer(over: Partial<{ fullName: string; phoneNumber: string }> = {}) {
    return prisma.customer.create({
      data: { fullName: over.fullName ?? 'Seed Cust', phoneNumber: over.phoneNumber ?? `9${Math.floor(Math.random() * 1e9)}` },
    });
  },
  async vehicle(customerId: string, over: Partial<{ registrationNumber: string }> = {}) {
    return prisma.vehicle.create({
      data: {
        customerId,
        vehicleType: 'BIKE',
        registrationNumber: over.registrationNumber ?? `WB-99-Z-${Math.floor(Math.random() * 9999)}`,
        brand: 'Seed',
        model: 'Bike',
      },
    });
  },
  async worker(over: Partial<{ fullName: string }> = {}) {
    return prisma.worker.create({
      data: { fullName: over.fullName ?? 'Seed Worker', workerCode: `WRK-${Math.floor(Math.random() * 1e6)}` },
    });
  },
  async category() {
    return prisma.inventoryCategory.create({ data: { categoryName: `Cat ${Math.random()}` } });
  },
  async item(categoryId: string, over: Partial<{ sku: string; quantityInStock: number; sellingPrice: number }> = {}) {
    return prisma.inventoryItem.create({
      data: {
        sku: over.sku ?? `SKU-${Math.floor(Math.random() * 1e9)}`,
        itemName: 'Seed Item',
        categoryId,
        unit: 'PIECE',
        quantityInStock: over.quantityInStock ?? 100,
        sellingPrice: over.sellingPrice ?? 100,
      },
    });
  },
};
