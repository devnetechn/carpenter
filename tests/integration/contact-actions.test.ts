import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { submitContactInquiry } = await import("@/app/(marketing)/contact/actions");

function formData(values: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) fd.set(key, value);
  return fd;
}

describe("submitContactInquiry", () => {
  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "contact-test@example.com" } });
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
    await prisma.service.upsert({
      where: { slug: "other" },
      update: {},
      create: { name: "Other", slug: "other", description: "d" },
    });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "contact-test@example.com" } });
    await prisma.businessSettings.deleteMany();
    await prisma.service.deleteMany({ where: { slug: "other" } });
  });

  it("creates a Customer, a Lead sourced from the contact form, and a queued notification", async () => {
    const result = await submitContactInquiry(
      formData({
        name: "Contact Tester",
        email: "contact-test@example.com",
        phone: "555-010-0199",
        message: "I have a question about fence installation.",
      })
    );

    expect(result.error).toBeNull();

    const customer = await prisma.customer.findFirst({
      where: { email: "contact-test@example.com" },
    });
    expect(customer).not.toBeNull();

    const lead = await prisma.lead.findFirst({
      where: { customerId: customer!.id },
      include: { service: true },
    });
    expect(lead?.source).toBe("contact-form");
    expect(lead?.service.slug).toBe("other");
    expect(lead?.notes).toContain("fence installation");

    const notification = await prisma.notification.findFirst({
      where: { relatedEntityId: lead!.id },
    });
    expect(notification?.status).toBe("QUEUED");
  });

  it("rejects an invalid submission without creating any records", async () => {
    const result = await submitContactInquiry(
      formData({ name: "", email: "not-an-email", message: "" })
    );

    expect(result.error).not.toBeNull();
    const customer = await prisma.customer.findFirst({
      where: { email: "contact-test@example.com" },
    });
    expect(customer).toBeNull();
  });
});
