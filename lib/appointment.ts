import { z } from "zod";

export const createAppointmentSchema = z.object({
  leadId: z.string().min(1),
  type: z.enum(["CONSULTATION", "FOLLOW_UP", "JOB_VISIT"]),
  start: z.string().min(1),
  end: z.string().min(1),
  notes: z.string().optional(),
});

export const rescheduleAppointmentSchema = z.object({
  appointmentId: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>;
