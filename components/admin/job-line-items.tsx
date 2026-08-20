"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveJobLineItems } from "@/app/admin/(protected)/jobs/[id]/actions";

type ItemType = "LABOR" | "MATERIAL";

interface LineItemState {
  id: string;
  type: ItemType;
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface ExistingLineItemView {
  type: ItemType;
  description: string;
  quantity: string;
  unitPrice: string;
}

function emptyItem(): LineItemState {
  return { id: crypto.randomUUID(), type: "LABOR", description: "", quantity: "1", unitPrice: "0" };
}

export function JobLineItems({
  jobId,
  existingItems,
}: {
  jobId: string;
  existingItems: ExistingLineItemView[];
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [items, setItems] = useState<LineItemState[]>(
    existingItems.length > 0
      ? existingItems.map((i) => ({ ...i, id: crypto.randomUUID() }))
      : [emptyItem()]
  );

  const total = items.reduce(
    (sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0),
    0
  );

  function updateItem(id: string, patch: Partial<LineItemState>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveJobLineItems({
        jobId,
        items: items.map((i) => ({
          type: i.type,
          description: i.description,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
        })),
      });
      setMessage(
        result.error
          ? "Could not save line items. Check that every row has a description and valid numbers."
          : "Line items saved."
      );
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="grid grid-cols-12 items-center gap-2 rounded-md border p-2 text-sm">
            <select
              value={item.type}
              onChange={(e) => updateItem(item.id, { type: e.target.value as ItemType })}
              className="col-span-2 rounded-md border bg-background px-2 py-1"
            >
              <option value="LABOR">Labor</option>
              <option value="MATERIAL">Material</option>
            </select>
            <Input
              value={item.description}
              onChange={(e) => updateItem(item.id, { description: e.target.value })}
              placeholder="Description"
              className="col-span-5"
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
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="col-span-2"
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

      <div className="rounded-md border p-3 text-sm">
        <div className="flex justify-between font-semibold">
          <span>Total actual cost</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <Button type="button" onClick={handleSave} disabled={isPending}>
        {isPending ? "Saving..." : "Save Line Items"}
      </Button>
    </div>
  );
}
