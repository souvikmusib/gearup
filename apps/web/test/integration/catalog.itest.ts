import { describe, it, expect, beforeAll } from 'vitest';
import { prisma, asRole, req, invoke, ensureSeedAdmin, seed } from './helpers';
import { GET as catalogGet } from '../../src/app/api/admin/inventory/catalog/route';
import { GET as itemsGet, POST as itemsPost } from '../../src/app/api/admin/inventory/items/route';
import { GET as itemGet, PATCH as itemPatch } from '../../src/app/api/admin/inventory/items/[id]/route';

describe('Inventory Catalog API', () => {
  let brandId: string;
  let model1Id: string;
  let model2Id: string;
  let categoryId: string;
  let itemId: string;

  beforeAll(async () => {
    await ensureSeedAdmin();
    asRole('SUPER_ADMIN');

    // Create test brand + models
    const brand = await prisma.vehicleBrand.create({ data: { name: `TestBrand-${Date.now()}` } });
    brandId = brand.id;
    const m1 = await prisma.vehicleModel.create({ data: { brandId, name: 'Model A', engineCC: 150 } });
    const m2 = await prisma.vehicleModel.create({ data: { brandId, name: 'Model B', engineCC: 200 } });
    model1Id = m1.id;
    model2Id = m2.id;

    // Create category + item linked to model1
    const cat = await seed.category();
    categoryId = cat.id;
    const item = await prisma.inventoryItem.create({
      data: { sku: `CAT-TEST-${Date.now()}`, itemName: 'Catalog Test Part', categoryId, unit: 'PCS', sellingPrice: 500 },
    });
    itemId = item.id;
    await prisma.inventoryItemModel.create({ data: { inventoryItemId: itemId, vehicleModelId: model1Id } });
  });

  describe('GET /catalog?level=brands', () => {
    it('returns all brands with item counts', async () => {
      const { status, body } = await invoke(catalogGet, req('GET', '/api/admin/inventory/catalog?level=brands'));
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      const testBrand = body.data.find((b: any) => b.id === brandId);
      expect(testBrand).toBeDefined();
      expect(testBrand.itemCount).toBe(1);
    });
  });

  describe('GET /catalog?level=models', () => {
    it('returns models for a brand with item counts', async () => {
      const { status, body } = await invoke(catalogGet, req('GET', `/api/admin/inventory/catalog?level=models&brandId=${brandId}`));
      expect(status).toBe(200);
      expect(body.data.length).toBe(2);
      const ma = body.data.find((m: any) => m.name === 'Model A');
      expect(ma.itemCount).toBe(1);
      expect(ma.engineCC).toBe(150);
      const mb = body.data.find((m: any) => m.name === 'Model B');
      expect(mb.itemCount).toBe(0);
    });
  });

  describe('GET /catalog?level=categories', () => {
    it('returns categories for items linked to a model', async () => {
      const { status, body } = await invoke(catalogGet, req('GET', `/api/admin/inventory/catalog?level=categories&modelId=${model1Id}`));
      expect(status).toBe(200);
      expect(body.data.length).toBe(1);
      expect(body.data[0].id).toBe(categoryId);
      expect(body.data[0].itemCount).toBe(1);
    });

    it('returns empty for model with no items', async () => {
      const { status, body } = await invoke(catalogGet, req('GET', `/api/admin/inventory/catalog?level=categories&modelId=${model2Id}`));
      expect(status).toBe(200);
      expect(body.data).toEqual([]);
    });
  });

  describe('GET /items with brandId/modelId filters', () => {
    it('filters items by modelId', async () => {
      const { status, body } = await invoke(itemsGet, req('GET', `/api/admin/inventory/items?modelId=${model1Id}`));
      expect(status).toBe(200);
      expect(body.data.some((i: any) => i.id === itemId)).toBe(true);
    });

    it('filters items by brandId', async () => {
      const { status, body } = await invoke(itemsGet, req('GET', `/api/admin/inventory/items?brandId=${brandId}`));
      expect(status).toBe(200);
      expect(body.data.some((i: any) => i.id === itemId)).toBe(true);
    });

    it('returns empty for model with no linked items', async () => {
      const { status, body } = await invoke(itemsGet, req('GET', `/api/admin/inventory/items?modelId=${model2Id}`));
      expect(status).toBe(200);
      expect(body.data.some((i: any) => i.id === itemId)).toBe(false);
    });
  });

  describe('POST /items with modelIds', () => {
    it('creates item and links to models', async () => {
      const payload = {
        sku: `NEW-${Date.now()}`, itemName: 'Multi-model Part', categoryId, unit: 'PCS',
        sellingPrice: 200, costPrice: 100, modelIds: [model1Id, model2Id],
      };
      const { status, body } = await invoke(itemsPost, req('POST', '/api/admin/inventory/items', payload));
      expect(status).toBe(201);
      expect(body.success).toBe(true);

      // Verify links created
      const links = await prisma.inventoryItemModel.findMany({ where: { inventoryItemId: body.data.id } });
      expect(links.length).toBe(2);
      expect(links.map(l => l.vehicleModelId).sort()).toEqual([model1Id, model2Id].sort());
    });
  });

  describe('PATCH /items/:id with modelIds', () => {
    it('replaces model links on update', async () => {
      const { status, body } = await invoke(
        itemPatch,
        req('PATCH', `/api/admin/inventory/items/${itemId}`, { modelIds: [model2Id] }),
        { id: itemId },
      );
      expect(status).toBe(200);
      expect(body.success).toBe(true);

      const links = await prisma.inventoryItemModel.findMany({ where: { inventoryItemId: itemId } });
      expect(links.length).toBe(1);
      expect(links[0].vehicleModelId).toBe(model2Id);
    });

    it('clears model links when modelIds is empty array', async () => {
      await invoke(
        itemPatch,
        req('PATCH', `/api/admin/inventory/items/${itemId}`, { modelIds: [] }),
        { id: itemId },
      );
      const links = await prisma.inventoryItemModel.findMany({ where: { inventoryItemId: itemId } });
      expect(links.length).toBe(0);
    });
  });

  describe('GET /items/:id includes vehicleModels', () => {
    it('returns linked models with brand info', async () => {
      // Re-link for this test
      await prisma.inventoryItemModel.create({ data: { inventoryItemId: itemId, vehicleModelId: model1Id } });

      const { status, body } = await invoke(itemGet, req('GET', `/api/admin/inventory/items/${itemId}`), { id: itemId });
      expect(status).toBe(200);
      expect(body.data.vehicleModels).toBeDefined();
      expect(body.data.vehicleModels.length).toBe(1);
      expect(body.data.vehicleModels[0].vehicleModel.name).toBe('Model A');
      expect(body.data.vehicleModels[0].vehicleModel.brand.name).toContain('TestBrand');
    });
  });
});
