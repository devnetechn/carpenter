import { z } from "zod";

export const quoteItemInputSchema = z.object({
  type: z.enum(["LABOR", "MATERIAL", "OPTIONAL"]),
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  isOptional: z.boolean(),
  isIncluded: z.boolean(),
});

export const saveQuoteDraftSchema = z.object({
  leadId: z.string().min(1),
  items: z.array(quoteItemInputSchema).min(1),
  discount: z.coerce.number().nonnegative(),
  taxRate: z.coerce.number().min(0).max(1),
  depositPercent: z.coerce.number().min(0).max(1),
});

export type QuoteItemInput = z.infer<typeof quoteItemInputSchema>;
export type SaveQuoteDraftInput = z.infer<typeof saveQuoteDraftSchema>;
