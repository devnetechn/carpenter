import { z } from "zod";
import { prisma } from "@/lib/db";

export const businessInfoSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(7),
  email: z.string().email(),
  addressStreet: z.string().min(1),
  addressCity: z.string().min(1),
  addressState: z.string().length(2),
  addressZip: z.string().min(5),
  taxRate: z.coerce.number().min(0).max(1),
  depositPercent: z.coerce.number().min(0).max(1),
  defaultAppointmentDurationMin: z.coerce.number().int().min(15),
  serviceAreaZips: z.string().transform((value) =>
    value
      .split(",")
      .map((zip) => zip.trim())
      .filter(Boolean)
  ),
});

export type BusinessInfoInput = z.infer<typeof businessInfoSchema>;

export async function getBusinessSettings() {
  const settings = await prisma.businessSettings.findFirst();
  if (!settings) {
    throw new Error("BusinessSettings has not been seeded");
  }
  return settings;
}

export async function updateBusinessSettings(input: BusinessInfoInput) {
  const existing = await prisma.businessSettings.findFirst();
  if (!existing) {
    throw new Error("BusinessSettings has not been seeded");
  }
  return prisma.businessSettings.update({
    where: { id: existing.id },
    data: input,
  });
}
