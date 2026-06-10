/**
 * Canonical invoice line-total calculation shared by the invoice-create POST
 * and the per-invoice line-items POST.
 *
 * Rule (single source of truth):
 *  - Non-discount lines: lineTotal = quantity * unitPrice * (1 - discountPercent/100); taxAmount = lineTotal * taxRate/100.
 *  - Discount lines (DISCOUNT_ADJUSTMENT):
 *      - flat:    lineTotal = -|quantity * unitPrice|, taxAmount = 0
 *      - percent: lineTotal = -(nonDiscountPreSubtotal * unitPrice / 100), taxAmount = 0
 *
 * The percent-discount base is ALWAYS the pre-discount subtotal of non-discount
 * line items on the same invoice. This keeps semantics identical whether the
 * discount is added at invoice creation time or appended later via the
 * line-items endpoint, and prevents compounding when multiple percent
 * discounts coexist.
 */
export type InvoiceLineLike = {
  lineType: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  discountPercent?: number;
  discountMode?: 'flat' | 'percent';
};

export type ComputedLine = {
  lineTotal: number; // includes tax for non-discount lines (matches existing storage convention)
  taxAmount: number;
  netLineTotal: number; // lineTotal excluding tax (subtotal contribution)
};

/**
 * Sum of (quantity * unitPrice) across non-discount lines. This is the
 * canonical base for any percent DISCOUNT_ADJUSTMENT line on the same invoice.
 */
export function nonDiscountPreSubtotal(lines: InvoiceLineLike[]): number {
  return lines
    .filter((l) => l.lineType !== 'DISCOUNT_ADJUSTMENT')
    .reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
}

/**
 * Compute a single line's totals given the canonical percent-discount base.
 * For the create endpoint, pass `nonDiscountPreSubtotal(body.lineItems)`.
 * For the add-line endpoint, pass `nonDiscountPreSubtotal(existingLines)` —
 * NOT the stored `invoice.subtotal`, which already nets prior discounts.
 */
export function computeLineTotal(
  line: InvoiceLineLike,
  percentDiscountBase: number,
): ComputedLine {
  const isDiscount = line.lineType === 'DISCOUNT_ADJUSTMENT';
  if (isDiscount) {
    const mode = line.discountMode || 'flat';
    const lineTotal =
      mode === 'percent'
        ? -(percentDiscountBase * (line.unitPrice / 100))
        : -Math.abs(line.quantity * line.unitPrice);
    return { lineTotal, taxAmount: 0, netLineTotal: lineTotal };
  }
  const discountPercent = line.discountPercent ?? 0;
  const taxRate = line.taxRate ?? 0;
  const net = line.quantity * line.unitPrice * (1 - discountPercent / 100);
  const taxAmount = net * (taxRate / 100);
  return { lineTotal: net + taxAmount, taxAmount, netLineTotal: net };
}
