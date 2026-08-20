import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { getAvailableSlots } from "@/lib/availability";

describe("getAvailableSlots", () => {
  beforeEach(async () => {
    await prisma.appointment.deleteMany();
    await prisma.blockedTime.deleteMany();
    await prisma.businessHours.deleteMany();
    await prisma.businessSettings.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.service.deleteMany();

    await prisma.businessSettings.create({
      data: {
        name: "Test Co",
        phone: "555-0100",
        email: "owner@example.com",
        addressStreet: "1 Main St",
        addressCity: "Springfield",
        addressState: "IL",
        addressZip: "62701",
        defaultAppointmentDurationMin: 60,
        serviceAreaZips: [],
      },
    });
    await prisma.businessHours.createMany({
      data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        dayOfWeek,
        openTime: "09:00",
        closeTime: "10:00",
        isClosed: false,
      })),
    });
  });

  afterEach(async () => {
    await prisma.appointment.deleteMany();
    await prisma.blockedTime.deleteMany();
    await prisma.businessHours.deleteMany();
    await prisma.businessSettings.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.service.deleteMany();
  });

  it("returns one open slot per weekday and excludes a booked appointment", async () => {
    const rangeStart = new Date("2026-08-24T00:00:00.000Z"); // Monday
    const rangeEnd = new Date("2026-08-25T00:00:00.000Z"); // Tuesday

    const withoutBooking = await getAvailableSlots(rangeStart, rangeEnd);
    expect(withoutBooking).toHaveLength(1);

    const service = await prisma.service.create({
      data: { name: "Other", slug: "other", description: "d" },
    });
    const customer = await prisma.customer.create({
      data: { name: "Jane", phone: "555", email: "jane@example.com" },
    });
    const lead = await prisma.lead.create({
      data: {
        bookingRef: "CW-2026-0001",
        customerId: customer.id,
        serviceId: service.id,
      },
    });
    await prisma.appointment.create({
      data: {
        leadId: lead.id,
        type: "CONSULTATION",
        start: withoutBooking[0].start,
        end: withoutBooking[0].end,
        status: "SCHEDULED",
      },
    });

    const withBooking = await getAvailableSlots(rangeStart, rangeEnd);
    expect(withBooking).toHaveLength(0);
  });
});
