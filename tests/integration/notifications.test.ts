import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { NotificationType } from "@/lib/generated/prisma/client";

describe("queueNotification", () => {
  afterEach(async () => {
    await prisma.notification.deleteMany();
    vi.doUnmock("@/lib/email-provider");
    vi.resetModules();
  });

  it("writes a QUEUED notification row when no email provider is configured", async () => {
    const { queueNotification } = await import("@/lib/notifications");
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

  it("marks the notification SENT when the email provider succeeds", async () => {
    vi.doMock("@/lib/email-provider", () => ({
      emailProvider: { send: vi.fn().mockResolvedValue({ status: "sent" }) },
    }));
    vi.resetModules();
    const { queueNotification } = await import("@/lib/notifications");

    const notification = await queueNotification({
      type: NotificationType.NEW_BOOKING,
      recipientEmail: "owner@example.com",
      subject: "Sent test",
      body: "Body",
    });

    expect(notification.status).toBe("SENT");
    expect(notification.sentAt).not.toBeNull();
  });

  it("marks the notification FAILED when the email provider errors", async () => {
    vi.doMock("@/lib/email-provider", () => ({
      emailProvider: { send: vi.fn().mockResolvedValue({ status: "failed", error: "boom" }) },
    }));
    vi.resetModules();
    const { queueNotification } = await import("@/lib/notifications");

    const notification = await queueNotification({
      type: NotificationType.NEW_BOOKING,
      recipientEmail: "owner@example.com",
      subject: "Failed test",
      body: "Body",
    });

    expect(notification.status).toBe("FAILED");
    expect(notification.sentAt).toBeNull();
  });
});
