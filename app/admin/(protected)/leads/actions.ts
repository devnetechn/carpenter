"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { LeadStatus } from "@/lib/generated/prisma/client";

const VALID_STATUSES: string[] = Object.values(LeadStatus);

async function currentAdminUserId(): Promise<string | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  // Defends against a stale JWT session referencing an AdminUser that no
  // longer exists (e.g. re-seeded), which would otherwise surface as an
  // unhandled foreign-key violation instead of a clean auth error.
  const exists = await prisma.adminUser.findUnique({ where: { id }, select: { id: true } });
  return exists ? id : null;
}

export async function updateLeadStatus(leadId: string, status: string) {
  if (!VALID_STATUSES.includes(status)) {
    return { error: "Invalid status" };
  }

  const adminUserId = await currentAdminUserId();
  if (!adminUserId) {
    return { error: "Not authenticated" };
  }

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: leadId },
      data: { status: status as LeadStatus },
    }),
    prisma.auditLog.create({
      data: {
        adminUserId,
        action: "lead.status_updated",
        entityType: "Lead",
        entityId: leadId,
        metadata: { status },
      },
    }),
  ]);

  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/leads");
  return { error: null };
}

export async function addLeadNote(leadId: string, body: string) {
  if (!body.trim()) {
    return { error: "Note cannot be empty" };
  }

  const adminUserId = await currentAdminUserId();
  if (!adminUserId) {
    return { error: "Not authenticated" };
  }

  await prisma.leadNote.create({
    data: {
      leadId,
      adminUserId,
      body: body.trim(),
    },
  });

  revalidatePath(`/admin/leads/${leadId}`);
  return { error: null };
}
