import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import type { PaymentStatus } from "@/lib/generated/prisma/client";

const PAYMENT_STATUSES = ["PENDING", "SUCCEEDED", "FAILED", "REFUNDED"] as const;

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const payments = await prisma.payment.findMany({
    where: status ? { status: status as PaymentStatus } : undefined,
    include: { invoice: { include: { job: { include: { customer: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Payments</h1>
        <form className="flex items-center gap-2">
          <select
            name="status"
            defaultValue={status ?? ""}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">All statuses</option>
            {PAYMENT_STATUSES.map((s) => (
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
              <th className="pb-2 pr-4">Job</th>
              <th className="pb-2 pr-4">Invoice Type</th>
              <th className="pb-2 pr-4">Amount</th>
              <th className="pb-2 pr-4">Method</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2">Paid</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className="border-b last:border-0">
                <td className="py-2 pr-4">{payment.invoice.job.customer.name}</td>
                <td className="py-2 pr-4">
                  <Link href={`/admin/jobs/${payment.invoice.jobId}`} className="text-accent hover:underline">
                    View job
                  </Link>
                </td>
                <td className="py-2 pr-4">{payment.invoice.type}</td>
                <td className="py-2 pr-4">${payment.amount.toString()}</td>
                <td className="py-2 pr-4">{payment.method}</td>
                <td className="py-2 pr-4">
                  <Badge variant="secondary">{payment.status}</Badge>
                </td>
                <td className="py-2">{payment.paidAt ? payment.paidAt.toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">No payments match this filter.</p>
        )}
      </div>
    </div>
  );
}
