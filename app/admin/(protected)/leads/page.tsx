import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { LEAD_STATUSES } from "@/lib/lead-status";
import type { LeadStatus } from "@/lib/generated/prisma/client";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const leads = await prisma.lead.findMany({
    where: status ? { status: status as LeadStatus } : undefined,
    include: { customer: true, service: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Leads</h1>
        <form className="flex items-center gap-2">
          <select
            name="status"
            defaultValue={status ?? ""}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">All statuses</option>
            {LEAD_STATUSES.map((s) => (
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
              <th className="pb-2 pr-4">Reference</th>
              <th className="pb-2 pr-4">Customer</th>
              <th className="pb-2 pr-4">Service</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Budget</th>
              <th className="pb-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  <Link href={`/admin/leads/${lead.id}`} className="text-accent hover:underline">
                    {lead.bookingRef}
                  </Link>
                </td>
                <td className="py-2 pr-4">{lead.customer.name}</td>
                <td className="py-2 pr-4">{lead.service.name}</td>
                <td className="py-2 pr-4">
                  <Badge variant="secondary">{lead.status}</Badge>
                </td>
                <td className="py-2 pr-4">
                  {lead.budgetMin || lead.budgetMax
                    ? `$${lead.budgetMin?.toString() ?? "?"} - $${lead.budgetMax?.toString() ?? "?"}`
                    : "—"}
                </td>
                <td className="py-2">{lead.createdAt.toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {leads.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">No leads match this filter.</p>
        )}
      </div>
    </div>
  );
}
