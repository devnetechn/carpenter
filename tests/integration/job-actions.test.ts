import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  updateJobStatus,
  saveJobInfo,
  saveJobLineItems,
  addJobPhoto,
  deleteJobPhoto,
  toggleFeaturedOnWebsite,
} = await import("@/app/admin/(protected)/jobs/[id]/actions");

let jobId: string;

async function seedJob() {
  const service = await prisma.service.create({
    data: { name: "Test", slug: "job-action-test-service", description: "d" },
  });
  const customer = await prisma.customer.create({
    data: { name: "Jane", phone: "555", email: "job-action-test@example.com" },
  });
  const lead = await prisma.lead.create({
    data: { bookingRef: "CW-2026-9999", customerId: customer.id, serviceId: service.id, status: "SCHEDULED" },
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

describe("job server actions", () => {
  beforeEach(async () => {
    await prisma.jobPhoto.deleteMany();
    await prisma.jobLineItem.deleteMany();
    await prisma.job.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "job-action-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "job-action-test-service" } });
    await seedJob();
  });

  afterAll(async () => {
    await prisma.jobPhoto.deleteMany();
    await prisma.jobLineItem.deleteMany();
    await prisma.job.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "job-action-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "job-action-test-service" } });
  });

  it("sets completionDate when moved to COMPLETED and clears it when moved away", async () => {
    await updateJobStatus(jobId, "COMPLETED");
    let job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe("COMPLETED");
    expect(job.completionDate).not.toBeNull();

    await updateJobStatus(jobId, "IN_PROGRESS");
    job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe("IN_PROGRESS");
    expect(job.completionDate).toBeNull();
  });

  it("rejects an invalid status", async () => {
    const result = await updateJobStatus(jobId, "NOT_A_STATUS");
    expect(result.error).not.toBeNull();
  });

  it("saves job info fields", async () => {
    const formData = new FormData();
    formData.set("scopeOfWork", "Updated scope");
    formData.set("addressStreet", "2 B St");
    formData.set("addressCity", "Springfield");
    formData.set("addressState", "IL");
    formData.set("addressZip", "62701");
    formData.set("startDate", "2026-09-01");

    const result = await saveJobInfo(jobId, formData);
    expect(result.error).toBeNull();

    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.scopeOfWork).toBe("Updated scope");
    expect(job.addressStreet).toBe("2 B St");
    expect(job.startDate?.toISOString().slice(0, 10)).toBe("2026-09-01");
  });

  it("replaces line items on save rather than appending, and computes totals", async () => {
    await saveJobLineItems({
      jobId,
      items: [{ type: "LABOR", description: "A", quantity: 2, unitPrice: 50 }],
    });
    await saveJobLineItems({
      jobId,
      items: [
        { type: "LABOR", description: "B", quantity: 1, unitPrice: 100 },
        { type: "MATERIAL", description: "C", quantity: 4, unitPrice: 25 },
      ],
    });

    const items = await prisma.jobLineItem.findMany({ where: { jobId } });
    expect(items).toHaveLength(2);
    const c = items.find((i) => i.description === "C");
    expect(Number(c?.total)).toBeCloseTo(100);
  });

  it("adds and deletes a job photo", async () => {
    const addResult = await addJobPhoto(jobId, "BEFORE", "/uploads/test.jpg", "Test caption");
    expect(addResult.error).toBeNull();

    const photo = await prisma.jobPhoto.findFirstOrThrow({ where: { jobId } });
    expect(photo.phase).toBe("BEFORE");
    expect(photo.caption).toBe("Test caption");

    const deleteResult = await deleteJobPhoto(photo.id);
    expect(deleteResult.error).toBeNull();

    const remaining = await prisma.jobPhoto.findMany({ where: { jobId } });
    expect(remaining).toHaveLength(0);
  });

  it("toggles featuredOnWebsite", async () => {
    await toggleFeaturedOnWebsite(jobId, true);
    let job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.featuredOnWebsite).toBe(true);

    await toggleFeaturedOnWebsite(jobId, false);
    job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.featuredOnWebsite).toBe(false);
  });
});
