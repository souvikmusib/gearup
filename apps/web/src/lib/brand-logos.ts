/**
 * Brand styling for inventory card views.
 * Uses brand colors for text badges (no external image dependencies).
 */
export const BRAND_STYLES: Record<string, { color: string; bg: string }> = {
  'Hero': { color: '#cc0000', bg: '#fff0f0' },
  'Honda': { color: '#cc0000', bg: '#fff0f0' },
  'Bajaj': { color: '#003b8e', bg: '#f0f4ff' },
  'Royal Enfield': { color: '#1a1a1a', bg: '#f5f5f5' },
  'Tvs': { color: '#0047ab', bg: '#f0f4ff' },
  'Yamaha': { color: '#0033a0', bg: '#f0f4ff' },
  'Motul': { color: '#e30613', bg: '#fff0f0' },
  'Castrol': { color: '#009639', bg: '#f0fff4' },
  'Minda': { color: '#004d99', bg: '#f0f4ff' },
  'Rolon': { color: '#333', bg: '#f5f5f5' },
  'All Models': { color: '#666', bg: '#f9fafb' },
};

export function getBrandStyle(brand: string | null | undefined): { color: string; bg: string } {
  if (!brand) return { color: '#666', bg: '#f9fafb' };
  return BRAND_STYLES[brand] || { color: '#666', bg: '#f9fafb' };
}

export function getBrandInitial(brand: string | null | undefined): string {
  if (!brand) return '?';
  return brand.charAt(0).toUpperCase();
}
