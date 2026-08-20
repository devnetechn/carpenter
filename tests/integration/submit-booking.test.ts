import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { SubmitBookingInput } from "@/lib/booking";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { submitBookingAction } = await import("@/app/quote/actions");

async function seedBaseline() {
  await prisma.appointment.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.customer.deleteMany({ where: { email: "wizard-test@example.com" } });
  await prisma.service.deleteMany({ where: { slug: "wizard-test-service" } });
  await prisma.businessSettings.deleteMany();

  await prisma.businessSettings.create({
    data: {
      name: "Test Co",
      phone: "555-0100",
      email: "owner@example.com",
      addressStreet: "1 Main St",
      addressCity: "Springfield",
      addressState: "IL",
      addressZip: "62701",
      serviceAreaZips: ["62701"],
    },
  });

  return prisma.service.create({
    data: {
      name: "Wizard Test Service",
      slug: "wizard-test-service",
      description: "d",
    },
  });
}

function validInput(serviceId: string, overrides: Record<string, unknown> = {}) {
  return {
    serviceId,
    answers: { q1: "yes" },
    photoUrls: [],
    addressStreet: "1 Main St",
    addressCity: "Springfield",
    addressState: "IL",
    addressZip: "62701",
    budgetMin: 1000,
    budgetMax: 5000,
    slotStart: "2026-09-01T13:00:00.000Z",
    slotEnd: "2026-09-01T14:00:00.000Z",
    customerName: "Jane Doe",
    customerPhone: "555-010-0100",
    customerEmail: "wizard-test@example.com",
    preferredContact: "EMAIL" as const,
    ...overrides,
  } as SubmitBookingInput;
}

describe("submitBookingAction", () => {
  beforeEach(async () => {
    await seedBaseline();
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "wizard-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "wizard-test-service" } });
    await prisma.businessSettings.deleteMany();
  });

  it("creates Customer, Lead, Project, and Appointment, and returns a booking reference", async () => {
    const service = await prisma.service.findUniqueOrThrow({
      where: { slug: "wizard-test-service" },
    });

    const result = await submitBookingAction(validInput(service.id));

    expect(result.error).toBeNull();
    expect(result.bookingRef).toMatch(/^CW-\d{4}-\d{4}$/);

    const customer = await prisma.customer.findFirst({
      where: { email: "wizard-test@example.com" },
    });
    expect(customer).not.toBeNull();

    const lead = await prisma.lead.findFirst({
      where: { customerId: customer!.id },
      include: { project: true, appointments: true },
    });
    expect(lead?.project?.withinServiceArea).toBe(true);
    expect(lead?.project?.status).toBe("submitted");
    expect(lead?.preferredContact).toBe("EMAIL");
    expect(lead?.appointments).toHaveLength(1);

    const notifications = await prisma.notification.findMany({
      where: { relatedEntityId: lead!.id },
    });
    expect(notifications.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects a slot that is already booked", async () => {
    const service = await prisma.service.findUniqueOrThrow({
      where: { slug: "wizard-test-service" },
    });

    const first = await submitBookingAction(
      validInput(service.id, { customerEmail: "wizard-test@example.com" })
    );
    expect(first.error).toBeNull();

    const second = await submitBookingAction(
      validInput(service.id, { customerEmail: "wizard-test-2@example.com" })
    );
    expect(second.error).not.toBeNull();
    expect(second.bookingRef).toBeNull();

    await prisma.customer.deleteMany({ where: { email: "wizard-test-2@example.com" } });
  });

  it("rejects an invalid submission without creating any records", async () => {
    const result = await submitBookingAction(
      validInput("not-a-real-service-id", { customerEmail: "" })
    );
    expect(result.error).not.toBeNull();
  });
});
