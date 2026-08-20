import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { sendReviewRequest } = await import("@/app/admin/(protected)/jobs/[id]/review-actions");

let completedJobId: string;
let scheduledJobId: string;

async function seedJobs() {
  const service = await prisma.service.create({
    data: { name: "Test", slug: "send-review-request-test-service", description: "d" },
  });
  const customer = await prisma.customer.create({
    data: { name: "Jane", phone: "555", email: "send-review-request-test@example.com" },
  });

  const completedLead = await prisma.lead.create({
    data: { bookingRef: "CW-2026-6200", customerId: customer.id, serviceId: service.id, status: "COMPLETED" },
  });
  const completedJob = await prisma.job.create({
    data: {
      leadId: completedLead.id,
      customerId: customer.id,
      status: "COMPLETED",
      scopeOfWork: "Deck",
      addressStreet: "1 A St",
      addressCity: "Springfield",
      addressState: "IL",
      addressZip: "62701",
    },
  });
  completedJobId = completedJob.id;

  const scheduledLead = await prisma.lead.create({
    data: { bookingRef: "CW-2026-6201", customerId: customer.id, serviceId: service.id, status: "SCHEDULED" },
  });
  const scheduledJob = await prisma.job.create({
    data: {
      leadId: scheduledLead.id,
      customerId: customer.id,
      status: "SCHEDULED",
      scopeOfWork: "Cabinets",
      addressStreet: "2 B St",
      addressCity: "Springfield",
      addressState: "IL",
      addressZip: "62701",
    },
  });
  scheduledJobId = scheduledJob.id;
}

describe("sendReviewRequest", () => {
  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.job.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "send-review-request-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "send-review-request-test-service" } });
    await seedJobs();
  });

  afterAll(async () => {
    await prisma.notification.deleteMany();
    await prisma.job.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "send-review-request-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "send-review-request-test-service" } });
  });

  it("queues a REVIEW_REQUEST notification for a completed job", async () => {
    const result = await sendReviewRequest(completedJobId);
    expect(result.error).toBeNull();

    const notifications = await prisma.notification.findMany({ where: { relatedEntityId: completedJobId } });
    expect(notifications.some((n) => n.type === "REVIEW_REQUEST")).toBe(true);
  });

  it("rejects sending a review request for a job that isn't completed", async () => {
    const result = await sendReviewRequest(scheduledJobId);
    expect(result.error).not.toBeNull();

    const notifications = await prisma.notification.findMany({ where: { relatedEntityId: scheduledJobId } });
    expect(notifications).toHaveLength(0);
  });
});
