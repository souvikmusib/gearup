import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { asRole, asRawToken, req, invoke, ensureSeedAdmin, resetDb, prisma } from './helpers';
import { POST as login } from '@/app/api/admin/auth/login/route';
import { GET as me } from '@/app/api/admin/auth/me/route';
import { POST as changePassword } from '@/app/api/admin/auth/change-password/route';
import { MAX_LOGIN_ATTEMPTS } from '@/lib/constants';

describe('auth (integration)', () => {
  beforeAll(async () => {
    await resetDb();
    await ensureSeedAdmin();
    await prisma.adminUser.create({
      data: { adminUserId: 'loginuser', fullName: 'Login User', passwordHash: await bcrypt.hash('correct-horse', 12) },
    });
  });

  it('logs in with correct credentials', async () => {
    const { status, body } = await invoke(login, req('POST', '/api/admin/auth/login', { adminUserId: 'loginuser', password: 'correct-horse' }));
    expect(status).toBe(200);
    expect(body.data?.token || body.token).toBeTruthy();
  });

  it('rejects a wrong password and increments failedLoginAttempts', async () => {
    const before = (await prisma.adminUser.findUnique({ where: { adminUserId: 'loginuser' } }))!.failedLoginAttempts;
    const { status } = await invoke(login, req('POST', '/api/admin/auth/login', { adminUserId: 'loginuser', password: 'nope' }));
    expect(status).toBe(401);
    const after = (await prisma.adminUser.findUnique({ where: { adminUserId: 'loginuser' } }))!.failedLoginAttempts;
    expect(after).toBe(before + 1);
  });

  it('locks the account after MAX_LOGIN_ATTEMPTS and then refuses even the right password', async () => {
    await prisma.adminUser.update({ where: { adminUserId: 'loginuser' }, data: { failedLoginAttempts: 0, status: 'ACTIVE', lockedUntil: null } });
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) {
      await invoke(login, req('POST', '/api/admin/auth/login', { adminUserId: 'loginuser', password: 'wrong' }));
    }
    const locked = await prisma.adminUser.findUnique({ where: { adminUserId: 'loginuser' } });
    expect(locked!.status).toBe('LOCKED');
    const { status } = await invoke(login, req('POST', '/api/admin/auth/login', { adminUserId: 'loginuser', password: 'correct-horse' }));
    expect(status).toBe(401);
    // unlock for later tests
    await prisma.adminUser.update({ where: { adminUserId: 'loginuser' }, data: { failedLoginAttempts: 0, status: 'ACTIVE', lockedUntil: null } });
  });

  it('returns the current user from /me with a valid token', async () => {
    asRole('SUPER_ADMIN');
    const { status, body } = await invoke(me, req('GET', '/api/admin/auth/me'));
    expect(status).toBe(200);
    expect(body.data?.adminUserId || body.adminUserId || body.data).toBeTruthy();
  });

  it('rejects /me without a token', async () => {
    asRawToken(undefined);
    const { status } = await invoke(me, req('GET', '/api/admin/auth/me'));
    expect(status).toBe(401);
  });

  it('rejects /me with a garbage token', async () => {
    asRawToken('not.a.jwt');
    const { status } = await invoke(me, req('GET', '/api/admin/auth/me'));
    expect(status).toBe(401);
  });

  it('change-password rejects a wrong current password', async () => {
    const u = await prisma.adminUser.create({ data: { adminUserId: 'pwuser', fullName: 'PW', passwordHash: await bcrypt.hash('oldpass1', 12) } });
    asRole('SUPER_ADMIN', u.id);
    const { status } = await invoke(changePassword, req('POST', '/api/admin/auth/change-password', { currentPassword: 'WRONG', newPassword: 'BrandNew#123' }));
    expect(status).toBe(401);
  });

  it('change-password succeeds with the correct current password', async () => {
    const u = await prisma.adminUser.create({ data: { adminUserId: 'pwuser2', fullName: 'PW2', passwordHash: await bcrypt.hash('oldpass2', 12) } });
    asRole('SUPER_ADMIN', u.id);
    const { status } = await invoke(changePassword, req('POST', '/api/admin/auth/change-password', { currentPassword: 'oldpass2', newPassword: 'BrandNew#123' }));
    expect(status).toBe(200);
    const updated = await prisma.adminUser.findUnique({ where: { id: u.id } });
    expect(await bcrypt.compare('BrandNew#123', updated!.passwordHash)).toBe(true);
  });
});
