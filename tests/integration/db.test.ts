import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";

describe("prisma client", () => {
  afterEach(async () => {
    await prisma.businessSettings.deleteMany();
  });

  it("can write and read a BusinessSettings row", async () => {
    const created = await prisma.businessSettings.create({
      data: {
        name: "Test Co",
        phone: "555-0100",
        email: "test@example.com",
        addressStreet: "1 Main St",
        addressCity: "Springfield",
        addressState: "IL",
        addressZip: "62701",
        serviceAreaZips: ["62701"],
      },
    });

    const found = await prisma.businessSettings.findUnique({
      where: { id: created.id },
    });

    expect(found?.name).toBe("Test Co");
  });
});
