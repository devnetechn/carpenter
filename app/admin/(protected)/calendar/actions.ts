"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  createAppointmentSchema,
  rescheduleAppointmentSchema,
  type CreateAppointmentInput,
  type RescheduleAppointmentInput,
} from "@/lib/appointment";
import type { Prisma } from "@/lib/generated/prisma/client";

class SlotConflictError extends Error {}

async function assertNoConflict(
  tx: Prisma.TransactionClient,
  start: Date,
  end: Date,
  excludeAppointmentId?: string
) {
  const conflicting = await tx.appointment.findFirst({
    where: {
      status: { not: "CANCELLED" },
      start: { lt: end },
      end: { gt: start },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
  });
  if (conflicting) {
    throw new SlotConflictError();
  }
}

export async function createAppointment(input: CreateAppointmentInput) {
  const parsed = createAppointmentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;
  const start = new Date(data.start);
  const end = new Date(data.end);

  try {
    await prisma.$transaction(async (tx) => {
      await assertNoConflict(tx, start, end);
      await tx.appointment.create({
        data: {
          leadId: data.leadId,
          type: data.type,
          start,
          end,
          notes: data.notes,
          status: "SCHEDULED",
        },
      });
    });
  } catch (err) {
    if (err instanceof SlotConflictError) {
      return { error: { start: ["This time overlaps an existing appointment."] } };
    }
    throw err;
  }

  revalidatePath("/admin/calendar");
  return { error: null };
}

export async function rescheduleAppointment(input: RescheduleAppointmentInput) {
  const parsed = rescheduleAppointmentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;
  const start = new Date(data.start);
  const end = new Date(data.end);

  try {
    await prisma.$transaction(async (tx) => {
      await assertNoConflict(tx, start, end, data.appointmentId);
      await tx.appointment.update({
        where: { id: data.appointmentId },
        data: { start, end },
      });
    });
  } catch (err) {
    if (err instanceof SlotConflictError) {
      return { error: { start: ["This time overlaps an existing appointment."] } };
    }
    throw err;
  }

  revalidatePath("/admin/calendar");
  return { error: null };
}

export async function cancelAppointment(appointmentId: string) {
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "CANCELLED" },
  });
  revalidatePath("/admin/calendar");
  return { error: null };
}
