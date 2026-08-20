"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function approveReview(reviewId: string) {
  await prisma.review.update({ where: { id: reviewId }, data: { approved: true } });
  revalidatePath("/admin/reviews");
  revalidatePath("/portfolio");
  revalidatePath("/");
  return { error: null };
}

export async function deleteReview(reviewId: string) {
  await prisma.review.delete({ where: { id: reviewId } });
  revalidatePath("/admin/reviews");
  revalidatePath("/portfolio");
  revalidatePath("/");
  return { error: null };
}
