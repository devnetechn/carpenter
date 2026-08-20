import { describe, it, expect } from "vitest";
import { computeInvoiceStatus } from "@/lib/invoice-totals";

describe("computeInvoiceStatus", () => {
  it("returns UNPAID when nothing has been paid", () => {
    expect(computeInvoiceStatus(500, 0, "UNPAID")).toBe("UNPAID");
  });

  it("returns PARTIALLY_PAID when some but not all has been paid", () => {
    expect(computeInvoiceStatus(500, 200, "UNPAID")).toBe("PARTIALLY_PAID");
  });

  it("returns PAID when the paid total meets the amount", () => {
    expect(computeInvoiceStatus(500, 500, "UNPAID")).toBe("PAID");
  });

  it("returns PAID when the paid total exceeds the amount", () => {
    expect(computeInvoiceStatus(500, 600, "PARTIALLY_PAID")).toBe("PAID");
  });

  it("keeps a VOID invoice VOID regardless of payments", () => {
    expect(computeInvoiceStatus(500, 500, "VOID")).toBe("VOID");
  });
});
