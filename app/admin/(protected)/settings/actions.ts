"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { businessInfoSchema, updateBusinessSettings } from "@/lib/settings";

export async function saveBusinessInfo(formData: FormData) {
  const parsed = businessInfoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }
  await updateBusinessSettings(parsed.data);
  revalidatePath("/admin/settings");
  return { error: null };
}

export async function saveBusinessHours(formData: FormData) {
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const isClosed = formData.get("isClosed") === "on";
  const openTime = String(formData.get("openTime"));
  const closeTime = String(formData.get("closeTime"));

  await prisma.businessHours.upsert({
    where: { dayOfWeek },
    update: { openTime, closeTime, isClosed },
    create: { dayOfWeek, openTime, closeTime, isClosed },
  });
  revalidatePath("/admin/settings");
}

export async function addBlockedTime(formData: FormData) {
  const start = new Date(String(formData.get("start")));
  const end = new Date(String(formData.get("end")));
  const reasonRaw = formData.get("reason");
  const reason = reasonRaw ? String(reasonRaw) : null;

  await prisma.blockedTime.create({ data: { start, end, reason } });
  revalidatePath("/admin/settings");
  revalidatePath("/admin/calendar");
}

export async function removeBlockedTime(id: string) {
  await prisma.blockedTime.delete({ where: { id } });
  revalidatePath("/admin/settings");
  revalidatePath("/admin/calendar");
}
