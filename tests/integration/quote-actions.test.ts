import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { saveQuoteDraft, sendQuote } = await import(
  "@/app/admin/(protected)/leads/[id]/quote-actions"
);

let leadId: string;

async function seedLeadAndSettings() {
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
    data: { name: "Test", slug: "quote-test-service", description: "d" },
  });
  const customer = await prisma.customer.create({
    data: { name: "Jane", phone: "555", email: "quote-test@example.com" },
  });
  const lead = await prisma.lead.create({
    data: {
      bookingRef: "CW-2026-7777",
      customerId: customer.id,
      serviceId: service.id,
      status: "NEW",
    },
  });
  leadId = lead.id;
}

describe("quote server actions", () => {
  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.quoteItem.deleteMany();
    await prisma.quote.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "quote-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "quote-test-service" } });
    await seedLeadAndSettings();
  });

  afterAll(async () => {
    await prisma.notification.deleteMany();
    await prisma.quoteItem.deleteMany();
    await prisma.quote.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "quote-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "quote-test-service" } });
    await prisma.businessSettings.deleteMany();
  });

  it("creates a draft quote with computed totals", async () => {
    const result = await saveQuoteDraft({
      leadId,
      items: [
        { type: "LABOR", description: "Framing", quantity: 8, unitPrice: 65, isOptional: false, isIncluded: true },
        { type: "MATERIAL", description: "Lumber", quantity: 1, unitPrice: 400, isOptional: false, isIncluded: true },
      ],
      discount: 20,
      taxRate: 0.1,
      depositPercent: 0.3,
    });
    expect(result.error).toBeNull();

    const quote = await prisma.quote.findFirst({ where: { leadId }, include: { items: true } });
    expect(quote?.status).toBe("DRAFT");
    expect(quote?.items).toHaveLength(2);
    // subtotal = 8*65 + 1*400 = 920; after discount 900; tax 90; total 990; deposit 297
    expect(Number(quote?.subtotal)).toBeCloseTo(920);
    expect(Number(quote?.total)).toBeCloseTo(990);
    expect(Number(quote?.depositAmount)).toBeCloseTo(297);
  });

  it("replaces items on a second save rather than appending", async () => {
    await saveQuoteDraft({
      leadId,
      items: [{ type: "LABOR", description: "A", quantity: 1, unitPrice: 10, isOptional: false, isIncluded: true }],
      discount: 0,
      taxRate: 0,
      depositPercent: 0,
    });
    await saveQuoteDraft({
      leadId,
      items: [
        { type: "LABOR", description: "B", quantity: 1, unitPrice: 20, isOptional: false, isIncluded: true },
        { type: "LABOR", description: "C", quantity: 1, unitPrice: 30, isOptional: false, isIncluded: true },
      ],
      discount: 0,
      taxRate: 0,
      depositPercent: 0,
    });

    const quotes = await prisma.quote.findMany({ where: { leadId }, include: { items: true } });
    expect(quotes).toHaveLength(1);
    expect(quotes[0].items).toHaveLength(2);
    expect(quotes[0].items.map((i) => i.description).sort()).toEqual(["B", "C"]);
  });

  it("sends a quote, updates lead status, and queues a notification", async () => {
    const saveResult = await saveQuoteDraft({
      leadId,
      items: [{ type: "LABOR", description: "A", quantity: 1, unitPrice: 100, isOptional: false, isIncluded: true }],
      discount: 0,
      taxRate: 0,
      depositPercent: 0,
    });
    const quote = await prisma.quote.findFirst({ where: { leadId } });

    const result = await sendQuote(quote!.id);
    expect(result.error).toBeNull();

    const sent = await prisma.quote.findUniqueOrThrow({ where: { id: quote!.id } });
    expect(sent.status).toBe("SENT");
    expect(sent.sentAt).not.toBeNull();
    expect(sent.publicToken).toBeTruthy();

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.status).toBe("ESTIMATE_SENT");

    const notifications = await prisma.notification.findMany({ where: { relatedEntityId: quote!.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("QUOTE_SENT");

    void saveResult;
  });
});
