"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  createInvoiceSchema,
  recordPaymentSchema,
  type CreateInvoiceInput,
  type RecordPaymentInput,
} from "@/lib/payment";
import { computeInvoiceStatus } from "@/lib/invoice-totals";
import { paymentProvider } from "@/lib/payment-provider";
import { queueNotification } from "@/lib/notifications";
import { getBusinessSettings } from "@/lib/settings";
import { NotificationType } from "@/lib/generated/prisma/client";

export async function createInvoice(input: CreateInvoiceInput) {
  const parsed = createInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  await prisma.invoice.create({
    data: {
      jobId: data.jobId,
      type: data.type,
      amount: data.amount,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
    },
  });

  revalidatePath(`/admin/jobs/${data.jobId}`);
  revalidatePath("/admin/payments");
  return { error: null };
}

export async function recordPayment(input: RecordPaymentInput) {
  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  const invoice = await prisma.invoice.findUnique({
    where: { id: data.invoiceId },
    include: { payments: true, job: { include: { customer: true } } },
  });
  if (!invoice) {
    return { error: "Invoice not found" };
  }

  await paymentProvider.recordPayment({
    invoiceId: data.invoiceId,
    amount: data.amount,
    method: data.method,
  });

  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        invoiceId: data.invoiceId,
        amount: data.amount,
        method: data.method,
        status: "SUCCEEDED",
        paidAt: new Date(),
      },
    });

    const existingPaid = invoice.payments
      .filter((p) => p.status === "SUCCEEDED")
      .reduce((sum, p) => sum + Number(p.amount.toString()), 0);
    const newStatus = computeInvoiceStatus(
      Number(invoice.amount.toString()),
      existingPaid + data.amount,
      invoice.status
    );

    await tx.invoice.update({ where: { id: invoice.id }, data: { status: newStatus } });
  });

  const settings = await getBusinessSettings();
  await queueNotification({
    type: NotificationType.PAYMENT_RECEIVED,
    recipientEmail: settings.email,
    subject: `Payment recorded for ${invoice.job.customer.name}`,
    body: `$${data.amount.toFixed(2)} via ${data.method} recorded against invoice ${invoice.id}.`,
    relatedEntityType: "Invoice",
    relatedEntityId: invoice.id,
  });

  revalidatePath(`/admin/jobs/${invoice.jobId}`);
  revalidatePath("/admin/payments");
  return { error: null };
}
