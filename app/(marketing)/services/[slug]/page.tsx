import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { ProjectArt } from "@/components/marketing/project-art";

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = await prisma.service.findUnique({ where: { slug } });

  if (!service || !service.active) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <Link href="/services" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; All Services
      </Link>
      <div className="mt-6 grid gap-10 md:grid-cols-2 md:items-center">
        <div>
          <h1 className="font-serif text-3xl font-semibold">{service.name}</h1>
          <p className="mt-4 text-muted-foreground">{service.description}</p>
          <div className="mt-8">
            <Button size="lg" nativeButton={false} render={<Link href="/quote" />}>
              Request a Quote for {service.name}
            </Button>
          </div>
        </div>
        <ProjectArt service={service.slug} size="lg" />
      </div>
    </div>
  );
}
