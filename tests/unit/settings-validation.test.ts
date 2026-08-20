import { describe, it, expect } from "vitest";
import { businessInfoSchema } from "@/lib/settings";

describe("businessInfoSchema", () => {
  const valid = {
    name: "Heritage Fine Carpentry",
    phone: "555-019-2837",
    email: "info@example.com",
    addressStreet: "412 Millwright Ave",
    addressCity: "Riverton",
    addressState: "OH",
    addressZip: "45501",
    taxRate: "0.0725",
    depositPercent: "0.3",
    defaultAppointmentDurationMin: "60",
    serviceAreaZips: "45501, 45502,45503",
  };

  it("accepts valid input and coerces numeric/list fields", () => {
    const result = businessInfoSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.taxRate).toBe(0.0725);
      expect(result.data.serviceAreaZips).toEqual(["45501", "45502", "45503"]);
    }
  });

  it("rejects an invalid email", () => {
    const result = businessInfoSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a tax rate above 1", () => {
    const result = businessInfoSchema.safeParse({ ...valid, taxRate: "1.5" });
    expect(result.success).toBe(false);
  });
});
