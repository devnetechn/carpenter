export interface QuoteLineItemInput {
  quantity: number;
  unitPrice: number;
  isIncluded: boolean;
}

export interface QuoteTotals {
  subtotal: number;
  tax: number;
  total: number;
  depositAmount: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeQuoteTotals(
  items: QuoteLineItemInput[],
  discount: number,
  taxRate: number,
  depositPercent: number
): QuoteTotals {
  const subtotal = items
    .filter((i) => i.isIncluded)
    .reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const afterDiscount = Math.max(0, subtotal - discount);
  const tax = afterDiscount * taxRate;
  const total = afterDiscount + tax;
  const depositAmount = total * depositPercent;

  return {
    subtotal: round2(subtotal),
    tax: round2(tax),
    total: round2(total),
    depositAmount: round2(depositAmount),
  };
}
