import { prisma } from "@/lib/db";
import { ProjectArt } from "@/components/marketing/project-art";

export default async function PortfolioPage() {
  const featuredJobs = await prisma.job.findMany({
    where: { status: "COMPLETED", featuredOnWebsite: true },
    include: {
      lead: { include: { service: true } },
      reviews: { where: { approved: true }, take: 1 },
    },
    orderBy: { completionDate: "desc" },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <h1 className="font-serif text-3xl font-semibold">Portfolio</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        A sample of recent projects across the services we offer.
      </p>
      <div className="mt-10 grid gap-10 md:grid-cols-2">
        {featuredJobs.map((job) => (
          <article key={job.id} className="rounded-lg border p-6">
            <ProjectArt service={job.lead.service.slug} size="lg" />
            <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-accent">
              {job.lead.service.name}
            </p>
            <p className="mt-2 text-muted-foreground">{job.scopeOfWork}</p>
            {job.reviews[0] && (
              <blockquote className="mt-4 border-l-2 border-accent pl-4 text-sm italic text-muted-foreground">
                &ldquo;{job.reviews[0].body}&rdquo;
              </blockquote>
            )}
          </article>
        ))}
      </div>
      {featuredJobs.length === 0 && (
        <p className="mt-10 text-muted-foreground">
          New project photos coming soon — check back shortly.
        </p>
      )}
    </div>
  );
}
