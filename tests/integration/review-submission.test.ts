import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { submitReview } = await import("@/app/review/submit/[jobId]/actions");

let completedJobId: string;
let scheduledJobId: string;

async function seedJobs() {
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
    data: { name: "Test", slug: "review-submit-test-service", description: "d" },
  });
  const customer = await prisma.customer.create({
    data: { name: "Jane", phone: "555", email: "review-submit-test@example.com" },
  });

  const completedLead = await prisma.lead.create({
    data: { bookingRef: "CW-2026-6001", customerId: customer.id, serviceId: service.id, status: "COMPLETED" },
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
    data: { bookingRef: "CW-2026-6002", customerId: customer.id, serviceId: service.id, status: "SCHEDULED" },
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

describe("submitReview", () => {
  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.review.deleteMany();
    await prisma.job.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "review-submit-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "review-submit-test-service" } });
    await seedJobs();
  });

  afterAll(async () => {
    await prisma.notification.deleteMany();
    await prisma.review.deleteMany();
    await prisma.job.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "review-submit-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "review-submit-test-service" } });
    await prisma.businessSettings.deleteMany();
  });

  it("creates an unapproved review for a completed job", async () => {
    const result = await submitReview(completedJobId, {
      rating: 5,
      projectType: "Deck rebuild",
      body: "Great work!",
    });
    expect(result.error).toBeNull();

    const review = await prisma.review.findFirstOrThrow({ where: { jobId: completedJobId } });
    expect(review.approved).toBe(false);
    expect(review.rating).toBe(5);
  });

  it("queues a REVIEW_SUBMITTED notification", async () => {
    await submitReview(completedJobId, { rating: 4, projectType: "Deck", body: "Nice" });

    const notifications = await prisma.notification.findMany({ where: { relatedEntityId: completedJobId } });
    expect(notifications.some((n) => n.type === "REVIEW_SUBMITTED")).toBe(true);
  });

  it("rejects submission for a job that isn't completed", async () => {
    const result = await submitReview(scheduledJobId, { rating: 5, projectType: "Cabinets", body: "x" });
    expect(result.error).not.toBeNull();

    const review = await prisma.review.findFirst({ where: { jobId: scheduledJobId } });
    expect(review).toBeNull();
  });

  it("rejects a second submission for a job that already has a review", async () => {
    await submitReview(completedJobId, { rating: 5, projectType: "Deck", body: "First" });
    const second = await submitReview(completedJobId, { rating: 3, projectType: "Deck", body: "Second" });
    expect(second.error).not.toBeNull();

    const reviews = await prisma.review.findMany({ where: { jobId: completedJobId } });
    expect(reviews).toHaveLength(1);
  });
});
