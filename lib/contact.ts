import { z } from "zod";

export const contactFormSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  message: z.string().min(1),
});

export type ContactFormInput = z.infer<typeof contactFormSchema>;
