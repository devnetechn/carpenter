import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import type { QuoteStatus } from "@/lib/generated/prisma/client";

const QUOTE_STATUSES = ["DRAFT", "SENT", "VIEWED", "ACCEPTED", "DECLINED", "EXPIRED"] as const;

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const quotes = await prisma.quote.findMany({
    where: status ? { status: status as QuoteStatus } : undefined,
    include: { lead: { include: { customer: true, service: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Quotes</h1>
        <form className="flex items-center gap-2">
          <select
            name="status"
            defaultValue={status ?? ""}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">All statuses</option>
            {QUOTE_STATUSES.map((s) => (
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
              <th className="pb-2 pr-4">Total</th>
              <th className="pb-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((quote) => (
              <tr key={quote.id} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  <Link href={`/admin/leads/${quote.leadId}`} className="text-accent hover:underline">
                    {quote.lead.customer.name}
                  </Link>
                </td>
                <td className="py-2 pr-4">{quote.lead.service.name}</td>
                <td className="py-2 pr-4">
                  <Badge variant="secondary">{quote.status}</Badge>
                </td>
                <td className="py-2 pr-4">${quote.total.toString()}</td>
                <td className="py-2">{quote.createdAt.toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {quotes.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">No quotes match this filter.</p>
        )}
      </div>
    </div>
  );
}
