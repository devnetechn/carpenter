import { z } from "zod";

export const submitReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  projectType: z.string().min(1),
  body: z.string().min(1),
});

export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
