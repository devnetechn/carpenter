import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      leads: {
        include: { service: true, quotes: { orderBy: { createdAt: "desc" } } },
        orderBy: { createdAt: "desc" },
      },
      jobs: {
        include: { invoices: { include: { payments: { orderBy: { createdAt: "desc" } } } } },
        orderBy: { createdAt: "desc" },
      },
      reviews: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!customer) {
    notFound();
  }

  const payments = customer.jobs.flatMap((job) =>
    job.invoices.flatMap((invoice) =>
      invoice.payments.map((payment) => ({ ...payment, jobId: job.id, invoiceType: invoice.type }))
    )
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">{customer.name}</h1>
        <p className="text-sm text-muted-foreground">
          {customer.phone} · {customer.email}
        </p>
        <p className="text-sm text-muted-foreground">
          Customer since {customer.createdAt.toLocaleDateString()}
        </p>
        {(customer.addressStreet || customer.addressCity) && (
          <p className="mt-1 text-sm text-muted-foreground">
            {customer.addressStreet}, {customer.addressCity}, {customer.addressState}{" "}
            {customer.addressZip}
          </p>
        )}
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Leads &amp; Quotes</h2>
        {customer.leads.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No leads yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {customer.leads.map((lead) => (
              <div key={lead.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <Link href={`/admin/leads/${lead.id}`} className="text-accent hover:underline">
                    {lead.bookingRef}
                  </Link>
                  <Badge variant="secondary">{lead.status}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {lead.service.name} · {lead.createdAt.toLocaleDateString()}
                </p>
                {lead.quotes.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {lead.quotes.map((quote) => (
                      <li key={quote.id}>
                        Quote {quote.status} — ${quote.total.toString()}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Jobs</h2>
        {customer.jobs.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No jobs yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {customer.jobs.map((job) => (
              <div key={job.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <Link href={`/admin/jobs/${job.id}`} className="text-accent hover:underline">
                    {job.scopeOfWork}
                  </Link>
                  <Badge variant="secondary">{job.status}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {job.addressStreet}, {job.addressCity}, {job.addressState} {job.addressZip}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Payments</h2>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {payments.map((payment) => (
              <li key={payment.id} className="flex justify-between">
                <span>
                  {payment.invoiceType} · {payment.method}
                  {payment.paidAt && ` · ${payment.paidAt.toLocaleDateString()}`}
                </span>
                <span>${payment.amount.toString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Reviews</h2>
        {customer.reviews.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No reviews yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {customer.reviews.map((review) => (
              <div key={review.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>
                    {review.projectType} · {review.rating}/5
                  </span>
                  <Badge variant="secondary">{review.approved ? "Approved" : "Pending"}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">{review.body}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
