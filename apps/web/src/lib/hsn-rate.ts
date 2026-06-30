import { prisma } from './prisma';

/**
 * Default HSN/SAC codes per line type.
 * Used when a line item doesn't have an explicit HSN (e.g., service charges, labor).
 */
export const DEFAULT_HSN: Record<string, string> = {
  SERVICE_CHARGE: '998714',
  LABOR: '998714',
  AMC: '998714',
  CUSTOM_CHARGE: '87141090',
  // PART: resolved from InventoryItem.hsnCode
  // DISCOUNT_ADJUSTMENT: no HSN
};

/** In-memory cache for HSN rates (refreshed per request boundary). */
let rateCache: Map<string, number> | null = null;
let rateCacheTime = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Load all HSN rates into memory. Cached for 1 minute.
 */
async function loadRates(): Promise<Map<string, number>> {
  const now = Date.now();
  if (rateCache && now - rateCacheTime < CACHE_TTL_MS) return rateCache;

  const rates = await prisma.hsnRate.findMany();
  rateCache = new Map(rates.map((r) => [r.hsnCode, Number(r.rate)]));
  rateCacheTime = now;
  return rateCache;
}

/**
 * Look up the GST rate for a given HSN/SAC code.
 * - No HSN (null/empty) → 0% (no GST)
 * - HSN present but not in table → 18% (safe default)
 * - HSN in table → exact rate
 */
export async function getGstRate(hsnCode: string | null | undefined): Promise<number> {
  if (!hsnCode) return 0; // No HSN = No GST
  const rates = await loadRates();
  return rates.get(hsnCode) ?? 18; // Unknown HSN defaults to 18%
}

/**
 * Resolve HSN code for a line item based on its type and optional inventory item.
 *
 * @param lineType - The line item type (PART, SERVICE_CHARGE, etc.)
 * @param inventoryItemId - For PART lines, the linked inventory item ID
 * @param explicitHsn - Explicitly provided HSN (e.g., from CUSTOM_CHARGE input)
 * @returns The resolved HSN code, or null for DISCOUNT_ADJUSTMENT
 */
export async function resolveHsnCode(
  lineType: string,
  inventoryItemId?: string | null,
  explicitHsn?: string | null,
): Promise<string | null> {
  // Discount lines have no HSN
  if (lineType === 'DISCOUNT_ADJUSTMENT') return null;

  // Explicit HSN takes priority (e.g., user typed it for CUSTOM_CHARGE)
  if (explicitHsn) return explicitHsn;

  // PART: look up from inventory item
  if (lineType === 'PART' && inventoryItemId) {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: inventoryItemId },
      select: { hsnCode: true },
    });
    if (item?.hsnCode) return item.hsnCode;
  }

  // Fall back to default for the line type
  return DEFAULT_HSN[lineType] || '87141090';
}

/**
 * Resolve both HSN code and GST rate for a line item.
 * Convenience wrapper combining resolveHsnCode + getGstRate.
 *
 * @param lineType - The line item type
 * @param showGst - Whether the invoice has GST enabled
 * @param inventoryItemId - For PART lines
 * @param explicitHsn - User-provided HSN override
 * @returns { hsnCode, taxRate }
 */
export async function resolveHsnAndRate(
  lineType: string,
  showGst: boolean,
  inventoryItemId?: string | null,
  explicitHsn?: string | null,
): Promise<{ hsnCode: string | null; taxRate: number }> {
  const hsnCode = await resolveHsnCode(lineType, inventoryItemId, explicitHsn);

  // If invoice is not GST-enabled, tax rate is 0 (prices stay the same, no tax breakdown)
  if (!showGst) return { hsnCode, taxRate: 0 };

  const taxRate = await getGstRate(hsnCode);
  return { hsnCode, taxRate };
}

/**
 * Invalidate the HSN rate cache (e.g., after admin adds a new rate).
 */
export function invalidateHsnRateCache(): void {
  rateCache = null;
  rateCacheTime = 0;
}
