import { prisma } from "@/lib/db";
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
  return prisma.notification.create({
    data: {
      type: input.type,
      recipientEmail: input.recipientEmail,
      subject: input.subject,
      body: input.body,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
    },
  });
}
