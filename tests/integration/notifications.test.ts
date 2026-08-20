import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { queueNotification } from "@/lib/notifications";
import { NotificationType } from "@/lib/generated/prisma/client";

describe("queueNotification", () => {
  afterEach(async () => {
    await prisma.notification.deleteMany();
  });

  it("writes a QUEUED notification row", async () => {
    const notification = await queueNotification({
      type: NotificationType.NEW_BOOKING,
      recipientEmail: "owner@example.com",
      subject: "New inquiry",
      body: "Someone submitted the contact form.",
      relatedEntityType: "Lead",
      relatedEntityId: "lead_123",
    });

    expect(notification.status).toBe("QUEUED");
    expect(notification.sentAt).toBeNull();

    const found = await prisma.notification.findUnique({
      where: { id: notification.id },
    });
    expect(found?.subject).toBe("New inquiry");
  });
});
