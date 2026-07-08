/**
 * Shared helpers and types for invoice PDF templates.
 */

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface BusinessInfo {
  name: string;
  phone: string;
  email: string;
  address: string;
  gst: string;
  bankName: string;
  bankAccount: string;
  bankIfsc: string;
  bankUpi: string;
}

export interface GroupedItems {
  parts: any[];
  labor: any[];
  custom: any[];
  discounts: any[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Escape user-controlled strings before interpolation into PDF/HTML templates.
 * Prevents XSS via customer name, descriptions, settings, etc. rendered into the
 * print-preview window (same-origin) — see audit finding pdf-html-xss.
 */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDateIST(date: Date | string, opts?: { long?: boolean; time?: boolean }): string {
  const d = new Date(new Date(date).getTime() + 5.5 * 60 * 60 * 1000);
  const timePart = opts?.time ? ` · ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` : '';
  if (opts?.long) {
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}${timePart}`;
  }
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}${timePart}`;
}

export function numberToWords(num: number): string {
  if (num === 0) return 'Zero';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const scales = ['','Thousand','Lakh','Crore'];
  const toWords = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + toWords(n % 100) : '');
  };
  const int = Math.round(num);
  if (int < 1000) return toWords(int);
  const parts: string[] = [];
  const groups = [int % 1000, Math.floor(int / 1000) % 100, Math.floor(int / 100000) % 100, Math.floor(int / 10000000)];
  groups.forEach((g, i) => { if (g) parts.unshift(toWords(g) + ' ' + scales[i]); });
  return parts.join(' ').trim();
}

/**
 * Group line items by type for Option B rendering:
 * - PART items first
 * - LABOR + SERVICE_CHARGE together
 * - CUSTOM_CHARGE last
 * - DISCOUNT_ADJUSTMENT excluded from table (returned separately)
 *
 * Serial numbers are continuous across groups.
 */
export function groupLineItems(lineItems: any[]): GroupedItems {
  const parts: any[] = [];
  const labor: any[] = [];
  const custom: any[] = [];
  const discounts: any[] = [];

  for (const li of lineItems) {
    switch (li.lineType) {
      case 'PART':
        parts.push(li);
        break;
      case 'LABOR':
      case 'SERVICE_CHARGE':
        labor.push(li);
        break;
      case 'CUSTOM_CHARGE':
        custom.push(li);
        break;
      case 'DISCOUNT_ADJUSTMENT':
        discounts.push(li);
        break;
      default:
        // AMC or any other type goes into custom group
        custom.push(li);
        break;
    }
  }

  return { parts, labor, custom, discounts };
}

/**
 * Build the BusinessInfo object from raw settings map.
 */
export function buildBusinessInfo(settings: Record<string, any>): BusinessInfo {
  return {
    name: settings['business.name'] || 'GearUp Auto Service',
    phone: settings['business.phone'] || '',
    email: settings['business.email'] || '',
    address: settings['business.address'] || '',
    gst: settings['business.gst'] || '',
    bankName: settings['business.bank.name'] || '',
    bankAccount: settings['business.bank.account'] || '',
    bankIfsc: settings['business.bank.ifsc'] || '',
    bankUpi: settings['business.bank.upi'] || '',
  };
}
