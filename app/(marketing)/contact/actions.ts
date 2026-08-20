"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { contactFormSchema } from "@/lib/contact";
import { generateBookingRef } from "@/lib/booking-ref";
import { queueNotification } from "@/lib/notifications";
import { getBusinessSettings } from "@/lib/settings";
import { NotificationType } from "@/lib/generated/prisma/client";

export async function submitContactInquiry(formData: FormData) {
  const parsed = contactFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }
  const { name, email, phone, message } = parsed.data;

  const otherService = await prisma.service.findUniqueOrThrow({
    where: { slug: "other" },
  });

  let customer = await prisma.customer.findFirst({ where: { email } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: { name, email, phone: phone ?? "" },
    });
  }

  const lead = await prisma.lead.create({
    data: {
      bookingRef: await generateBookingRef(),
      customerId: customer.id,
      serviceId: otherService.id,
      status: "NEW",
      source: "contact-form",
      notes: message,
    },
  });

  const settings = await getBusinessSettings();
  await queueNotification({
    type: NotificationType.NEW_BOOKING,
    recipientEmail: settings.email,
    subject: `New contact form inquiry from ${name}`,
    body: message,
    relatedEntityType: "Lead",
    relatedEntityId: lead.id,
  });

  revalidatePath("/contact");
  return { error: null };
}
