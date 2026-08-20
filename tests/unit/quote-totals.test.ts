import { describe, it, expect } from "vitest";
import { computeQuoteTotals } from "@/lib/quote-totals";

describe("computeQuoteTotals", () => {
  it("sums included items into the subtotal", () => {
    const totals = computeQuoteTotals(
      [
        { quantity: 2, unitPrice: 50, isIncluded: true },
        { quantity: 1, unitPrice: 100, isIncluded: true },
      ],
      0,
      0,
      0
    );
    expect(totals.subtotal).toBe(200);
    expect(totals.total).toBe(200);
  });

  it("excludes items where isIncluded is false", () => {
    const totals = computeQuoteTotals(
      [
        { quantity: 1, unitPrice: 100, isIncluded: true },
        { quantity: 1, unitPrice: 500, isIncluded: false },
      ],
      0,
      0,
      0
    );
    expect(totals.subtotal).toBe(100);
  });

  it("applies the discount before tax", () => {
    const totals = computeQuoteTotals(
      [{ quantity: 1, unitPrice: 100, isIncluded: true }],
      20,
      0.1,
      0
    );
    // (100 - 20) * 1.10 = 88
    expect(totals.tax).toBeCloseTo(8);
    expect(totals.total).toBeCloseTo(88);
  });

  it("computes the deposit as a percentage of the total", () => {
    const totals = computeQuoteTotals(
      [{ quantity: 1, unitPrice: 1000, isIncluded: true }],
      0,
      0,
      0.3
    );
    expect(totals.depositAmount).toBeCloseTo(300);
  });

  it("never lets discount push the pre-tax amount below zero", () => {
    const totals = computeQuoteTotals(
      [{ quantity: 1, unitPrice: 50, isIncluded: true }],
      100,
      0,
      0
    );
    expect(totals.total).toBe(0);
  });

  it("rounds all figures to two decimal places", () => {
    const totals = computeQuoteTotals(
      [{ quantity: 3, unitPrice: 33.333, isIncluded: true }],
      0,
      0.0725,
      0
    );
    expect(Number.isInteger(totals.subtotal * 100)).toBe(true);
    expect(Number.isInteger(totals.tax * 100)).toBe(true);
  });
});
