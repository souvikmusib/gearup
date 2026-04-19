import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Create roles
  const superAdmin = await prisma.role.upsert({
    where: { key: 'SUPER_ADMIN' },
    update: {},
    create: { key: 'SUPER_ADMIN', name: 'Super Admin', description: 'Full system access' },
  });

  // Create admin user
  const passwordHash = await bcrypt.hash('admin123', 12);
  const admin = await prisma.adminUser.upsert({
    where: { adminUserId: 'admin' },
    update: {},
    create: {
      adminUserId: 'admin',
      fullName: 'System Admin',
      email: 'admin@gearup.local',
      passwordHash,
    },
  });

  // Assign role
  await prisma.adminUserRole.upsert({
    where: { adminUserId_roleId: { adminUserId: admin.id, roleId: superAdmin.id } },
    update: {},
    create: { adminUserId: admin.id, roleId: superAdmin.id },
  });

  console.log('Seeded admin user: admin / admin123');
}

main().catch(console.error).finally(() => prisma.$disconnect());
