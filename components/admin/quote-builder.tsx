"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { computeQuoteTotals } from "@/lib/quote-totals";
import { saveQuoteDraft, sendQuote } from "@/app/admin/(protected)/leads/[id]/quote-actions";

type ItemType = "LABOR" | "MATERIAL" | "OPTIONAL";

interface QuoteItemState {
  id: string;
  type: ItemType;
  description: string;
  quantity: string;
  unitPrice: string;
  isOptional: boolean;
  isIncluded: boolean;
}

export interface ExistingQuoteView {
  id: string;
  status: string;
  publicToken: string;
  discount: string;
  items: {
    type: ItemType;
    description: string;
    quantity: string;
    unitPrice: string;
    isOptional: boolean;
    isIncluded: boolean;
  }[];
}

function emptyItem(): QuoteItemState {
  return {
    id: crypto.randomUUID(),
    type: "LABOR",
    description: "",
    quantity: "1",
    unitPrice: "0",
    isOptional: false,
    isIncluded: true,
  };
}

export function QuoteBuilder({
  leadId,
  existingQuote,
  defaultTaxRate,
  defaultDepositPercent,
}: {
  leadId: string;
  existingQuote: ExistingQuoteView | null;
  defaultTaxRate: number;
  defaultDepositPercent: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [items, setItems] = useState<QuoteItemState[]>(
    existingQuote && existingQuote.items.length > 0
      ? existingQuote.items.map((i) => ({ ...i, id: crypto.randomUUID() }))
      : [emptyItem()]
  );
  const [discount, setDiscount] = useState(existingQuote?.discount ?? "0");
  const [taxRate, setTaxRate] = useState(String(defaultTaxRate));
  const [depositPercent, setDepositPercent] = useState(String(defaultDepositPercent));

  const totals = computeQuoteTotals(
    items.map((i) => ({
      quantity: Number(i.quantity) || 0,
      unitPrice: Number(i.unitPrice) || 0,
      isIncluded: i.isIncluded,
    })),
    Number(discount) || 0,
    Number(taxRate) || 0,
    Number(depositPercent) || 0
  );

  const isLocked = existingQuote !== null && existingQuote.status !== "DRAFT";

  function updateItem(id: string, patch: Partial<QuoteItemState>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function handleSaveDraft() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveQuoteDraft({
        leadId,
        items: items.map((i) => ({
          type: i.type,
          description: i.description,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          isOptional: i.isOptional,
          isIncluded: i.isIncluded,
        })),
        discount: Number(discount),
        taxRate: Number(taxRate),
        depositPercent: Number(depositPercent),
      });
      if (result.error) {
        setError("Could not save the quote. Check that every item has a description and valid numbers.");
      } else {
        setMessage("Draft saved.");
      }
    });
  }

  function handleSend() {
    if (!existingQuote) return;
    setError(null);
    startTransition(async () => {
      const result = await sendQuote(existingQuote.id);
      if (result.error) {
        setError("Could not send the quote.");
      } else {
        setMessage("Quote sent to the customer.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {isLocked && (
        <p className="text-sm text-muted-foreground">
          This quote has been sent (status: {existingQuote!.status}) and can no longer be edited here.{" "}
          <a
            href={`/quote/view/${existingQuote!.publicToken}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            View public quote
          </a>
        </p>
      )}
      {!isLocked && (
        <>
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="grid grid-cols-12 items-center gap-2 rounded-md border p-2 text-sm">
                <select
                  value={item.type}
                  onChange={(e) => updateItem(item.id, { type: e.target.value as ItemType })}
                  className="col-span-2 rounded-md border bg-background px-2 py-1"
                >
                  <option value="LABOR">Labor</option>
                  <option value="MATERIAL">Material</option>
                  <option value="OPTIONAL">Optional</option>
                </select>
                <Input
                  value={item.description}
                  onChange={(e) => updateItem(item.id, { description: e.target.value })}
                  placeholder="Description"
                  className="col-span-4"
                />
                <Input
                  value={item.quantity}
                  onChange={(e) => updateItem(item.id, { quantity: e.target.value })}
                  placeholder="Qty"
                  className="col-span-1"
                />
                <Input
                  value={item.unitPrice}
                  onChange={(e) => updateItem(item.id, { unitPrice: e.target.value })}
                  placeholder="Unit price"
                  className="col-span-2"
                />
                <label className="col-span-2 flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={item.isIncluded}
                    onChange={(e) => updateItem(item.id, { isIncluded: e.target.checked })}
                  />
                  Included
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="col-span-1"
                  onClick={() => removeItem(item.id)}
                >
                  &times;
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addItem}>
            + Add Item
          </Button>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-muted-foreground">Discount ($)</span>
              <Input value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground">Tax rate</span>
              <Input value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground">Deposit %</span>
              <Input value={depositPercent} onChange={(e) => setDepositPercent(e.target.value)} />
            </label>
          </div>
        </>
      )}

      <div className="rounded-md border p-3 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>${totals.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Tax</span>
          <span>${totals.tax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span>${totals.total.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Deposit</span>
          <span>${totals.depositAmount.toFixed(2)}</span>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-700">{message}</p>}

      <div className="flex gap-2">
        {!isLocked && (
          <Button type="button" onClick={handleSaveDraft} disabled={isPending}>
            {isPending ? "Saving..." : "Save Draft"}
          </Button>
        )}
        {existingQuote && existingQuote.status === "DRAFT" && (
          <Button type="button" variant="outline" onClick={handleSend} disabled={isPending}>
            Send Quote
          </Button>
        )}
      </div>
    </div>
  );
}
