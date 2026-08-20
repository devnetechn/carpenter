import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { resolveAnswerLabels } from "@/lib/lead-answers";
import { getBusinessSettings } from "@/lib/settings";
import { LeadStatusForm } from "@/components/admin/lead-status-form";
import { LeadNotes } from "@/components/admin/lead-notes";
import { QuoteBuilder } from "@/components/admin/quote-builder";
import { ConvertToJobButton } from "@/components/admin/convert-to-job-button";
import { Badge } from "@/components/ui/badge";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      customer: true,
      service: { include: { questions: true } },
      project: { include: { photos: true } },
      appointments: { orderBy: { start: "asc" } },
      leadNotes: {
        include: { adminUser: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
      quotes: {
        include: { items: { orderBy: { sortOrder: "asc" } } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      jobs: { select: { id: true } },
    },
  });

  if (!lead) {
    notFound();
  }

  const settings = await getBusinessSettings();

  const answers = resolveAnswerLabels(
    lead.service.questions,
    (lead.project?.answers as Record<string, string>) ?? {}
  );

  const noteViews = lead.leadNotes.map((note) => ({
    id: note.id,
    body: note.body,
    createdAt: note.createdAt,
    authorName: note.adminUser.name,
  }));

  const latestQuote = lead.quotes[0] ?? null;
  const quoteView = latestQuote
    ? {
        id: latestQuote.id,
        status: latestQuote.status,
        publicToken: latestQuote.publicToken,
        discount: latestQuote.discount.toString(),
        items: latestQuote.items.map((item) => ({
          type: item.type,
          description: item.description,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toString(),
          isOptional: item.isOptional,
          isIncluded: item.isIncluded,
        })),
      }
    : null;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{lead.bookingRef}</h1>
          <p className="text-sm text-muted-foreground">{lead.service.name}</p>
        </div>
        <LeadStatusForm leadId={lead.id} currentStatus={lead.status} />
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Customer</h2>
        <div className="mt-2 text-sm">
          <p>{lead.customer.name}</p>
          <p>{lead.customer.phone}</p>
          <p>{lead.customer.email}</p>
          {lead.preferredContact && <p>Prefers: {lead.preferredContact}</p>}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Project Details</h2>
        <dl className="mt-2 space-y-1 text-sm">
          {answers.map((a) => (
            <div key={a.label} className="flex gap-2">
              <dt className="font-medium">{a.label}:</dt>
              <dd>{a.value}</dd>
            </div>
          ))}
        </dl>
        {lead.project && (
          <div className="mt-3 text-sm">
            <p>
              {lead.project.addressStreet}, {lead.project.addressCity}, {lead.project.addressState}{" "}
              {lead.project.addressZip}
            </p>
            <Badge variant={lead.project.withinServiceArea ? "secondary" : "destructive"}>
              {lead.project.withinServiceArea ? "Within service area" : "Outside service area"}
            </Badge>
            {(lead.project.budgetMin || lead.project.budgetMax) && (
              <p className="mt-1">
                Budget: ${lead.project.budgetMin?.toString() ?? "?"} - $
                {lead.project.budgetMax?.toString() ?? "?"}
              </p>
            )}
          </div>
        )}
        {lead.project && lead.project.photos.length > 0 && (
          <div className="mt-3 grid grid-cols-4 gap-2">
            {lead.project.photos.map((photo) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.id}
                src={photo.url}
                alt="Project"
                className="h-20 w-full rounded object-cover"
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Appointments</h2>
        {lead.appointments.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No appointments scheduled.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {lead.appointments.map((appt) => (
              <li key={appt.id}>
                {appt.type} — {appt.start.toLocaleString()} ({appt.status})
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Quote</h2>
        <div className="mt-2">
          <QuoteBuilder
            leadId={lead.id}
            existingQuote={quoteView}
            defaultTaxRate={Number(settings.taxRate)}
            defaultDepositPercent={Number(settings.depositPercent)}
          />
        </div>
        {latestQuote?.status === "ACCEPTED" && (
          <div className="mt-4">
            {lead.jobs.length > 0 ? (
              <a href={`/admin/jobs/${lead.jobs[0].id}`} className="text-sm text-accent hover:underline">
                View job
              </a>
            ) : (
              <ConvertToJobButton quoteId={latestQuote.id} />
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Internal Notes</h2>
        <LeadNotes leadId={lead.id} notes={noteViews} />
      </section>
    </div>
  );
}
