import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getBusinessSettings } from "@/lib/settings";
import { QuoteResponseForm } from "@/components/quote/quote-response-form";

export const dynamic = "force-dynamic";

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const quote = await prisma.quote.findUnique({
    where: { publicToken: token },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      lead: { include: { customer: true, service: true } },
    },
  });

  if (!quote) {
    notFound();
  }

  if (!quote.viewedAt && quote.status === "SENT") {
    await prisma.quote.update({
      where: { id: quote.id },
      data: { status: "VIEWED", viewedAt: new Date() },
    });
  }

  const settings = await getBusinessSettings();
  const isExpired = quote.expiresAt ? quote.expiresAt < new Date() : false;
  const canRespond = !isExpired && (quote.status === "SENT" || quote.status === "VIEWED");

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm text-muted-foreground">{settings.name}</p>
      <h1 className="mt-2 font-serif text-2xl font-semibold">
        Estimate for {quote.lead.service.name}
      </h1>
      <p className="text-sm text-muted-foreground">Prepared for {quote.lead.customer.name}</p>

      <div className="mt-8 space-y-2">
        {quote.items.map((item) => {
          const lineTotal = Number(item.quantity.toString()) * Number(item.unitPrice.toString());
          return (
            <div key={item.id} className="flex justify-between text-sm">
              <span>
                {item.description}
                {item.isOptional && !item.isIncluded && " (optional, not included)"} &times;{" "}
                {item.quantity.toString()}
              </span>
              <span>${lineTotal.toFixed(2)}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-6 space-y-1 border-t pt-4 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>${quote.subtotal.toString()}</span>
        </div>
        <div className="flex justify-between">
          <span>Discount</span>
          <span>-${quote.discount.toString()}</span>
        </div>
        <div className="flex justify-between">
          <span>Tax</span>
          <span>${quote.tax.toString()}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span>${quote.total.toString()}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Deposit due</span>
          <span>${quote.depositAmount.toString()}</span>
        </div>
      </div>

      {isExpired && (
        <p className="mt-6 text-sm text-red-600">
          This estimate has expired. Please contact us for an updated quote.
        </p>
      )}
      {!isExpired && quote.status === "ACCEPTED" && (
        <p className="mt-6 text-sm text-green-700">You accepted this estimate.</p>
      )}
      {!isExpired && quote.status === "DECLINED" && (
        <p className="mt-6 text-sm text-muted-foreground">You declined this estimate.</p>
      )}
      {canRespond && <QuoteResponseForm token={token} />}
    </div>
  );
}
