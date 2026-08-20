import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { approveReview, deleteReview } = await import("@/app/admin/(protected)/reviews/actions");

let reviewId: string;

async function seedReview() {
  const service = await prisma.service.create({
    data: { name: "Test", slug: "review-mod-test-service", description: "d" },
  });
  const customer = await prisma.customer.create({
    data: { name: "Jane", phone: "555", email: "review-mod-test@example.com" },
  });
  const lead = await prisma.lead.create({
    data: { bookingRef: "CW-2026-6100", customerId: customer.id, serviceId: service.id, status: "COMPLETED" },
  });
  const job = await prisma.job.create({
    data: {
      leadId: lead.id,
      customerId: customer.id,
      status: "COMPLETED",
      scopeOfWork: "Deck",
      addressStreet: "1 A St",
      addressCity: "Springfield",
      addressState: "IL",
      addressZip: "62701",
    },
  });
  const review = await prisma.review.create({
    data: { jobId: job.id, customerId: customer.id, rating: 5, body: "Great!", projectType: "Deck" },
  });
  reviewId = review.id;
}

describe("review moderation actions", () => {
  beforeEach(async () => {
    await prisma.review.deleteMany();
    await prisma.job.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "review-mod-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "review-mod-test-service" } });
    await seedReview();
  });

  afterAll(async () => {
    await prisma.review.deleteMany();
    await prisma.job.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "review-mod-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "review-mod-test-service" } });
  });

  it("approves a review", async () => {
    await approveReview(reviewId);
    const review = await prisma.review.findUniqueOrThrow({ where: { id: reviewId } });
    expect(review.approved).toBe(true);
  });

  it("deletes a review", async () => {
    await deleteReview(reviewId);
    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    expect(review).toBeNull();
  });
});
