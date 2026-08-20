"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { saveQuoteDraftSchema, type SaveQuoteDraftInput } from "@/lib/quote";
import { computeQuoteTotals } from "@/lib/quote-totals";
import { queueNotification } from "@/lib/notifications";
import { getBusinessSettings } from "@/lib/settings";
import { NotificationType } from "@/lib/generated/prisma/client";

export async function saveQuoteDraft(input: SaveQuoteDraftInput) {
  const parsed = saveQuoteDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors, quoteId: null };
  }
  const data = parsed.data;

  const totals = computeQuoteTotals(data.items, data.discount, data.taxRate, data.depositPercent);

  const existing = await prisma.quote.findFirst({
    where: { leadId: data.leadId, status: "DRAFT" },
  });

  const quote = await prisma.$transaction(async (tx) => {
    const q = existing
      ? await tx.quote.update({
          where: { id: existing.id },
          data: {
            subtotal: totals.subtotal,
            discount: data.discount,
            tax: totals.tax,
            depositAmount: totals.depositAmount,
            total: totals.total,
          },
        })
      : await tx.quote.create({
          data: {
            leadId: data.leadId,
            status: "DRAFT",
            subtotal: totals.subtotal,
            discount: data.discount,
            tax: totals.tax,
            depositAmount: totals.depositAmount,
            total: totals.total,
          },
        });

    await tx.quoteItem.deleteMany({ where: { quoteId: q.id } });
    await tx.quoteItem.createMany({
      data: data.items.map((item, index) => ({
        quoteId: q.id,
        type: item.type,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        isOptional: item.isOptional,
        isIncluded: item.isIncluded,
        sortOrder: index,
      })),
    });

    return q;
  });

  revalidatePath(`/admin/leads/${data.leadId}`);
  return { error: null, quoteId: quote.id };
}

export async function sendQuote(quoteId: string) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { lead: { include: { customer: true } } },
  });
  if (!quote) {
    return { error: "Quote not found" };
  }

  await prisma.$transaction([
    prisma.quote.update({
      where: { id: quoteId },
      data: { status: "SENT", sentAt: new Date() },
    }),
    prisma.lead.update({
      where: { id: quote.leadId },
      data: { status: "ESTIMATE_SENT" },
    }),
  ]);

  const settings = await getBusinessSettings();
  await queueNotification({
    type: NotificationType.QUOTE_SENT,
    recipientEmail: quote.lead.customer.email,
    subject: `Your estimate from ${settings.name}`,
    body: `View your estimate: ${process.env.NEXT_PUBLIC_BASE_URL}/quote/view/${quote.publicToken}`,
    relatedEntityType: "Quote",
    relatedEntityId: quote.id,
  });

  revalidatePath(`/admin/leads/${quote.leadId}`);
  revalidatePath("/admin/quotes");
  return { error: null };
}
