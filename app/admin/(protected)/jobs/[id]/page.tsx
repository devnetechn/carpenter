import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { JobStatusForm } from "@/components/admin/job-status-form";
import { JobInfoForm } from "@/components/admin/job-info-form";
import { JobLineItems } from "@/components/admin/job-line-items";
import { JobPhotos } from "@/components/admin/job-photos";
import { JobFeaturedToggle } from "@/components/admin/job-featured-toggle";
import { JobInvoices } from "@/components/admin/job-invoices";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      lead: { include: { customer: true } },
      lineItems: { orderBy: { createdAt: "asc" } },
      photos: { orderBy: { createdAt: "asc" } },
      invoices: {
        include: { payments: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!job) {
    notFound();
  }

  const lineItemViews = job.lineItems.map((i) => ({
    type: i.type,
    description: i.description,
    quantity: i.quantity.toString(),
    unitPrice: i.unitPrice.toString(),
  }));

  const photoViews = job.photos.map((p) => ({
    id: p.id,
    url: p.url,
    phase: p.phase,
    caption: p.caption,
  }));

  const invoiceViews = job.invoices.map((inv) => ({
    id: inv.id,
    type: inv.type,
    amount: inv.amount.toString(),
    status: inv.status,
    dueDate: inv.dueDate ? inv.dueDate.toLocaleDateString() : null,
    publicToken: inv.publicToken,
    payments: inv.payments.map((p) => ({
      id: p.id,
      amount: p.amount.toString(),
      method: p.method,
      status: p.status,
      paidAt: p.paidAt ? p.paidAt.toLocaleDateString() : null,
    })),
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{job.lead.bookingRef}</h1>
          <p className="text-sm text-muted-foreground">
            {job.lead.customer.name} ·{" "}
            <Link href={`/admin/leads/${job.leadId}`} className="text-accent hover:underline">
              View lead
            </Link>
          </p>
        </div>
        <JobStatusForm jobId={job.id} currentStatus={job.status} />
      </div>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Job Info</h2>
          <JobFeaturedToggle jobId={job.id} featured={job.featuredOnWebsite} />
        </div>
        <div className="mt-2">
          <JobInfoForm
            jobId={job.id}
            job={{
              scopeOfWork: job.scopeOfWork,
              addressStreet: job.addressStreet,
              addressCity: job.addressCity,
              addressState: job.addressState,
              addressZip: job.addressZip,
              startDate: job.startDate ? job.startDate.toISOString().slice(0, 10) : "",
            }}
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Line Items</h2>
        <div className="mt-2">
          <JobLineItems jobId={job.id} existingItems={lineItemViews} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Photos</h2>
        <div className="mt-2">
          <JobPhotos jobId={job.id} photos={photoViews} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Invoices</h2>
        <div className="mt-2">
          <JobInvoices jobId={job.id} invoices={invoiceViews} />
        </div>
      </section>
    </div>
  );
}
