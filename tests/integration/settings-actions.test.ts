import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  saveBusinessInfo,
  saveBusinessHours,
  addBlockedTime,
  removeBlockedTime,
} = await import("@/app/admin/(protected)/settings/actions");

function formData(values: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) fd.set(key, value);
  return fd;
}

describe("settings server actions", () => {
  beforeEach(async () => {
    await prisma.businessSettings.deleteMany();
    await prisma.businessSettings.create({
      data: {
        name: "Placeholder",
        phone: "000",
        email: "a@example.com",
        addressStreet: "1 St",
        addressCity: "City",
        addressState: "OH",
        addressZip: "00000",
        serviceAreaZips: [],
      },
    });
    await prisma.businessHours.deleteMany();
    await prisma.blockedTime.deleteMany();
  });

  afterAll(async () => {
    await prisma.businessSettings.deleteMany();
    await prisma.businessHours.deleteMany();
    await prisma.blockedTime.deleteMany();
  });

  it("rejects invalid business info without writing to the DB", async () => {
    const result = await saveBusinessInfo(
      formData({
        name: "",
        phone: "555",
        email: "bad-email",
        addressStreet: "1 St",
        addressCity: "City",
        addressState: "OH",
        addressZip: "45501",
        taxRate: "0.07",
        depositPercent: "0.3",
        defaultAppointmentDurationMin: "60",
        serviceAreaZips: "45501",
      })
    );
    expect(result.error).not.toBeNull();
  });

  it("saves valid business info", async () => {
    const result = await saveBusinessInfo(
      formData({
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
        serviceAreaZips: "45501,45502",
      })
    );
    expect(result.error).toBeNull();

    const updated = await prisma.businessSettings.findFirst();
    expect(updated?.name).toBe("Heritage Fine Carpentry");
    expect(updated?.serviceAreaZips).toEqual(["45501", "45502"]);
  });

  it("upserts business hours for a given day", async () => {
    await saveBusinessHours(
      formData({ dayOfWeek: "1", openTime: "08:00", closeTime: "17:00" })
    );
    const hours = await prisma.businessHours.findUnique({
      where: { dayOfWeek: 1 },
    });
    expect(hours?.openTime).toBe("08:00");

    await saveBusinessHours(
      formData({ dayOfWeek: "1", openTime: "09:00", closeTime: "16:00" })
    );
    const updatedHours = await prisma.businessHours.findUnique({
      where: { dayOfWeek: 1 },
    });
    expect(updatedHours?.openTime).toBe("09:00");
  });

  it("adds and removes blocked time", async () => {
    await addBlockedTime(
      formData({
        start: "2026-12-24T00:00:00.000Z",
        end: "2026-12-26T00:00:00.000Z",
        reason: "Holiday",
      })
    );
    const blocks = await prisma.blockedTime.findMany();
    expect(blocks).toHaveLength(1);

    await removeBlockedTime(blocks[0].id);
    const remaining = await prisma.blockedTime.findMany();
    expect(remaining).toHaveLength(0);
  });
});
