"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { queueNotification } from "@/lib/notifications";
import { getBusinessSettings } from "@/lib/settings";
import { NotificationType } from "@/lib/generated/prisma/client";

export async function respondToQuote(
  token: string,
  action: "ACCEPT" | "DECLINE" | "REQUEST_CHANGES",
  message?: string
) {
  const quote = await prisma.quote.findUnique({
    where: { publicToken: token },
    include: { lead: { include: { customer: true } } },
  });
  if (!quote) {
    return { error: "Quote not found" };
  }
  if (quote.status === "ACCEPTED" || quote.status === "DECLINED") {
    return { error: "This quote has already been responded to." };
  }

  const settings = await getBusinessSettings();

  if (action === "ACCEPT") {
    await prisma.quote.update({
      where: { id: quote.id },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });
    await queueNotification({
      type: NotificationType.QUOTE_ACCEPTED,
      recipientEmail: settings.email,
      subject: `${quote.lead.customer.name} accepted their estimate`,
      body: "View the lead in the admin dashboard for details.",
      relatedEntityType: "Quote",
      relatedEntityId: quote.id,
    });
  } else if (action === "DECLINE") {
    await prisma.quote.update({
      where: { id: quote.id },
      data: { status: "DECLINED", respondedAt: new Date() },
    });
    await queueNotification({
      type: NotificationType.QUOTE_DECLINED,
      recipientEmail: settings.email,
      subject: `${quote.lead.customer.name} declined their estimate`,
      body: message ? `Customer note: ${message}` : "No additional comments.",
      relatedEntityType: "Quote",
      relatedEntityId: quote.id,
    });
  } else {
    await queueNotification({
      type: NotificationType.QUOTE_CHANGES_REQUESTED,
      recipientEmail: settings.email,
      subject: `${quote.lead.customer.name} requested changes to their estimate`,
      body: message ?? "No details provided.",
      relatedEntityType: "Quote",
      relatedEntityId: quote.id,
    });
  }

  revalidatePath(`/admin/leads/${quote.leadId}`);
  return { error: null };
}
