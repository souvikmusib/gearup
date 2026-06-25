-- Migration: Add hsnCode to InventoryItem
-- Run on prod AFTER Souvik approval

-- Step 1: Add column
ALTER TABLE "InventoryItem" ADD COLUMN "hsnCode" TEXT;

-- Step 2: Populate HSN codes based on item category/type
-- Default: 87141090 (Parts of motorcycles/cycles)

-- Engine oils & lubricants (Castrol, Motul, HPCL)
UPDATE "InventoryItem" SET "hsnCode" = '27101019'
WHERE brand IN ('Castrol', 'Motul', 'MOTUL', 'HPCL')
  OR "itemName" ILIKE '%engine oil%'
  OR "itemName" ILIKE '%gear oil%'
  OR "itemName" ILIKE '%fork oil%'
  OR "itemName" ILIKE '%brake oil%'
  OR "itemName" ILIKE '%chain lube%'
  OR "itemName" ILIKE '%chain clean%'
  OR "itemName" ILIKE '%engine flush%'
  OR "itemName" ILIKE '%ez lube%'
  OR "itemName" ILIKE '%contact cleaner%';

-- Rubber seals, oil seals, gaskets
UPDATE "InventoryItem" SET "hsnCode" = '40169300'
WHERE "hsnCode" IS NULL AND (
  "itemName" ILIKE '%oil seal%'
  OR "itemName" ILIKE '%gasket%'
  OR "itemName" ILIKE '%o ring%'
  OR "itemName" ILIKE '%dust seal%'
  OR "itemName" ILIKE '%fork gaiter%'
  OR "itemName" ILIKE '%drum rubber%'
);

-- Bearings
UPDATE "InventoryItem" SET "hsnCode" = '84829011'
WHERE "hsnCode" IS NULL AND (
  "itemName" ILIKE '%bearing%'
  OR "itemName" ILIKE '%brg%'
  OR "itemName" ILIKE '%ball race%'
  OR "itemName" ILIKE '%ball assy strg%'
);

-- Air filters
UPDATE "InventoryItem" SET "hsnCode" = '84212300'
WHERE "hsnCode" IS NULL AND (
  "itemName" ILIKE '%air filter%'
  OR "itemName" ILIKE '%element air%'
  OR "itemName" ILIKE '%element a/c%'
  OR "itemName" ILIKE '%air cleaner%'
);

-- Oil filters
UPDATE "InventoryItem" SET "hsnCode" = '84212300'
WHERE "hsnCode" IS NULL AND (
  "itemName" ILIKE '%oil filter%'
  OR "itemName" ILIKE '%filter comp engine%'
);

-- Spark plugs
UPDATE "InventoryItem" SET "hsnCode" = '85111000'
WHERE "hsnCode" IS NULL AND (
  "itemName" ILIKE '%spark plug%'
);

-- Bulbs & lights
UPDATE "InventoryItem" SET "hsnCode" = '85392990'
WHERE "hsnCode" IS NULL AND (
  "itemName" ILIKE '%bulb%'
  OR "itemName" ILIKE '%headlight%'
  OR "itemName" ILIKE '%head light%'
  OR "itemName" ILIKE '%led%'
  OR "itemName" ILIKE '%indicator%'
);

-- Chains & sprockets
UPDATE "InventoryItem" SET "hsnCode" = '73151100'
WHERE "hsnCode" IS NULL AND (
  "itemName" ILIKE '%chain%sprocket%'
  OR "itemName" ILIKE '%sprocket%kit%'
  OR "itemName" ILIKE '%cam chain%'
);

-- Mirrors
UPDATE "InventoryItem" SET "hsnCode" = '70099200'
WHERE "hsnCode" IS NULL AND (
  "itemName" ILIKE '%mirror%'
);

-- Cables (throttle, clutch, brake, speedo)
UPDATE "InventoryItem" SET "hsnCode" = '87149990'
WHERE "hsnCode" IS NULL AND (
  "itemName" ILIKE '%cable%'
);

-- Seat covers
UPDATE "InventoryItem" SET "hsnCode" = '94012090'
WHERE "hsnCode" IS NULL AND (
  "itemName" ILIKE '%seat cover%'
);

-- Drive belts
UPDATE "InventoryItem" SET "hsnCode" = '40101190'
WHERE "hsnCode" IS NULL AND (
  "itemName" ILIKE '%belt%drive%'
  OR "itemName" ILIKE '%v belt%'
);

-- Everything else: default to motorcycle parts
UPDATE "InventoryItem" SET "hsnCode" = '87141090'
WHERE "hsnCode" IS NULL;

-- Verify
SELECT "hsnCode", COUNT(*) as items FROM "InventoryItem" GROUP BY "hsnCode" ORDER BY items DESC;
