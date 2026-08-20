import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { ReviewActions } from "@/components/admin/review-actions";

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const reviews = await prisma.review.findMany({
    where: status === "pending" ? { approved: false } : status === "approved" ? { approved: true } : undefined,
    include: { customer: true, job: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Reviews</h1>
        <form className="flex items-center gap-2">
          <select
            name="status"
            defaultValue={status ?? ""}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
          </select>
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm">
            Filter
          </button>
        </form>
      </div>
      <div className="mt-6 space-y-3">
        {reviews.map((review) => (
          <div key={review.id} className="rounded-md border p-3 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{review.customer.name}</span>{" "}
                <span className="text-muted-foreground">
                  · {review.projectType} · {review.rating}/5
                </span>
              </div>
              <Badge variant="secondary">{review.approved ? "Approved" : "Pending"}</Badge>
            </div>
            <p className="mt-2 text-muted-foreground">{review.body}</p>
            <Link
              href={`/admin/jobs/${review.jobId}`}
              className="mt-1 inline-block text-xs text-accent hover:underline"
            >
              View job
            </Link>
            <ReviewActions reviewId={review.id} approved={review.approved} />
          </div>
        ))}
        {reviews.length === 0 && (
          <p className="text-sm text-muted-foreground">No reviews match this filter.</p>
        )}
      </div>
    </div>
  );
}
