import Link from "next/link";
import { prisma } from "@/lib/db";
import { getBusinessSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { ProjectArt } from "@/components/marketing/project-art";

export default async function HomePage() {
  const [settings, featuredJobs] = await Promise.all([
    getBusinessSettings(),
    prisma.job.findMany({
      where: { status: "COMPLETED", featuredOnWebsite: true },
      include: {
        lead: { include: { service: true } },
        reviews: { where: { approved: true }, take: 1 },
      },
      take: 3,
    }),
  ]);

  return (
    <div>
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">
            Serving {settings.addressCity} County and the surrounding area
          </p>
          <h1 className="mt-4 font-serif text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Home Improvements, Renovations &amp; Additions
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            {settings.name} provides services for all phases of home improvement,
            including additions, kitchens, bathrooms, decks, and finished basements.
            We&apos;ve served homeowners in {settings.addressCity} County and the
            surrounding area with fairness, honesty, and integrity for over 15 years.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Button size="lg" nativeButton={false} render={<Link href="/quote" />}>
              Request a Quote
            </Button>
            <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/quote" />}>
              Book a Consultation
            </Button>
          </div>
        </div>
      </section>

      <section className="border-y bg-secondary/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-serif text-2xl font-semibold">Recent Work</h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {featuredJobs.map((job) => (
              <div key={job.id}>
                <ProjectArt service={job.lead.service.slug} size="md" />
                <p className="mt-4 text-sm font-semibold">{job.lead.service.name}</p>
                {job.reviews[0] && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    &ldquo;{job.reviews[0].body}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="mt-10">
            <Button variant="outline" nativeButton={false} render={<Link href="/portfolio" />}>
              View Full Portfolio
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h2 className="font-serif text-2xl font-semibold">Ready to get started?</h2>
        <p className="mt-3 text-muted-foreground">
          Big or small, your project will be customized to suit your style and budget.
          Contact us for a one-on-one consultation.
        </p>
        <div className="mt-6">
          <Button size="lg" nativeButton={false} render={<Link href="/quote" />}>
            Request a Quote
          </Button>
        </div>
      </section>
    </div>
  );
}
