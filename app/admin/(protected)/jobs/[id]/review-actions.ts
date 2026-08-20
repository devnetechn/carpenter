"use server";

import { prisma } from "@/lib/db";
import { queueNotification } from "@/lib/notifications";
import { NotificationType } from "@/lib/generated/prisma/client";

export async function sendReviewRequest(jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { customer: true } });
  if (!job) {
    return { error: "Job not found" };
  }
  if (job.status !== "COMPLETED") {
    return { error: "Job must be completed before requesting a review." };
  }

  await queueNotification({
    type: NotificationType.REVIEW_REQUEST,
    recipientEmail: job.customer.email,
    subject: "How did we do?",
    body: `We'd love to hear about your experience: ${process.env.NEXT_PUBLIC_BASE_URL}/review/submit/${jobId}`,
    relatedEntityType: "Job",
    relatedEntityId: jobId,
  });

  return { error: null };
}
