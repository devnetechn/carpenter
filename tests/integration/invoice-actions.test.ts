import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createInvoice, recordPayment } = await import(
  "@/app/admin/(protected)/jobs/[id]/invoice-actions"
);

let jobId: string;

async function seedJobAndSettings() {
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
      serviceAreaZips: [],
    },
  });

  const service = await prisma.service.create({
    data: { name: "Test", slug: "invoice-action-test-service", description: "d" },
  });
  const customer = await prisma.customer.create({
    data: { name: "Jane", phone: "555", email: "invoice-action-test@example.com" },
  });
  const lead = await prisma.lead.create({
    data: { bookingRef: "CW-2026-5555", customerId: customer.id, serviceId: service.id, status: "SCHEDULED" },
  });
  const job = await prisma.job.create({
    data: {
      leadId: lead.id,
      customerId: customer.id,
      scopeOfWork: "Deck",
      addressStreet: "1 A St",
      addressCity: "Springfield",
      addressState: "IL",
      addressZip: "62701",
    },
  });
  jobId = job.id;
}

describe("invoice and payment server actions", () => {
  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.job.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "invoice-action-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "invoice-action-test-service" } });
    await seedJobAndSettings();
  });

  afterAll(async () => {
    await prisma.notification.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.job.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "invoice-action-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "invoice-action-test-service" } });
    await prisma.businessSettings.deleteMany();
  });

  it("creates an invoice", async () => {
    const result = await createInvoice({ jobId, type: "DEPOSIT", amount: 500, dueDate: undefined });
    expect(result.error).toBeNull();

    const invoice = await prisma.invoice.findFirstOrThrow({ where: { jobId } });
    expect(invoice.type).toBe("DEPOSIT");
    expect(Number(invoice.amount)).toBe(500);
    expect(invoice.status).toBe("UNPAID");
  });

  it("moves an invoice through PARTIALLY_PAID to PAID as payments are recorded", async () => {
    await createInvoice({ jobId, type: "DEPOSIT", amount: 500, dueDate: undefined });
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { jobId } });

    const first = await recordPayment({ invoiceId: invoice.id, amount: 200, method: "cash" });
    expect(first.error).toBeNull();
    let updated = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updated.status).toBe("PARTIALLY_PAID");

    const second = await recordPayment({ invoiceId: invoice.id, amount: 300, method: "check" });
    expect(second.error).toBeNull();
    updated = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updated.status).toBe("PAID");

    const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } });
    expect(payments).toHaveLength(2);
  });

  it("queues a PAYMENT_RECEIVED notification when a payment is recorded", async () => {
    await createInvoice({ jobId, type: "FINAL", amount: 100, dueDate: undefined });
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { jobId } });

    await recordPayment({ invoiceId: invoice.id, amount: 100, method: "card" });

    const notifications = await prisma.notification.findMany({ where: { relatedEntityId: invoice.id } });
    expect(notifications.some((n) => n.type === "PAYMENT_RECEIVED")).toBe(true);
  });

  it("rejects recording a payment against an unknown invoice", async () => {
    const result = await recordPayment({ invoiceId: "not-a-real-id", amount: 50, method: "cash" });
    expect(result.error).not.toBeNull();
  });
});
