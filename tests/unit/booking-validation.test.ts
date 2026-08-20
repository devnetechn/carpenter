import { describe, it, expect } from "vitest";
import { addressSchema, customerInfoSchema, submitBookingSchema } from "@/lib/booking";

describe("addressSchema", () => {
  it("accepts a valid address", () => {
    const result = addressSchema.safeParse({
      addressStreet: "1 Main St",
      addressCity: "Springfield",
      addressState: "IL",
      addressZip: "62701",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing street", () => {
    const result = addressSchema.safeParse({
      addressStreet: "",
      addressCity: "Springfield",
      addressState: "IL",
      addressZip: "62701",
    });
    expect(result.success).toBe(false);
  });
});

describe("customerInfoSchema", () => {
  it("accepts valid customer info", () => {
    const result = customerInfoSchema.safeParse({
      customerName: "Jane Doe",
      customerPhone: "555-010-0100",
      customerEmail: "jane@example.com",
      preferredContact: "EMAIL",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid preferredContact value", () => {
    const result = customerInfoSchema.safeParse({
      customerName: "Jane Doe",
      customerPhone: "555-010-0100",
      customerEmail: "jane@example.com",
      preferredContact: "CARRIER_PIGEON",
    });
    expect(result.success).toBe(false);
  });
});

describe("submitBookingSchema", () => {
  const valid = {
    serviceId: "service_1",
    answers: { q1: "yes" },
    photoUrls: ["/uploads/a.png"],
    addressStreet: "1 Main St",
    addressCity: "Springfield",
    addressState: "IL",
    addressZip: "62701",
    budgetMin: 1000,
    budgetMax: 5000,
    slotStart: "2026-08-24T13:00:00.000Z",
    slotEnd: "2026-08-24T14:00:00.000Z",
    customerName: "Jane Doe",
    customerPhone: "555-010-0100",
    customerEmail: "jane@example.com",
    preferredContact: "EMAIL",
  };

  it("accepts a fully valid submission", () => {
    expect(submitBookingSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts omitted budget fields", () => {
    const { budgetMin, budgetMax, ...rest } = valid;
    expect(submitBookingSchema.safeParse(rest).success).toBe(true);
  });

  it("rejects more than 10 photos", () => {
    const result = submitBookingSchema.safeParse({
      ...valid,
      photoUrls: Array(11).fill("/uploads/a.png"),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing slot", () => {
    const { slotStart, ...rest } = valid;
    expect(submitBookingSchema.safeParse(rest).success).toBe(false);
  });
});
