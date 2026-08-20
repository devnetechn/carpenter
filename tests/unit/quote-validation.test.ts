import { describe, it, expect } from "vitest";
import { saveQuoteDraftSchema } from "@/lib/quote";

describe("saveQuoteDraftSchema", () => {
  const valid = {
    leadId: "lead_1",
    items: [
      {
        type: "LABOR",
        description: "Framing labor",
        quantity: 8,
        unitPrice: 65,
        isOptional: false,
        isIncluded: true,
      },
    ],
    discount: 0,
    taxRate: 0.0725,
    depositPercent: 0.3,
  };

  it("accepts a valid draft", () => {
    expect(saveQuoteDraftSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty items array", () => {
    const result = saveQuoteDraftSchema.safeParse({ ...valid, items: [] });
    expect(result.success).toBe(false);
  });

  it("rejects an item with an empty description", () => {
    const result = saveQuoteDraftSchema.safeParse({
      ...valid,
      items: [{ ...valid.items[0], description: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative quantity", () => {
    const result = saveQuoteDraftSchema.safeParse({
      ...valid,
      items: [{ ...valid.items[0], quantity: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a tax rate above 1", () => {
    const result = saveQuoteDraftSchema.safeParse({ ...valid, taxRate: 1.5 });
    expect(result.success).toBe(false);
  });
});
