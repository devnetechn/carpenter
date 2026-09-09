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
      name: "Hammerhead Custom Carpentry",
      phone: "(717) 951-6888",
      email: "dimitri@hammerheadcarpentry.com",
      addressStreet: "Service area — no public office address",
      addressCity: "Lancaster",
      addressState: "PA",
      addressZip: "17601",
      taxRate: 0.06,
      depositPercent: 0.3,
      defaultAppointmentDurationMin: 60,
      serviceAreaZips: ["17601", "17602", "17603", "17604", "17605"],
      facebookUrl: "https://www.facebook.com/Hammerhead-Custom-Carpentry-LLC-166597858283/",
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
    {
      name: "Additions",
      slug: "additions",
      description: "From concept to completion, quality residential and commercial additions.",
    },
    {
      name: "Kitchens & Baths",
      slug: "kitchens-baths",
      description: "Make the most-used rooms in the home your favorite rooms with a custom remodel.",
    },
    {
      name: "Finished Basements",
      slug: "finished-basements",
      description: "Turn a walk-in attic or unfinished basement into living space, and value to your home.",
    },
    { name: "Decks", slug: "decks", description: "New deck construction and deck replacements." },
    { name: "Millwork", slug: "millwork", description: "Custom trim, built-ins, and finish millwork." },
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
      { serviceId: created["decks"], label: "Do you have an existing deck?", fieldType: ServiceQuestionFieldType.BOOLEAN, required: true, sortOrder: 0 },
      { serviceId: created["decks"], label: "Approximate dimensions (ft x ft)", fieldType: ServiceQuestionFieldType.TEXT, required: true, sortOrder: 1 },
      { serviceId: created["decks"], label: "New construction or replacement?", fieldType: ServiceQuestionFieldType.SELECT, options: ["New construction", "Replacement"], required: true, sortOrder: 2 },
      { serviceId: created["decks"], label: "Preferred material", fieldType: ServiceQuestionFieldType.SELECT, options: ["Pressure-treated wood", "Cedar", "Composite", "Not sure"], required: false, sortOrder: 3 },
      { serviceId: created["decks"], label: "Desired timeline", fieldType: ServiceQuestionFieldType.TEXT, required: false, sortOrder: 4 },

      { serviceId: created["kitchens-baths"], label: "Number of cabinets", fieldType: ServiceQuestionFieldType.NUMBER, required: true, sortOrder: 0 },
      { serviceId: created["kitchens-baths"], label: "Approximate dimensions", fieldType: ServiceQuestionFieldType.TEXT, required: false, sortOrder: 1 },
      { serviceId: created["kitchens-baths"], label: "Room type", fieldType: ServiceQuestionFieldType.SELECT, options: ["Kitchen", "Bathroom", "Laundry", "Garage", "Other"], required: true, sortOrder: 2 },
      { serviceId: created["kitchens-baths"], label: "Preferred style", fieldType: ServiceQuestionFieldType.TEXT, required: false, sortOrder: 3 },
      { serviceId: created["kitchens-baths"], label: "Do you have existing cabinets to remove?", fieldType: ServiceQuestionFieldType.BOOLEAN, required: true, sortOrder: 4 },
      { serviceId: created["kitchens-baths"], label: "Desired finish", fieldType: ServiceQuestionFieldType.TEXT, required: false, sortOrder: 5 },
    ],
  });

  const featuredProjects = [
    {
      serviceSlug: "decks",
      customerName: "Michael Torres",
      customerEmail: "michael.torres@example.com",
      scopeOfWork:
        "Full replacement of an aging 300 sq ft deck with pressure-treated framing and cedar decking, including a new stair landing and cable railing.",
      rating: 5,
      review:
        "Hammerhead rebuilt our deck from the ground up and it completely changed how we use our backyard. The joinery work is beautiful up close and the crew kept the site spotless the whole time.",
    },
    {
      serviceSlug: "kitchens-baths",
      customerName: "Priya Anand",
      customerEmail: "priya.anand@example.com",
      scopeOfWork:
        "Custom kitchen cabinetry for a 12x14 kitchen remodel: 18 upper and lower units in painted maple with soft-close hardware and a matching island.",
      rating: 5,
      review:
        "The cabinets are exactly what we pictured but couldn't find off the shelf. Every drawer and door is perfectly aligned, and they worked around our schedule without a single missed date.",
    },
    {
      serviceSlug: "millwork",
      customerName: "Sarah Whitfield",
      customerEmail: "sarah.whitfield@example.com",
      scopeOfWork:
        "Floor-to-ceiling built-in bookcases and a window seat with hidden storage for a home office, finished to match existing trim.",
      rating: 5,
      review:
        "You would never know the built-ins weren't original to the house. The attention to matching our existing trim profile was something other contractors didn't even mention.",
    },
    {
      serviceSlug: "additions",
      customerName: "David Chen",
      customerEmail: "david.chen@example.com",
      scopeOfWork:
        "Structural and finish carpentry for a two-room home addition, including new framing, trim, and door installation throughout.",
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
        addressCity: "Lancaster",
        addressState: "PA",
        addressZip: "17601",
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
      email: "dimitri@hammerheadcarpentry.com",
      name: "Dimitri Papadimitriou",
      passwordHash: await bcrypt.hash("ChangeMe123!", 10),
    },
  });

  console.log(
    "Seed complete. Admin login: dimitri@hammerheadcarpentry.com / ChangeMe123! (change this before real use)"
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
