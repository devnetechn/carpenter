import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { respondToQuote } = await import("@/app/quote/view/[token]/actions");

let quoteId: string;
let publicToken: string;

async function seedSentQuote() {
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
    data: { name: "Test", slug: "quote-response-test-service", description: "d" },
  });
  const customer = await prisma.customer.create({
    data: { name: "Jane", phone: "555", email: "quote-response-test@example.com" },
  });
  const lead = await prisma.lead.create({
    data: { bookingRef: "CW-2026-6666", customerId: customer.id, serviceId: service.id, status: "ESTIMATE_SENT" },
  });
  const quote = await prisma.quote.create({
    data: { leadId: lead.id, status: "SENT", sentAt: new Date(), total: 500 },
  });
  quoteId = quote.id;
  publicToken = quote.publicToken;
}

describe("respondToQuote", () => {
  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.quote.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "quote-response-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "quote-response-test-service" } });
    await seedSentQuote();
  });

  afterAll(async () => {
    await prisma.notification.deleteMany();
    await prisma.quote.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "quote-response-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "quote-response-test-service" } });
    await prisma.businessSettings.deleteMany();
  });

  it("accepts a quote and queues a QUOTE_ACCEPTED notification", async () => {
    const result = await respondToQuote(publicToken, "ACCEPT");
    expect(result.error).toBeNull();

    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(quote.status).toBe("ACCEPTED");
    expect(quote.respondedAt).not.toBeNull();

    const notifications = await prisma.notification.findMany({ where: { relatedEntityId: quoteId } });
    expect(notifications.some((n) => n.type === "QUOTE_ACCEPTED")).toBe(true);
  });

  it("declines a quote and queues a QUOTE_DECLINED notification", async () => {
    const result = await respondToQuote(publicToken, "DECLINE", "Too expensive");
    expect(result.error).toBeNull();

    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(quote.status).toBe("DECLINED");

    const notifications = await prisma.notification.findMany({ where: { relatedEntityId: quoteId } });
    const declineNotif = notifications.find((n) => n.type === "QUOTE_DECLINED");
    expect(declineNotif?.body).toContain("Too expensive");
  });

  it("requests changes without changing quote status", async () => {
    const result = await respondToQuote(publicToken, "REQUEST_CHANGES", "Can we swap the material?");
    expect(result.error).toBeNull();

    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(quote.status).toBe("SENT");

    const notifications = await prisma.notification.findMany({ where: { relatedEntityId: quoteId } });
    const changesNotif = notifications.find((n) => n.type === "QUOTE_CHANGES_REQUESTED");
    expect(changesNotif?.body).toContain("swap the material");
  });

  it("rejects a response to an already-accepted quote", async () => {
    await respondToQuote(publicToken, "ACCEPT");
    const second = await respondToQuote(publicToken, "DECLINE");
    expect(second.error).not.toBeNull();
  });

  it("rejects an unknown token", async () => {
    const result = await respondToQuote("not-a-real-token", "ACCEPT");
    expect(result.error).not.toBeNull();
  });
});
