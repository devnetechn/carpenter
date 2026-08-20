import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  ServiceQuestionFieldType,
} from "../lib/generated/prisma/client";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.businessSettings.deleteMany();
  await prisma.businessSettings.create({
    data: {
      name: "Heritage Fine Carpentry",
      phone: "(555) 019-2837",
      email: "info@heritagefinecarpentry.example",
      addressStreet: "412 Millwright Ave",
      addressCity: "Riverton",
      addressState: "OH",
      addressZip: "45501",
      taxRate: 0.0725,
      depositPercent: 0.3,
      defaultAppointmentDurationMin: 60,
      serviceAreaZips: ["45501", "45502", "45503", "45504", "45505"],
    },
  });

  await prisma.businessHours.deleteMany();
  const weekdayHours = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
    dayOfWeek,
    openTime: "08:00",
    closeTime: "17:00",
    isClosed: false,
  }));
  await prisma.businessHours.createMany({
    data: [
      { dayOfWeek: 0, openTime: "00:00", closeTime: "00:00", isClosed: true },
      ...weekdayHours,
      { dayOfWeek: 6, openTime: "09:00", closeTime: "13:00", isClosed: false },
    ],
  });

  await prisma.serviceQuestion.deleteMany();
  await prisma.service.deleteMany();

  const services = [
    { name: "Custom Carpentry", slug: "custom-carpentry", description: "Bespoke carpentry for any space." },
    { name: "Custom Cabinets", slug: "custom-cabinets", description: "Built-to-order cabinetry." },
    { name: "Built-ins", slug: "built-ins", description: "Bookcases, benches, and built-in storage." },
    { name: "Deck Construction", slug: "deck-construction", description: "New decks and replacements." },
    { name: "Fence Construction", slug: "fence-construction", description: "Residential fencing." },
    { name: "Door Installation", slug: "door-installation", description: "Interior and exterior doors." },
    { name: "Window Installation", slug: "window-installation", description: "Window replacement and install." },
    { name: "Trim & Molding", slug: "trim-molding", description: "Baseboards, crown molding, casing." },
    { name: "Framing", slug: "framing", description: "Structural framing work." },
    { name: "Furniture", slug: "furniture", description: "Custom furniture pieces." },
    { name: "Remodeling", slug: "remodeling", description: "Room and whole-space remodels." },
    { name: "Carpentry Repairs", slug: "carpentry-repairs", description: "Repairs and small fixes." },
    { name: "Other", slug: "other", description: "Something not listed above." },
  ];

  const created: Record<string, string> = {};
  for (const [index, s] of services.entries()) {
    const service = await prisma.service.create({
      data: { ...s, sortOrder: index },
    });
    created[s.slug] = service.id;
  }

  await prisma.serviceQuestion.createMany({
    data: [
      { serviceId: created["deck-construction"], label: "Do you have an existing deck?", fieldType: ServiceQuestionFieldType.BOOLEAN, required: true, sortOrder: 0 },
      { serviceId: created["deck-construction"], label: "Approximate dimensions (ft x ft)", fieldType: ServiceQuestionFieldType.TEXT, required: true, sortOrder: 1 },
      { serviceId: created["deck-construction"], label: "New construction or replacement?", fieldType: ServiceQuestionFieldType.SELECT, options: ["New construction", "Replacement"], required: true, sortOrder: 2 },
      { serviceId: created["deck-construction"], label: "Preferred material", fieldType: ServiceQuestionFieldType.SELECT, options: ["Pressure-treated wood", "Cedar", "Composite", "Not sure"], required: false, sortOrder: 3 },
      { serviceId: created["deck-construction"], label: "Desired timeline", fieldType: ServiceQuestionFieldType.TEXT, required: false, sortOrder: 4 },

      { serviceId: created["custom-cabinets"], label: "Number of cabinets", fieldType: ServiceQuestionFieldType.NUMBER, required: true, sortOrder: 0 },
      { serviceId: created["custom-cabinets"], label: "Approximate dimensions", fieldType: ServiceQuestionFieldType.TEXT, required: false, sortOrder: 1 },
      { serviceId: created["custom-cabinets"], label: "Room type", fieldType: ServiceQuestionFieldType.SELECT, options: ["Kitchen", "Bathroom", "Laundry", "Garage", "Other"], required: true, sortOrder: 2 },
      { serviceId: created["custom-cabinets"], label: "Preferred style", fieldType: ServiceQuestionFieldType.TEXT, required: false, sortOrder: 3 },
      { serviceId: created["custom-cabinets"], label: "Do you have existing cabinets to remove?", fieldType: ServiceQuestionFieldType.BOOLEAN, required: true, sortOrder: 4 },
      { serviceId: created["custom-cabinets"], label: "Desired finish", fieldType: ServiceQuestionFieldType.TEXT, required: false, sortOrder: 5 },
    ],
  });

  await prisma.adminUser.deleteMany();
  await prisma.adminUser.create({
    data: {
      email: "admin@heritagefinecarpentry.example",
      name: "Business Owner",
      passwordHash: await bcrypt.hash("ChangeMe123!", 10),
    },
  });

  console.log(
    "Seed complete. Admin login: admin@heritagefinecarpentry.example / ChangeMe123! (change this before real use)"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
