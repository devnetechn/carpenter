import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let adminUserId: string;
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: adminUserId } })),
}));

const { updateLeadStatus, addLeadNote } = await import(
  "@/app/admin/(protected)/leads/actions"
);

async function seedLead() {
  const service = await prisma.service.create({
    data: { name: "Test", slug: "leads-test-service", description: "d" },
  });
  const customer = await prisma.customer.create({
    data: { name: "Jane", phone: "555", email: "leads-test@example.com" },
  });
  return prisma.lead.create({
    data: {
      bookingRef: "CW-2026-9999",
      customerId: customer.id,
      serviceId: service.id,
      status: "NEW",
    },
  });
}

describe("lead admin actions", () => {
  beforeEach(async () => {
    await prisma.leadNote.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "leads-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "leads-test-service" } });
    await prisma.adminUser.deleteMany({ where: { email: "leads-test-admin@example.com" } });

    const admin = await prisma.adminUser.create({
      data: { email: "leads-test-admin@example.com", name: "Admin", passwordHash: "x" },
    });
    adminUserId = admin.id;
  });

  afterAll(async () => {
    await prisma.leadNote.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "leads-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "leads-test-service" } });
    await prisma.adminUser.deleteMany({ where: { email: "leads-test-admin@example.com" } });
  });

  it("updates lead status and writes an audit log", async () => {
    const lead = await seedLead();
    const result = await updateLeadStatus(lead.id, "CONTACTED");
    expect(result.error).toBeNull();

    const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updated.status).toBe("CONTACTED");

    const auditLogs = await prisma.auditLog.findMany({ where: { entityId: lead.id } });
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].action).toBe("lead.status_updated");
  });

  it("rejects an invalid status", async () => {
    const lead = await seedLead();
    const result = await updateLeadStatus(lead.id, "NOT_A_STATUS");
    expect(result.error).not.toBeNull();
  });

  it("fails gracefully, without changing the lead, when the session references a deleted admin user", async () => {
    const lead = await seedLead();
    const staleId = adminUserId;
    await prisma.adminUser.delete({ where: { id: staleId } });

    const result = await updateLeadStatus(lead.id, "CONTACTED");
    expect(result.error).not.toBeNull();

    const unchanged = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(unchanged.status).toBe("NEW");

    // Recreate for afterEach/afterAll cleanup expectations elsewhere in this file.
    adminUserId = (
      await prisma.adminUser.create({
        data: { email: "leads-test-admin@example.com", name: "Admin", passwordHash: "x" },
      })
    ).id;
  });

  it("adds a note tied to the current admin user", async () => {
    const lead = await seedLead();
    const result = await addLeadNote(lead.id, "Called, left voicemail.");
    expect(result.error).toBeNull();

    const notes = await prisma.leadNote.findMany({ where: { leadId: lead.id } });
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toBe("Called, left voicemail.");
    expect(notes[0].adminUserId).toBe(adminUserId);
  });

  it("rejects an empty note", async () => {
    const lead = await seedLead();
    const result = await addLeadNote(lead.id, "   ");
    expect(result.error).not.toBeNull();
  });
});
