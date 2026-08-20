import { describe, it, expect } from "vitest";
import { createAppointmentSchema, rescheduleAppointmentSchema } from "@/lib/appointment";

describe("createAppointmentSchema", () => {
  it("accepts a valid appointment", () => {
    const result = createAppointmentSchema.safeParse({
      leadId: "lead_1",
      type: "CONSULTATION",
      start: "2026-08-24T13:00:00.000Z",
      end: "2026-08-24T14:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid type", () => {
    const result = createAppointmentSchema.safeParse({
      leadId: "lead_1",
      type: "SLEEPOVER",
      start: "2026-08-24T13:00:00.000Z",
      end: "2026-08-24T14:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing leadId", () => {
    const result = createAppointmentSchema.safeParse({
      leadId: "",
      type: "CONSULTATION",
      start: "2026-08-24T13:00:00.000Z",
      end: "2026-08-24T14:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("rescheduleAppointmentSchema", () => {
  it("accepts a valid reschedule payload", () => {
    const result = rescheduleAppointmentSchema.safeParse({
      appointmentId: "appt_1",
      start: "2026-08-24T13:00:00.000Z",
      end: "2026-08-24T14:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing end", () => {
    const result = rescheduleAppointmentSchema.safeParse({
      appointmentId: "appt_1",
      start: "2026-08-24T13:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});
