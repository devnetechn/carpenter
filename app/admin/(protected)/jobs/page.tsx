import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { JOB_STATUSES } from "@/lib/job-status";
import type { JobStatus } from "@/lib/generated/prisma/client";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const jobs = await prisma.job.findMany({
    where: status ? { status: status as JobStatus } : undefined,
    include: { lead: { include: { customer: true, service: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Jobs</h1>
        <form className="flex items-center gap-2">
          <select
            name="status"
            defaultValue={status ?? ""}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">All statuses</option>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm">
            Filter
          </button>
        </form>
      </div>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 pr-4">Customer</th>
              <th className="pb-2 pr-4">Service</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Start Date</th>
              <th className="pb-2">Completion Date</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  <Link href={`/admin/jobs/${job.id}`} className="text-accent hover:underline">
                    {job.lead.customer.name}
                  </Link>
                </td>
                <td className="py-2 pr-4">{job.lead.service.name}</td>
                <td className="py-2 pr-4">
                  <Badge variant="secondary">{job.status}</Badge>
                </td>
                <td className="py-2 pr-4">
                  {job.startDate ? job.startDate.toLocaleDateString() : "—"}
                </td>
                <td className="py-2">
                  {job.completionDate ? job.completionDate.toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {jobs.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">No jobs match this filter.</p>
        )}
      </div>
    </div>
  );
}
