/**
 * One-time sync script: populates the RolePermission table from the
 * in-memory ROLE_PERMISSIONS map so the Roles UI shows correct checkboxes.
 *
 * Safe to run multiple times (uses upsert). Does NOT remove existing
 * permissions that aren't in the map — only adds missing ones.
 *
 * Also ensures all Permission keys from the PERMISSIONS constant exist
 * in the Permission table (creates missing ones).
 *
 * Usage:
 *   npx tsx scripts/sync-role-permissions.ts
 */

import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, ROLE_PERMISSIONS } from '@gearup/types';

const prisma = new PrismaClient();

function moduleFromKey(key: string): string {
  // e.g. 'dashboard.view' → 'dashboard', 'job-cards.create' → 'job-cards'
  return key.split('.')[0];
}

function nameFromKey(key: string): string {
  // e.g. 'dashboard.view' → 'Dashboard View', 'job-cards.assign-workers' → 'Job Cards Assign Workers'
  return key
    .split('.')
    .join(' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function main() {
  console.log('🔄 Syncing permissions and role-permission mappings...\n');

  // Step 1: Ensure all Permission records exist
  const allPermValues = Object.values(PERMISSIONS);
  console.log(`📋 Ensuring ${allPermValues.length} permissions exist in DB...`);

  const permMap = new Map<string, string>(); // permKey → permId
  for (const key of allPermValues) {
    const perm = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, module: moduleFromKey(key), name: nameFromKey(key) },
    });
    permMap.set(key, perm.id);
  }
  console.log(`   ✅ ${permMap.size} permissions in DB\n`);

  // Step 2: Ensure all Roles exist
  const roleKeys = Object.keys(ROLE_PERMISSIONS) as Array<keyof typeof ROLE_PERMISSIONS>;
  console.log(`👥 Syncing ${roleKeys.length} roles...`);

  for (const roleKey of roleKeys) {
    const role = await prisma.role.upsert({
      where: { key: roleKey },
      update: {},
      create: { key: roleKey, name: roleKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) },
    });

    const permKeys = ROLE_PERMISSIONS[roleKey];
    let added = 0;

    for (const permKey of permKeys) {
      const permId = permMap.get(permKey);
      if (!permId) {
        console.warn(`   ⚠️  Permission "${permKey}" not found for role "${roleKey}"`);
        continue;
      }
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permId } },
        update: {},
        create: { roleId: role.id, permissionId: permId },
      });
      added++;
    }

    console.log(`   ✅ ${roleKey}: ${added}/${permKeys.length} permissions linked`);
  }

  console.log('\n🎉 Sync complete! Roles UI should now show correct checkboxes.');
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
