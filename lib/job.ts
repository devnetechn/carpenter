import { z } from "zod";

export const jobInfoSchema = z.object({
  scopeOfWork: z.string().min(1),
  addressStreet: z.string().min(1),
  addressCity: z.string().min(1),
  addressState: z.string().min(1).max(2),
  addressZip: z.string().min(1),
  startDate: z.string().optional(),
});

export const jobLineItemInputSchema = z.object({
  type: z.enum(["LABOR", "MATERIAL"]),
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
});

export const saveJobLineItemsSchema = z.object({
  jobId: z.string().min(1),
  items: z.array(jobLineItemInputSchema).min(1),
});

export type JobInfoInput = z.infer<typeof jobInfoSchema>;
export type JobLineItemInput = z.infer<typeof jobLineItemInputSchema>;
export type SaveJobLineItemsInput = z.infer<typeof saveJobLineItemsSchema>;
