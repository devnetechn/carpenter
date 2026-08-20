import { z } from "zod";

export const createInvoiceSchema = z.object({
  jobId: z.string().min(1),
  type: z.enum(["DEPOSIT", "PARTIAL", "FINAL"]),
  amount: z.coerce.number().positive(),
  dueDate: z.string().optional(),
});

export const recordPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.coerce.number().positive(),
  method: z.string().min(1),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
