import { z } from "zod";

export const addressSchema = z.object({
  addressStreet: z.string().min(1),
  addressCity: z.string().min(1),
  addressState: z.string().length(2),
  addressZip: z.string().min(5),
});

export const customerInfoSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().min(7),
  customerEmail: z.string().email(),
  preferredContact: z.enum(["EMAIL", "PHONE", "TEXT"]),
});

export const submitBookingSchema = z.object({
  serviceId: z.string().min(1),
  answers: z.record(z.string(), z.string()),
  photoUrls: z.array(z.string()).max(10),
  addressStreet: z.string().min(1),
  addressCity: z.string().min(1),
  addressState: z.string().length(2),
  addressZip: z.string().min(5),
  budgetMin: z.coerce.number().nonnegative().optional(),
  budgetMax: z.coerce.number().nonnegative().optional(),
  slotStart: z.string().min(1),
  slotEnd: z.string().min(1),
  customerName: z.string().min(1),
  customerPhone: z.string().min(7),
  customerEmail: z.string().email(),
  preferredContact: z.enum(["EMAIL", "PHONE", "TEXT"]),
});

export type SubmitBookingInput = z.infer<typeof submitBookingSchema>;
