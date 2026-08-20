import { prisma } from "@/lib/db";
import { emailProvider } from "@/lib/email-provider";
import type { NotificationType } from "@/lib/generated/prisma/client";

export interface QueueNotificationInput {
  type: NotificationType;
  recipientEmail: string;
  subject: string;
  body: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export async function queueNotification(input: QueueNotificationInput) {
  const notification = await prisma.notification.create({
    data: {
      type: input.type,
      recipientEmail: input.recipientEmail,
      subject: input.subject,
      body: input.body,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
    },
  });

  const result = await emailProvider.send({
    to: input.recipientEmail,
    subject: input.subject,
    body: input.body,
  });

  if (result.status === "sent") {
    return prisma.notification.update({
      where: { id: notification.id },
      data: { status: "SENT", sentAt: new Date() },
    });
  }
  if (result.status === "failed") {
    return prisma.notification.update({
      where: { id: notification.id },
      data: { status: "FAILED" },
    });
  }
  return notification;
}
