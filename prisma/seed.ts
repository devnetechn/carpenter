import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  ServiceQuestionFieldType,
} from "../lib/generated/prisma/client";
import bcrypt from "bcryptjs";
import { generateBookingRef } from "../lib/booking-ref";

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

  // Delete everything that references Service/Lead/AdminUser before
  // recreating them, so re-running the seed never hits a foreign key
  // violation — including admin-generated data (AuditLog, LeadNote) that
  // accumulates from using the admin dashboard between seed runs.
  await prisma.auditLog.deleteMany();
  await prisma.review.deleteMany();
  await prisma.job.deleteMany();
  await prisma.leadNote.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.projectPhoto.deleteMany();
  await prisma.project.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.customer.deleteMany();

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

  const featuredProjects = [
    {
      serviceSlug: "deck-construction",
      customerName: "Michael Torres",
      customerEmail: "michael.torres@example.com",
      scopeOfWork:
        "Full replacement of an aging 300 sq ft deck with pressure-treated framing and cedar decking, including a new stair landing and cable railing.",
      rating: 5,
      review:
        "Heritage Fine Carpentry rebuilt our deck from the ground up and it completely changed how we use our backyard. The joinery work is beautiful up close and the crew kept the site spotless the whole time.",
    },
    {
      serviceSlug: "custom-cabinets",
      customerName: "Priya Anand",
      customerEmail: "priya.anand@example.com",
      scopeOfWork:
        "Custom kitchen cabinetry for a 12x14 kitchen remodel: 18 upper and lower units in painted maple with soft-close hardware and a matching island.",
      rating: 5,
      review:
        "The cabinets are exactly what we pictured but couldn't find off the shelf. Every drawer and door is perfectly aligned, and they worked around our schedule without a single missed date.",
    },
    {
      serviceSlug: "built-ins",
      customerName: "Sarah Whitfield",
      customerEmail: "sarah.whitfield@example.com",
      scopeOfWork:
        "Floor-to-ceiling built-in bookcases and a window seat with hidden storage for a home office, finished to match existing trim.",
      rating: 5,
      review:
        "You would never know the built-ins weren't original to the house. The attention to matching our existing trim profile was something other contractors didn't even mention.",
    },
    {
      serviceSlug: "remodeling",
      customerName: "David Chen",
      customerEmail: "david.chen@example.com",
      scopeOfWork:
        "Structural and finish carpentry for a two-room addition remodel, including new framing, trim, and door installation throughout.",
      rating: 4,
      review:
        "Solid, reliable work from a crew that communicated clearly at every stage. The finish carpentry on the trim and doors is what really stood out to us.",
    },
  ];

  for (const project of featuredProjects) {
    const service = await prisma.service.findUniqueOrThrow({
      where: { slug: project.serviceSlug },
    });
    const customer = await prisma.customer.create({
      data: {
        name: project.customerName,
        phone: "555-010-0100",
        email: project.customerEmail,
      },
    });
    const lead = await prisma.lead.create({
      data: {
        bookingRef: await generateBookingRef(),
        customerId: customer.id,
        serviceId: service.id,
        status: "COMPLETED",
        source: "seed",
      },
    });
    const job = await prisma.job.create({
      data: {
        leadId: lead.id,
        customerId: customer.id,
        status: "COMPLETED",
        featuredOnWebsite: true,
        scopeOfWork: project.scopeOfWork,
        addressStreet: "100 Example St",
        addressCity: "Riverton",
        addressState: "OH",
        addressZip: "45501",
        completionDate: new Date(),
      },
    });
    await prisma.review.create({
      data: {
        jobId: job.id,
        customerId: customer.id,
        rating: project.rating,
        body: project.review,
        projectType: service.name,
        approved: true,
      },
    });
  }

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
