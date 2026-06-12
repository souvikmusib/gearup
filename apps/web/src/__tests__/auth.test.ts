import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next/headers before importing auth
vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

import { headers } from 'next/headers';
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'test-secret-at-least-16-chars';

// Mock getJwtSecret
vi.mock('../lib/jwt-secret', () => ({
  getJwtSecret: () => TEST_SECRET,
}));

import { getAuthToken, verifyAuth, requirePermission, requireAnyPermission } from '../lib/auth';
import { UnauthorizedError, ForbiddenError } from '../lib/errors';

function mockHeaders(authHeader: string | null) {
  (headers as any).mockReturnValue({
    get: (key: string) => (key === 'authorization' ? authHeader : null),
  });
}

function createToken(payload: object) {
  return jwt.sign(payload, TEST_SECRET, { expiresIn: '1h' });
}

describe('getAuthToken', () => {
  it('extracts token from Bearer header', () => {
    mockHeaders('Bearer my-token-123');
    expect(getAuthToken()).toBe('my-token-123');
  });

  it('throws UnauthorizedError when no header', () => {
    mockHeaders(null);
    expect(() => getAuthToken()).toThrow(UnauthorizedError);
  });

  it('throws UnauthorizedError for non-Bearer scheme', () => {
    mockHeaders('Basic abc123');
    expect(() => getAuthToken()).toThrow(UnauthorizedError);
  });
});

describe('verifyAuth', () => {
  it('returns decoded payload for valid token', () => {
    const token = createToken({ sub: 'user1', adminUserId: 'admin', roles: ['ADMIN'], permissions: ['dashboard.view'] });
    mockHeaders(`Bearer ${token}`);
    const payload = verifyAuth();
    expect(payload.sub).toBe('user1');
    expect(payload.adminUserId).toBe('admin');
    expect(payload.permissions).toContain('dashboard.view');
  });

  it('throws UnauthorizedError for expired token', () => {
    const token = jwt.sign({ sub: 'user1', permissions: [] }, TEST_SECRET, { expiresIn: '-1h' });
    mockHeaders(`Bearer ${token}`);
    expect(() => verifyAuth()).toThrow(UnauthorizedError);
  });

  it('throws UnauthorizedError for tampered token', () => {
    const token = jwt.sign({ sub: 'user1', permissions: [] }, 'wrong-secret-wrong-secret');
    mockHeaders(`Bearer ${token}`);
    expect(() => verifyAuth()).toThrow(UnauthorizedError);
  });
});

describe('requirePermission (AND logic)', () => {
  it('passes when user has all required permissions', () => {
    const token = createToken({ sub: 'u1', adminUserId: 'a', roles: ['ADMIN'], permissions: ['invoices.view', 'invoices.create'] });
    mockHeaders(`Bearer ${token}`);
    const user = requirePermission('invoices.view' as any, 'invoices.create' as any);
    expect(user.sub).toBe('u1');
  });

  it('throws ForbiddenError when missing a permission', () => {
    const token = createToken({ sub: 'u1', adminUserId: 'a', roles: ['MECHANIC'], permissions: ['dashboard.view'] });
    mockHeaders(`Bearer ${token}`);
    expect(() => requirePermission('invoices.view' as any)).toThrow(ForbiddenError);
  });
});

describe('requireAnyPermission (OR logic)', () => {
  it('passes when user has at least one required permission', () => {
    const token = createToken({ sub: 'u1', adminUserId: 'a', roles: ['MECHANIC'], permissions: ['dashboard.view', 'inventory.view'] });
    mockHeaders(`Bearer ${token}`);
    const user = requireAnyPermission('invoices.view' as any, 'inventory.view' as any);
    expect(user.sub).toBe('u1');
  });

  it('throws ForbiddenError when user has none of the required permissions', () => {
    const token = createToken({ sub: 'u1', adminUserId: 'a', roles: ['MECHANIC'], permissions: ['dashboard.view'] });
    mockHeaders(`Bearer ${token}`);
    expect(() => requireAnyPermission('invoices.view' as any, 'invoices.create' as any)).toThrow(ForbiddenError);
  });
});
