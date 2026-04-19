import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ROLES, PERMISSIONS, ROLE_PERMISSIONS, type RoleKey } from '@gearup/types';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create permissions
  const permEntries = Object.entries(PERMISSIONS);
  for (const [, key] of permEntries) {
    const mod = key.split('.')[0];
    await prisma.permission.upsert({
      where: { key },
      create: { key, module: mod, name: key },
      update: {},
    });
  }
  console.log(`  ✓ ${permEntries.length} permissions`);

  // 2. Create roles
  const roleEntries = Object.entries(ROLES);
  for (const [, key] of roleEntries) {
    await prisma.role.upsert({
      where: { key },
      create: { key, name: key.replace(/_/g, ' ') },
      update: {},
    });
  }
  console.log(`  ✓ ${roleEntries.length} roles`);

  // 3. Link role permissions
  for (const [roleKey, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    for (const permKey of perms) {
      const perm = await prisma.permission.findUniqueOrThrow({ where: { key: permKey } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        create: { roleId: role.id, permissionId: perm.id },
        update: {},
      });
    }
  }
  console.log('  ✓ Role-permission mappings');

  // 4. Create default super admin
  const hash = await bcrypt.hash('admin123', 12);
  const admin = await prisma.adminUser.upsert({
    where: { adminUserId: 'superadmin' },
    create: { adminUserId: 'superadmin', fullName: 'Super Admin', email: 'admin@gearupservicing.com', passwordHash: hash },
    update: {},
  });
  const superRole = await prisma.role.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
  await prisma.adminUserRole.upsert({
    where: { adminUserId_roleId: { adminUserId: admin.id, roleId: superRole.id } },
    create: { adminUserId: admin.id, roleId: superRole.id },
    update: {},
  });
  console.log('  ✓ Default super admin (superadmin / admin123) — CHANGE PASSWORD IMMEDIATELY');

  // 5. Default appointment slot rules (Mon-Sat, 9am-6pm, 30min slots)
  for (let day = 1; day <= 6; day++) {
    await prisma.appointmentSlotRule.upsert({
      where: { id: `default-day-${day}` },
      create: { id: `default-day-${day}`, dayOfWeek: day, openTime: '09:00', closeTime: '18:00', slotDurationMinutes: 30, maxCapacity: 8 },
      update: {},
    });
  }
  console.log('  ✓ Default slot rules (Mon-Sat 9am-6pm)');

  // 6. Default settings
  const defaults: Record<string, unknown> = {
    'business.name': 'GearUp Servicing',
    'business.phone': '+91-XXXXXXXXXX',
    'business.email': 'info@gearupservicing.com',
    'business.timezone': 'Asia/Kolkata',
    'invoice.prefix': 'INV',
    'invoice.taxLabel': 'GST',
    'notifications.whatsapp.enabled': false,
    'notifications.email.enabled': false,
  };
  for (const [key, value] of Object.entries(defaults)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value: value as any }, update: {} });
  }
  console.log('  ✓ Default settings');

  // 7. Default expense categories
  for (const name of ['Rent', 'Utilities', 'Salaries', 'Parts Purchase', 'Equipment', 'Marketing', 'Miscellaneous']) {
    await prisma.expenseCategory.upsert({ where: { categoryName: name }, create: { categoryName: name }, update: {} });
  }
  console.log('  ✓ Default expense categories');

  // 8. Default inventory categories
  for (const name of ['Engine Parts', 'Brake System', 'Electrical', 'Filters', 'Lubricants', 'Body Parts', 'Tyres', 'Accessories', 'Consumables']) {
    await prisma.inventoryCategory.upsert({ where: { categoryName: name }, create: { categoryName: name }, update: {} });
  }
  console.log('  ✓ Default inventory categories');

  console.log('✅ Seed complete');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
