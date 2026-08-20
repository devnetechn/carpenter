import Link from "next/link";
import { prisma } from "@/lib/db";
import { ProjectArt } from "@/components/marketing/project-art";

export default async function ServicesPage() {
  const services = await prisma.service.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <h1 className="font-serif text-3xl font-semibold">Services</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        From a single repair to a full remodel, here&apos;s what we build.
      </p>
      <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => (
          <Link
            key={service.id}
            href={`/services/${service.slug}`}
            className="group block rounded-lg border p-4 transition-colors hover:border-accent"
          >
            <ProjectArt service={service.slug} size="sm" />
            <p className="mt-4 font-semibold group-hover:text-accent">{service.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{service.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
