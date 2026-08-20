import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { generateBookingRef } from "@/lib/booking-ref";

describe("generateBookingRef", () => {
  afterEach(async () => {
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.service.deleteMany();
  });

  it("returns a reference in the CW-YYYY-NNNN format", async () => {
    const ref = await generateBookingRef();
    expect(ref).toMatch(/^CW-\d{4}-\d{4}$/);
  });

  it("never returns a reference already used by an existing Lead", async () => {
    const service = await prisma.service.create({
      data: { name: "Other", slug: "other-test", description: "d" },
    });
    const customer = await prisma.customer.create({
      data: { name: "Jane", phone: "555", email: "jane@example.com" },
    });
    const taken = await generateBookingRef();
    await prisma.lead.create({
      data: {
        bookingRef: taken,
        customerId: customer.id,
        serviceId: service.id,
      },
    });

    const next = await generateBookingRef();
    expect(next).not.toBe(taken);
  });
});
