import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getBusinessSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { publicToken: token },
    include: {
      payments: { where: { status: "SUCCEEDED" }, orderBy: { paidAt: "asc" } },
      job: true,
    },
  });

  if (!invoice) {
    notFound();
  }

  const settings = await getBusinessSettings();
  const paidTotal = invoice.payments.reduce((sum, p) => sum + Number(p.amount.toString()), 0);
  const amount = Number(invoice.amount.toString());
  const remaining = Math.max(0, amount - paidTotal);

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm text-muted-foreground">{settings.name}</p>
      <h1 className="mt-2 font-serif text-2xl font-semibold">{invoice.type} Invoice</h1>
      <p className="text-sm text-muted-foreground">{invoice.job.scopeOfWork}</p>

      <div className="mt-6 space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Amount</span>
          <span>${invoice.amount.toString()}</span>
        </div>
        {invoice.dueDate && (
          <div className="flex justify-between">
            <span>Due date</span>
            <span>{invoice.dueDate.toLocaleDateString()}</span>
          </div>
        )}
      </div>

      {invoice.payments.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Payments received</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {invoice.payments.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>
                  {p.method} — {p.paidAt?.toLocaleDateString()}
                </span>
                <span>${p.amount.toString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6">
        {invoice.status === "VOID" && (
          <p className="text-sm text-muted-foreground">This invoice has been voided.</p>
        )}
        {invoice.status === "PAID" && <p className="text-sm text-green-700">Paid in full. Thank you!</p>}
        {invoice.status === "PARTIALLY_PAID" && (
          <p className="text-sm text-muted-foreground">
            Partially paid — ${remaining.toFixed(2)} remaining.
          </p>
        )}
        {invoice.status === "UNPAID" && (
          <p className="text-sm text-muted-foreground">
            Payment of ${remaining.toFixed(2)} is due. Please contact us to arrange payment.
          </p>
        )}
      </div>
    </div>
  );
}
