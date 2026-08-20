"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { submitReviewSchema, type SubmitReviewInput } from "@/lib/review";
import { queueNotification } from "@/lib/notifications";
import { getBusinessSettings } from "@/lib/settings";
import { NotificationType } from "@/lib/generated/prisma/client";

export async function submitReview(jobId: string, input: SubmitReviewInput) {
  const parsed = submitReviewSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { customer: true, reviews: true },
  });
  if (!job) {
    return { error: "Job not found" };
  }
  if (job.status !== "COMPLETED") {
    return { error: "This project isn't marked complete yet." };
  }
  if (job.reviews.length > 0) {
    return { error: "A review has already been submitted for this project." };
  }

  await prisma.review.create({
    data: {
      jobId,
      customerId: job.customerId,
      rating: data.rating,
      body: data.body,
      projectType: data.projectType,
    },
  });

  const settings = await getBusinessSettings();
  await queueNotification({
    type: NotificationType.REVIEW_SUBMITTED,
    recipientEmail: settings.email,
    subject: `New review from ${job.customer.name}`,
    body: `${data.rating}/5 — ${data.body}`,
    relatedEntityType: "Job",
    relatedEntityId: jobId,
  });

  revalidatePath(`/review/submit/${jobId}`);
  revalidatePath("/admin/reviews");
  return { error: null };
}
