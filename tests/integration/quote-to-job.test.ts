import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { convertQuoteToJob } = await import("@/app/admin/(protected)/leads/[id]/job-actions");

let leadId: string;
let quoteId: string;

async function seedAcceptedQuote() {
  const service = await prisma.service.create({
    data: { name: "Test", slug: "job-conversion-test-service", description: "d" },
  });
  const customer = await prisma.customer.create({
    data: { name: "Jane", phone: "555", email: "job-conversion-test@example.com" },
  });
  const lead = await prisma.lead.create({
    data: { bookingRef: "CW-2026-8888", customerId: customer.id, serviceId: service.id, status: "ESTIMATE_SENT" },
  });
  await prisma.project.create({
    data: {
      leadId: lead.id,
      addressStreet: "42 Oak St",
      addressCity: "Springfield",
      addressState: "IL",
      addressZip: "62701",
    },
  });
  const quote = await prisma.quote.create({
    data: { leadId: lead.id, status: "ACCEPTED", total: 1000 },
  });
  await prisma.quoteItem.createMany({
    data: [
      { quoteId: quote.id, type: "LABOR", description: "Labor", quantity: 10, unitPrice: 50, isIncluded: true, sortOrder: 0 },
      { quoteId: quote.id, type: "MATERIAL", description: "Wood", quantity: 5, unitPrice: 20, isIncluded: true, sortOrder: 1 },
      { quoteId: quote.id, type: "OPTIONAL", description: "Upgrade", quantity: 1, unitPrice: 300, isOptional: true, isIncluded: false, sortOrder: 2 },
    ],
  });
  leadId = lead.id;
  quoteId = quote.id;
}

describe("convertQuoteToJob", () => {
  beforeEach(async () => {
    await prisma.jobLineItem.deleteMany();
    await prisma.job.deleteMany();
    await prisma.quoteItem.deleteMany();
    await prisma.quote.deleteMany();
    await prisma.project.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "job-conversion-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "job-conversion-test-service" } });
    await seedAcceptedQuote();
  });

  afterAll(async () => {
    await prisma.jobLineItem.deleteMany();
    await prisma.job.deleteMany();
    await prisma.quoteItem.deleteMany();
    await prisma.quote.deleteMany();
    await prisma.project.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "job-conversion-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "job-conversion-test-service" } });
  });

  it("creates a job seeded from included quote items and sets lead to SCHEDULED", async () => {
    const result = await convertQuoteToJob(quoteId);
    expect(result.error).toBeNull();
    expect(result.jobId).toBeTruthy();

    const job = await prisma.job.findUniqueOrThrow({
      where: { id: result.jobId! },
      include: { lineItems: true },
    });
    expect(job.leadId).toBe(leadId);
    expect(job.quoteId).toBe(quoteId);
    expect(job.status).toBe("SCHEDULED");
    expect(job.addressStreet).toBe("42 Oak St");
    expect(job.lineItems).toHaveLength(2);
    expect(job.lineItems.map((i) => i.description).sort()).toEqual(["Labor", "Wood"]);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.status).toBe("SCHEDULED");
  });

  it("rejects conversion of a quote that is not accepted", async () => {
    await prisma.quote.update({ where: { id: quoteId }, data: { status: "SENT" } });
    const result = await convertQuoteToJob(quoteId);
    expect(result.error).not.toBeNull();
    expect(result.jobId).toBeNull();
  });

  it("rejects a second conversion attempt for the same lead", async () => {
    await convertQuoteToJob(quoteId);
    const second = await convertQuoteToJob(quoteId);
    expect(second.error).not.toBeNull();
    expect(second.jobId).toBeNull();
  });
});
