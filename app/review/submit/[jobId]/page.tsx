import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getBusinessSettings } from "@/lib/settings";
import { ReviewForm } from "@/components/review/review-form";

export const dynamic = "force-dynamic";

export default async function SubmitReviewPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { lead: { include: { service: true } }, reviews: true },
  });

  if (!job) {
    notFound();
  }

  const settings = await getBusinessSettings();

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <p className="text-sm text-muted-foreground">{settings.name}</p>
      <h1 className="mt-2 font-serif text-2xl font-semibold">Share your experience</h1>
      <p className="text-sm text-muted-foreground">{job.scopeOfWork}</p>

      <div className="mt-8">
        {job.status !== "COMPLETED" ? (
          <p className="text-sm text-muted-foreground">
            This project isn&apos;t marked complete yet — please check back once it&apos;s finished.
          </p>
        ) : job.reviews.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Thanks — you&apos;ve already left a review for this project.
          </p>
        ) : (
          <ReviewForm jobId={job.id} defaultProjectType={job.lead.service.name} />
        )}
      </div>
    </div>
  );
}
