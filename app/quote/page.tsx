import { prisma } from "@/lib/db";
import { BookingWizard } from "@/components/booking/booking-wizard";
import type { ServiceOption } from "@/components/booking/types";

export default async function QuotePage() {
  const rawServices = await prisma.service.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    include: { questions: { orderBy: { sortOrder: "asc" } } },
  });

  const services: ServiceOption[] = rawServices.map((service) => ({
    id: service.id,
    name: service.name,
    slug: service.slug,
    description: service.description,
    questions: service.questions.map((q) => ({
      id: q.id,
      label: q.label,
      fieldType: q.fieldType,
      options: (q.options as string[] | null) ?? null,
      required: q.required,
    })),
  }));

  return <BookingWizard services={services} />;
}
