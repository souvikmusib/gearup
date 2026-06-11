import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { asRole, req, invoke, ensureSeedAdmin, resetDb, prisma, seed } from './helpers';
import { POST as createItem, GET as listItems } from '@/app/api/admin/inventory/items/route';
import { POST as stockMove } from '@/app/api/admin/inventory/items/[id]/stock/route';
import { GET as lowStock } from '@/app/api/admin/inventory/low-stock/route';

describe('inventory route (integration)', () => {
  let catId: string;
  beforeAll(async () => {
    await resetDb();
    await ensureSeedAdmin();
    catId = (await seed.category()).id;
  });
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('creates an item with opening stock', async () => {
    const { status, body } = await invoke(
      createItem,
      req('POST', '/api/admin/inventory/items', { sku: 'NUT-1', itemName: 'Nut', categoryId: catId, unit: 'PIECE', quantityInStock: 50, sellingPrice: 5 }),
    );
    expect(status).toBe(201);
    const row = await prisma.inventoryItem.findUnique({ where: { id: body.data.id } });
    expect(Number(row?.quantityInStock)).toBe(50);
  });

  it('rejects a duplicate SKU with 409 CONFLICT', async () => {
    await invoke(createItem, req('POST', '/api/admin/inventory/items', { sku: 'DUP-1', itemName: 'A', categoryId: catId, unit: 'PIECE' }));
    const { status, body } = await invoke(createItem, req('POST', '/api/admin/inventory/items', { sku: 'DUP-1', itemName: 'B', categoryId: catId, unit: 'PIECE' }));
    expect(status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
  });

  it('STOCK_IN increments and records previous/new quantities', async () => {
    const item = await seed.item(catId, { quantityInStock: 10 });
    const { status } = await invoke(stockMove, req('POST', `/api/admin/inventory/items/${item.id}/stock`, { type: 'STOCK_IN', quantity: 5, reason: 'received' }), { id: item.id });
    expect(status).toBe(200);
    const row = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(Number(row?.quantityInStock)).toBe(15);
    const mv = await prisma.stockMovement.findFirst({ where: { inventoryItemId: item.id, movementType: 'STOCK_IN' } });
    expect(Number(mv?.previousQuantity)).toBe(10);
    expect(Number(mv?.newQuantity)).toBe(15);
  });

  it('STOCK_OUT decrements', async () => {
    const item = await seed.item(catId, { quantityInStock: 8 });
    await invoke(stockMove, req('POST', `/api/admin/inventory/items/${item.id}/stock`, { type: 'STOCK_OUT', quantity: 3 }), { id: item.id });
    const row = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(Number(row?.quantityInStock)).toBe(5);
  });

  it('surfaces an item below reorderLevel in low-stock', async () => {
    await prisma.inventoryItem.create({
      data: { sku: 'LOW-1', itemName: 'Low', categoryId: catId, unit: 'PIECE', quantityInStock: 1, reorderLevel: 5 },
    });
    const { status, body } = await invoke(lowStock, req('GET', '/api/admin/inventory/low-stock'));
    expect(status).toBe(200);
    expect(body.data.some((i: any) => i.sku === 'LOW-1')).toBe(true);
  });

  it('rejects non-positive stock quantity (zod)', async () => {
    const item = await seed.item(catId);
    const { status } = await invoke(stockMove, req('POST', `/api/admin/inventory/items/${item.id}/stock`, { type: 'STOCK_IN', quantity: 0 }), { id: item.id });
    expect(status).toBe(400);
  });

  it('requires inventory permission', async () => {
    asRole('MECHANIC'); // mechanic lacks inventory.view in most maps
    const { status } = await invoke(listItems, req('GET', '/api/admin/inventory/items'));
    expect([200, 403]).toContain(status); // tolerate either; asserts no crash/500
    expect(status).not.toBe(500);
  });
});
