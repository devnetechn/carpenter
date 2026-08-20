"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createInvoice, recordPayment } from "@/app/admin/(protected)/jobs/[id]/invoice-actions";

type InvoiceType = "DEPOSIT" | "PARTIAL" | "FINAL";

export interface PaymentView {
  id: string;
  amount: string;
  method: string;
  status: string;
  paidAt: string | null;
}

export interface InvoiceView {
  id: string;
  type: InvoiceType;
  amount: string;
  status: string;
  dueDate: string | null;
  publicToken: string;
  payments: PaymentView[];
}

function NewInvoiceForm({ jobId }: { jobId: string }) {
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState<InvoiceType>("DEPOSIT");
  const [amount, setAmount] = useState("0");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const result = await createInvoice({
        jobId,
        type,
        amount: Number(amount),
        dueDate: dueDate || undefined,
      });
      if (result.error) {
        setError("Could not create invoice. Check the amount.");
      } else {
        setAmount("0");
        setDueDate("");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border p-3 text-sm">
      <label className="space-y-1">
        <span className="block text-muted-foreground">Type</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as InvoiceType)}
          className="rounded-md border bg-background px-2 py-1.5"
        >
          <option value="DEPOSIT">Deposit</option>
          <option value="PARTIAL">Partial</option>
          <option value="FINAL">Final</option>
        </select>
      </label>
      <label className="space-y-1">
        <span className="block text-muted-foreground">Amount</span>
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28" />
      </label>
      <label className="space-y-1">
        <span className="block text-muted-foreground">Due date (optional)</span>
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </label>
      <Button type="button" onClick={handleCreate} disabled={isPending}>
        {isPending ? "Creating..." : "Create Invoice"}
      </Button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </div>
  );
}

function RecordPaymentForm({ invoiceId }: { invoiceId: string }) {
  const [isPending, startTransition] = useTransition();
  const [amount, setAmount] = useState("0");
  const [method, setMethod] = useState("cash");
  const [error, setError] = useState<string | null>(null);

  function handleRecord() {
    setError(null);
    startTransition(async () => {
      const result = await recordPayment({ invoiceId, amount: Number(amount), method });
      if (result.error) {
        setError("Could not record payment. Check the amount.");
      } else {
        setAmount("0");
      }
    });
  }

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 text-sm">
      <label className="space-y-1">
        <span className="block text-muted-foreground">Amount</span>
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} className="w-24" />
      </label>
      <label className="space-y-1">
        <span className="block text-muted-foreground">Method</span>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="rounded-md border bg-background px-2 py-1.5"
        >
          <option value="cash">Cash</option>
          <option value="check">Check</option>
          <option value="bank_transfer">Bank transfer</option>
          <option value="card">Card</option>
        </select>
      </label>
      <Button type="button" size="sm" variant="outline" onClick={handleRecord} disabled={isPending}>
        {isPending ? "Recording..." : "Record Payment"}
      </Button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function JobInvoices({ jobId, invoices }: { jobId: string; invoices: InvoiceView[] }) {
  return (
    <div className="space-y-4">
      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoices yet.</p>
      ) : (
        <div className="space-y-3">
          {invoices.map((invoice) => (
            <div key={invoice.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{invoice.type}</span> — ${invoice.amount}
                  {invoice.dueDate && <span className="text-muted-foreground"> · due {invoice.dueDate}</span>}
                </div>
                <Badge variant="secondary">{invoice.status}</Badge>
              </div>
              {invoice.payments.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {invoice.payments.map((p) => (
                    <li key={p.id}>
                      ${p.amount} via {p.method}
                      {p.paidAt && ` on ${p.paidAt}`}
                    </li>
                  ))}
                </ul>
              )}
              <a
                href={`/invoice/view/${invoice.publicToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-xs text-accent hover:underline"
              >
                View public invoice
              </a>
              {invoice.status !== "PAID" && invoice.status !== "VOID" && (
                <RecordPaymentForm invoiceId={invoice.id} />
              )}
            </div>
          ))}
        </div>
      )}
      <NewInvoiceForm jobId={jobId} />
    </div>
  );
}
