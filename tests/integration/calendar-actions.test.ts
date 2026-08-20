import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createAppointment, rescheduleAppointment, cancelAppointment } = await import(
  "@/app/admin/(protected)/calendar/actions"
);

let leadId: string;

async function seedLead() {
  const service = await prisma.service.create({
    data: { name: "Test", slug: "calendar-test-service", description: "d" },
  });
  const customer = await prisma.customer.create({
    data: { name: "Jane", phone: "555", email: "calendar-test@example.com" },
  });
  const lead = await prisma.lead.create({
    data: {
      bookingRef: "CW-2026-8888",
      customerId: customer.id,
      serviceId: service.id,
      status: "NEW",
    },
  });
  leadId = lead.id;
  return lead;
}

describe("calendar server actions", () => {
  beforeEach(async () => {
    await prisma.appointment.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "calendar-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "calendar-test-service" } });
    await seedLead();
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "calendar-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "calendar-test-service" } });
  });

  it("creates an appointment", async () => {
    const result = await createAppointment({
      leadId,
      type: "CONSULTATION",
      start: "2026-09-10T13:00:00.000Z",
      end: "2026-09-10T14:00:00.000Z",
    });
    expect(result.error).toBeNull();

    const appts = await prisma.appointment.findMany({ where: { leadId } });
    expect(appts).toHaveLength(1);
    expect(appts[0].type).toBe("CONSULTATION");
  });

  it("rejects an overlapping appointment", async () => {
    await createAppointment({
      leadId,
      type: "CONSULTATION",
      start: "2026-09-10T13:00:00.000Z",
      end: "2026-09-10T14:00:00.000Z",
    });

    const second = await createAppointment({
      leadId,
      type: "FOLLOW_UP",
      start: "2026-09-10T13:30:00.000Z",
      end: "2026-09-10T14:30:00.000Z",
    });
    expect(second.error).not.toBeNull();

    const appts = await prisma.appointment.findMany({ where: { leadId } });
    expect(appts).toHaveLength(1);
  });

  it("reschedules an appointment to a free slot", async () => {
    const created = await prisma.appointment.create({
      data: {
        leadId,
        type: "CONSULTATION",
        start: new Date("2026-09-10T13:00:00.000Z"),
        end: new Date("2026-09-10T14:00:00.000Z"),
        status: "SCHEDULED",
      },
    });

    const result = await rescheduleAppointment({
      appointmentId: created.id,
      start: "2026-09-11T13:00:00.000Z",
      end: "2026-09-11T14:00:00.000Z",
    });
    expect(result.error).toBeNull();

    const updated = await prisma.appointment.findUniqueOrThrow({ where: { id: created.id } });
    expect(updated.start.toISOString()).toBe("2026-09-11T13:00:00.000Z");
  });

  it("rejects rescheduling into an occupied slot", async () => {
    const first = await prisma.appointment.create({
      data: {
        leadId,
        type: "CONSULTATION",
        start: new Date("2026-09-10T13:00:00.000Z"),
        end: new Date("2026-09-10T14:00:00.000Z"),
        status: "SCHEDULED",
      },
    });
    const second = await prisma.appointment.create({
      data: {
        leadId,
        type: "FOLLOW_UP",
        start: new Date("2026-09-12T13:00:00.000Z"),
        end: new Date("2026-09-12T14:00:00.000Z"),
        status: "SCHEDULED",
      },
    });

    const result = await rescheduleAppointment({
      appointmentId: second.id,
      start: "2026-09-10T13:30:00.000Z",
      end: "2026-09-10T14:30:00.000Z",
    });
    expect(result.error).not.toBeNull();

    const unchanged = await prisma.appointment.findUniqueOrThrow({ where: { id: second.id } });
    expect(unchanged.start.toISOString()).toBe("2026-09-12T13:00:00.000Z");
  });

  it("cancels an appointment", async () => {
    const created = await prisma.appointment.create({
      data: {
        leadId,
        type: "CONSULTATION",
        start: new Date("2026-09-10T13:00:00.000Z"),
        end: new Date("2026-09-10T14:00:00.000Z"),
        status: "SCHEDULED",
      },
    });

    await cancelAppointment(created.id);

    const updated = await prisma.appointment.findUniqueOrThrow({ where: { id: created.id } });
    expect(updated.status).toBe("CANCELLED");
  });
});
