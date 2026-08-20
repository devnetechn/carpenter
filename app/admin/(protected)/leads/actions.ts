"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { LeadStatus } from "@/lib/generated/prisma/client";

const VALID_STATUSES: string[] = Object.values(LeadStatus);

export async function updateLeadStatus(leadId: string, status: string) {
  if (!VALID_STATUSES.includes(status)) {
    return { error: "Invalid status" };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Not authenticated" };
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: { status: status as LeadStatus },
  });

  await prisma.auditLog.create({
    data: {
      adminUserId: session.user.id,
      action: "lead.status_updated",
      entityType: "Lead",
      entityId: leadId,
      metadata: { status },
    },
  });

  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/leads");
  return { error: null };
}

export async function addLeadNote(leadId: string, body: string) {
  if (!body.trim()) {
    return { error: "Note cannot be empty" };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Not authenticated" };
  }

  await prisma.leadNote.create({
    data: {
      leadId,
      adminUserId: session.user.id,
      body: body.trim(),
    },
  });

  revalidatePath(`/admin/leads/${leadId}`);
  return { error: null };
}
