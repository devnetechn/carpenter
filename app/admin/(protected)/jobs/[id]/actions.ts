"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { jobInfoSchema, saveJobLineItemsSchema, type SaveJobLineItemsInput } from "@/lib/job";
import { JobStatus, JobPhotoPhase } from "@/lib/generated/prisma/client";

const VALID_STATUSES: string[] = Object.values(JobStatus);
const VALID_PHASES: string[] = Object.values(JobPhotoPhase);

export async function updateJobStatus(jobId: string, status: string) {
  if (!VALID_STATUSES.includes(status)) {
    return { error: "Invalid status" };
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: status as JobStatus,
      completionDate: status === "COMPLETED" ? new Date() : null,
    },
  });

  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin/jobs");
  return { error: null };
}

export async function saveJobInfo(jobId: string, formData: FormData) {
  const parsed = jobInfoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  await prisma.job.update({
    where: { id: jobId },
    data: {
      scopeOfWork: data.scopeOfWork,
      addressStreet: data.addressStreet,
      addressCity: data.addressCity,
      addressState: data.addressState,
      addressZip: data.addressZip,
      startDate: data.startDate ? new Date(data.startDate) : null,
    },
  });

  revalidatePath(`/admin/jobs/${jobId}`);
  return { error: null };
}

export async function saveJobLineItems(input: SaveJobLineItemsInput) {
  const parsed = saveJobLineItemsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  await prisma.$transaction(async (tx) => {
    await tx.jobLineItem.deleteMany({ where: { jobId: data.jobId } });
    await tx.jobLineItem.createMany({
      data: data.items.map((item) => ({
        jobId: data.jobId,
        type: item.type,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.quantity * item.unitPrice,
      })),
    });
  });

  revalidatePath(`/admin/jobs/${data.jobId}`);
  return { error: null };
}

export async function addJobPhoto(jobId: string, phase: string, url: string, caption?: string) {
  if (!VALID_PHASES.includes(phase)) {
    return { error: "Invalid photo phase" };
  }

  await prisma.jobPhoto.create({
    data: { jobId, phase: phase as JobPhotoPhase, url, caption: caption?.trim() || null },
  });

  revalidatePath(`/admin/jobs/${jobId}`);
  return { error: null };
}

export async function deleteJobPhoto(photoId: string) {
  const photo = await prisma.jobPhoto.findUnique({ where: { id: photoId } });
  if (!photo) {
    return { error: "Photo not found" };
  }

  await prisma.jobPhoto.delete({ where: { id: photoId } });
  await storage.delete(photo.url);

  revalidatePath(`/admin/jobs/${photo.jobId}`);
  return { error: null };
}

export async function toggleFeaturedOnWebsite(jobId: string, next: boolean) {
  await prisma.job.update({ where: { id: jobId }, data: { featuredOnWebsite: next } });
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin/jobs");
  revalidatePath("/portfolio");
  revalidatePath("/");
  return { error: null };
}
