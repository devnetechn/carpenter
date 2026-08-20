import { prisma } from "@/lib/db";

function randomSuffix(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function generateBookingRef(): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `CW-${year}-${randomSuffix()}`;
    const existing = await prisma.lead.findUnique({
      where: { bookingRef: candidate },
    });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique booking reference");
}
