/**
 * Display-only title case formatter.
 * Does NOT modify stored data — only used at render time.
 * Handles: "AMIT PAL" → "Amit Pal", "general service" → "General Service"
 * Preserves: SKUs, registration numbers, abbreviations (AMC, GST, UPI)
 */

const PRESERVE_UPPERCASE = new Set(['AMC', 'GST', 'UPI', 'PDF', 'OTP', 'EMI', 'ID', 'SKU', 'MRP', 'HSN', 'INV', 'JC', 'WRK', 'IST', 'UTC']);

export function toTitleCase(str: string | null | undefined): string {
  if (!str) return '';
  return str.replace(/\S+/g, (word) => {
    const upper = word.toUpperCase();
    if (PRESERVE_UPPERCASE.has(upper)) return upper;
    // Preserve if it looks like a reg number (WB-68-AQ-3433) or SKU (91208KB4670S)
    if (/^[A-Z]{1,3}-\d/.test(word) || /^\d+[A-Z]/.test(word) || /^[A-Z]+\d+/.test(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

/**
 * Sentence case for descriptions/issues.
 * "CHAIN CLEAN AND LUBE" → "Chain clean and lube"
 */
export function toSentenceCase(str: string | null | undefined): string {
  if (!str) return '';
  const lower = str.toLowerCase().trim();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
