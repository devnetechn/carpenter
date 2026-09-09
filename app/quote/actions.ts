"use server";

import { getBusinessSettings } from "@/lib/settings";
import { isWithinServiceArea } from "@/lib/service-area";
import { getAvailableSlots } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { generateBookingRef } from "@/lib/booking-ref";
import { queueNotification } from "@/lib/notifications";
import { submitBookingSchema, type SubmitBookingInput } from "@/lib/booking";
import { NotificationType } from "@/lib/generated/prisma/client";

export async function checkServiceAreaAction(zip: string): Promise<boolean> {
  const settings = await getBusinessSettings();
  return isWithinServiceArea(zip, settings.serviceAreaZips);
}

export async function getAvailableSlotsAction(): Promise<
  { start: string; end: string }[]
> {
  const rangeStart = new Date();
  const rangeEnd = new Date(rangeStart.getTime() + 14 * 24 * 60 * 60 * 1000);
  const slots = await getAvailableSlots(rangeStart, rangeEnd);
  return slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() }));
}

class SlotConflictError extends Error {}

export async function submitBookingAction(input: SubmitBookingInput) {
  const parsed = submitBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors, bookingRef: null };
  }
  const data = parsed.data;
  const slotStart = new Date(data.slotStart);
  const slotEnd = new Date(data.slotEnd);

  const settings = await getBusinessSettings();
  const withinServiceArea = isWithinServiceArea(data.addressZip, settings.serviceAreaZips);
  const newBookingRef = await generateBookingRef();

  let bookingRef: string;
  let leadId: string;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const conflicting = await tx.appointment.findFirst({
        where: {
          status: { not: "CANCELLED" },
          start: { lt: slotEnd },
          end: { gt: slotStart },
        },
      });
      if (conflicting) {
        throw new SlotConflictError();
      }

      let customer = await tx.customer.findFirst({
        where: { email: data.customerEmail },
      });
      if (!customer) {
        customer = await tx.customer.create({
          data: {
            name: data.customerName,
            phone: data.customerPhone,
            email: data.customerEmail,
            addressStreet: data.addressStreet,
            addressCity: data.addressCity,
            addressState: data.addressState,
            addressZip: data.addressZip,
          },
        });
      }

      const lead = await tx.lead.create({
        data: {
          bookingRef: newBookingRef,
          customerId: customer.id,
          serviceId: data.serviceId,
          status: "NEW",
          source: "website",
          budgetMin: data.budgetMin,
          budgetMax: data.budgetMax,
          preferredContact: data.preferredContact,
        },
      });

      await tx.project.create({
        data: {
          leadId: lead.id,
          answers: data.answers,
          addressStreet: data.addressStreet,
          addressCity: data.addressCity,
          addressState: data.addressState,
          addressZip: data.addressZip,
          withinServiceArea,
          budgetMin: data.budgetMin,
          budgetMax: data.budgetMax,
          status: "submitted",
          photos: { create: data.photoUrls.map((url) => ({ url })) },
        },
      });

      await tx.appointment.create({
        data: {
          leadId: lead.id,
          type: "CONSULTATION",
          start: slotStart,
          end: slotEnd,
          status: "SCHEDULED",
        },
      });

      return { bookingRef: lead.bookingRef, leadId: lead.id };
    });
    bookingRef = result.bookingRef;
    leadId = result.leadId;
  } catch (err) {
    if (err instanceof SlotConflictError) {
      return {
        error: { slotStart: ["This time slot was just booked. Please choose another."] },
        bookingRef: null,
      };
    }
    throw err;
  }

  await queueNotification({
    type: NotificationType.NEW_BOOKING,
    recipientEmail: settings.email,
    subject: `New booking request from ${data.customerName}`,
    body: `${data.customerName} requested a quote. Reference: ${bookingRef}`,
    relatedEntityType: "Lead",
    relatedEntityId: leadId,
  });
  await queueNotification({
    type: NotificationType.BOOKING_CONFIRMATION,
    recipientEmail: data.customerEmail,
    subject: `Your request has been received — ${bookingRef}`,
    body: `Thanks for reaching out! Your booking reference is ${bookingRef}. We'll be in touch to confirm your consultation.`,
    relatedEntityType: "Lead",
    relatedEntityId: leadId,
  });

  return { error: null, bookingRef };
}
