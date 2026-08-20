# Admin Quotes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the quote/estimate workflow — an inline builder on the Lead detail page, sending a quote, a public token-scoped view where the customer accepts/declines/requests changes, and an admin-wide Quotes list.

**Architecture:** Quote items are edited as an in-memory batch on the Lead detail page (matching the wizard's "collect then persist transactionally" pattern) via a new `QuoteBuilder` client component. A pure `lib/quote-totals.ts` function drives live totals on both the admin builder and the public view. The public quote page needs no auth — the unguessable `publicToken` is the access control, consistent with the booking-reference pattern.

**Tech Stack:** Next.js 16, TypeScript, Tailwind, shadcn/ui, Prisma, Zod, Vitest — as established.

**Spec:** `docs/superpowers/specs/2026-08-20-admin-quotes-design.md`

## Global Constraints

- "Request Changes" never transitions `Quote.status` — the customer's message goes into a queued `Notification`, never a `LeadNote` (which is admin-authored only).
- Prisma `Decimal` fields are always converted to plain numbers/strings before crossing into a Client Component prop — never passed through raw (the established rule from the foundation and marketing-site phases).
- Sending a quote also advances `Lead.status` to `ESTIMATE_SENT`, matching the documented lead pipeline from the foundation spec.
- A quote's `tax`/`depositAmount` are frozen dollar amounts computed once at save time — never live-recomputed from `BusinessSettings` after the fact.

---

### Task 1: Schema — Two New Notification Types

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Extend the `NotificationType` enum**

Add `QUOTE_DECLINED` and `QUOTE_CHANGES_REQUESTED` to the existing `NotificationType` enum, immediately after `QUOTE_ACCEPTED`:

```prisma
enum NotificationType {
  NEW_BOOKING
  BOOKING_CONFIRMATION
  APPOINTMENT_REMINDER
  APPOINTMENT_CANCELLATION
  QUOTE_SENT
  QUOTE_ACCEPTED
  QUOTE_DECLINED
  QUOTE_CHANGES_REQUESTED
  PAYMENT_RECEIVED
  JOB_COMPLETED
  REVIEW_REQUEST
}
```

- [ ] **Step 2: Migrate dev and test databases**

```bash
npx prisma migrate dev --name add_quote_response_notification_types
npx dotenv -e .env.test -- npx prisma migrate deploy
npx prisma generate
```

- [ ] **Step 3: Commit**

```bash
git add prisma
git commit -m "feat: add QUOTE_DECLINED and QUOTE_CHANGES_REQUESTED notification types"
```

---

### Task 2: Quote Totals — Pure Function

**Files:**
- Create: `lib/quote-totals.ts`, `tests/unit/quote-totals.test.ts`

**Interfaces:**
- Produces: `computeQuoteTotals(items, discount, taxRate, depositPercent): QuoteTotals`, consumed by the admin `QuoteBuilder` (Task 5), `saveQuoteDraft` (Task 4), and the public quote view (Task 6).

- [ ] **Step 1: Write the failing tests**

`tests/unit/quote-totals.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeQuoteTotals } from "@/lib/quote-totals";

describe("computeQuoteTotals", () => {
  it("sums included items into the subtotal", () => {
    const totals = computeQuoteTotals(
      [
        { quantity: 2, unitPrice: 50, isIncluded: true },
        { quantity: 1, unitPrice: 100, isIncluded: true },
      ],
      0,
      0,
      0
    );
    expect(totals.subtotal).toBe(200);
    expect(totals.total).toBe(200);
  });

  it("excludes items where isIncluded is false", () => {
    const totals = computeQuoteTotals(
      [
        { quantity: 1, unitPrice: 100, isIncluded: true },
        { quantity: 1, unitPrice: 500, isIncluded: false },
      ],
      0,
      0,
      0
    );
    expect(totals.subtotal).toBe(100);
  });

  it("applies the discount before tax", () => {
    const totals = computeQuoteTotals(
      [{ quantity: 1, unitPrice: 100, isIncluded: true }],
      20,
      0.1,
      0
    );
    // (100 - 20) * 1.10 = 88
    expect(totals.tax).toBeCloseTo(8);
    expect(totals.total).toBeCloseTo(88);
  });

  it("computes the deposit as a percentage of the total", () => {
    const totals = computeQuoteTotals(
      [{ quantity: 1, unitPrice: 1000, isIncluded: true }],
      0,
      0,
      0.3
    );
    expect(totals.depositAmount).toBeCloseTo(300);
  });

  it("never lets discount push the pre-tax amount below zero", () => {
    const totals = computeQuoteTotals(
      [{ quantity: 1, unitPrice: 50, isIncluded: true }],
      100,
      0,
      0
    );
    expect(totals.total).toBe(0);
  });

  it("rounds all figures to two decimal places", () => {
    const totals = computeQuoteTotals(
      [{ quantity: 3, unitPrice: 33.333, isIncluded: true }],
      0,
      0.0725,
      0
    );
    expect(Number.isInteger(totals.subtotal * 100)).toBe(true);
    expect(Number.isInteger(totals.tax * 100)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- quote-totals`
Expected: FAIL — module `@/lib/quote-totals` not found.

- [ ] **Step 3: Implement it**

`lib/quote-totals.ts`:

```ts
export interface QuoteLineItemInput {
  quantity: number;
  unitPrice: number;
  isIncluded: boolean;
}

export interface QuoteTotals {
  subtotal: number;
  tax: number;
  total: number;
  depositAmount: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeQuoteTotals(
  items: QuoteLineItemInput[],
  discount: number,
  taxRate: number,
  depositPercent: number
): QuoteTotals {
  const subtotal = items
    .filter((i) => i.isIncluded)
    .reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const afterDiscount = Math.max(0, subtotal - discount);
  const tax = afterDiscount * taxRate;
  const total = afterDiscount + tax;
  const depositAmount = total * depositPercent;

  return {
    subtotal: round2(subtotal),
    tax: round2(tax),
    total: round2(total),
    depositAmount: round2(depositAmount),
  };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- quote-totals`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add lib/quote-totals.ts tests/unit/quote-totals.test.ts
git commit -m "feat: add pure quote totals computation"
```

---

### Task 3: Quote Validation Schemas

**Files:**
- Create: `lib/quote.ts`, `tests/unit/quote-validation.test.ts`

**Interfaces:**
- Produces: `quoteItemInputSchema`, `saveQuoteDraftSchema`, `type QuoteItemInput`, `type SaveQuoteDraftInput`, consumed by Task 4's server actions and Task 5's `QuoteBuilder`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/quote-validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { saveQuoteDraftSchema } from "@/lib/quote";

describe("saveQuoteDraftSchema", () => {
  const valid = {
    leadId: "lead_1",
    items: [
      {
        type: "LABOR",
        description: "Framing labor",
        quantity: 8,
        unitPrice: 65,
        isOptional: false,
        isIncluded: true,
      },
    ],
    discount: 0,
    taxRate: 0.0725,
    depositPercent: 0.3,
  };

  it("accepts a valid draft", () => {
    expect(saveQuoteDraftSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty items array", () => {
    const result = saveQuoteDraftSchema.safeParse({ ...valid, items: [] });
    expect(result.success).toBe(false);
  });

  it("rejects an item with an empty description", () => {
    const result = saveQuoteDraftSchema.safeParse({
      ...valid,
      items: [{ ...valid.items[0], description: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative quantity", () => {
    const result = saveQuoteDraftSchema.safeParse({
      ...valid,
      items: [{ ...valid.items[0], quantity: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a tax rate above 1", () => {
    const result = saveQuoteDraftSchema.safeParse({ ...valid, taxRate: 1.5 });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- quote-validation`
Expected: FAIL — module `@/lib/quote` not found.

- [ ] **Step 3: Implement the schemas**

`lib/quote.ts`:

```ts
import { z } from "zod";

export const quoteItemInputSchema = z.object({
  type: z.enum(["LABOR", "MATERIAL", "OPTIONAL"]),
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  isOptional: z.boolean(),
  isIncluded: z.boolean(),
});

export const saveQuoteDraftSchema = z.object({
  leadId: z.string().min(1),
  items: z.array(quoteItemInputSchema).min(1),
  discount: z.coerce.number().nonnegative(),
  taxRate: z.coerce.number().min(0).max(1),
  depositPercent: z.coerce.number().min(0).max(1),
});

export type QuoteItemInput = z.infer<typeof quoteItemInputSchema>;
export type SaveQuoteDraftInput = z.infer<typeof saveQuoteDraftSchema>;
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- quote-validation`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add lib/quote.ts tests/unit/quote-validation.test.ts
git commit -m "feat: add quote validation schemas"
```

---

### Task 4: Quote Server Actions — Save Draft and Send

**Files:**
- Create: `app/admin/(protected)/leads/[id]/quote-actions.ts`, `tests/integration/quote-actions.test.ts`

**Interfaces:**
- Consumes: `saveQuoteDraftSchema`/`SaveQuoteDraftInput` (Task 3), `computeQuoteTotals` (Task 2), `queueNotification`/`getBusinessSettings` (foundation).
- Produces: `saveQuoteDraft(input)`, `sendQuote(quoteId)`, consumed by Task 5's `QuoteBuilder`.

- [ ] **Step 1: Write the failing tests**

`tests/integration/quote-actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { saveQuoteDraft, sendQuote } = await import(
  "@/app/admin/(protected)/leads/[id]/quote-actions"
);

let leadId: string;

async function seedLeadAndSettings() {
  await prisma.businessSettings.deleteMany();
  await prisma.businessSettings.create({
    data: {
      name: "Test Co",
      phone: "555-0100",
      email: "owner@example.com",
      addressStreet: "1 Main St",
      addressCity: "Springfield",
      addressState: "IL",
      addressZip: "62701",
      serviceAreaZips: [],
    },
  });

  const service = await prisma.service.create({
    data: { name: "Test", slug: "quote-test-service", description: "d" },
  });
  const customer = await prisma.customer.create({
    data: { name: "Jane", phone: "555", email: "quote-test@example.com" },
  });
  const lead = await prisma.lead.create({
    data: {
      bookingRef: "CW-2026-7777",
      customerId: customer.id,
      serviceId: service.id,
      status: "NEW",
    },
  });
  leadId = lead.id;
}

describe("quote server actions", () => {
  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.quoteItem.deleteMany();
    await prisma.quote.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "quote-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "quote-test-service" } });
    await seedLeadAndSettings();
  });

  afterAll(async () => {
    await prisma.notification.deleteMany();
    await prisma.quoteItem.deleteMany();
    await prisma.quote.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "quote-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "quote-test-service" } });
    await prisma.businessSettings.deleteMany();
  });

  it("creates a draft quote with computed totals", async () => {
    const result = await saveQuoteDraft({
      leadId,
      items: [
        { type: "LABOR", description: "Framing", quantity: 8, unitPrice: 65, isOptional: false, isIncluded: true },
        { type: "MATERIAL", description: "Lumber", quantity: 1, unitPrice: 400, isOptional: false, isIncluded: true },
      ],
      discount: 20,
      taxRate: 0.1,
      depositPercent: 0.3,
    });
    expect(result.error).toBeNull();

    const quote = await prisma.quote.findFirst({ where: { leadId }, include: { items: true } });
    expect(quote?.status).toBe("DRAFT");
    expect(quote?.items).toHaveLength(2);
    // subtotal = 8*65 + 1*400 = 920; after discount 900; tax 90; total 990; deposit 297
    expect(Number(quote?.subtotal)).toBeCloseTo(920);
    expect(Number(quote?.total)).toBeCloseTo(990);
    expect(Number(quote?.depositAmount)).toBeCloseTo(297);
  });

  it("replaces items on a second save rather than appending", async () => {
    await saveQuoteDraft({
      leadId,
      items: [{ type: "LABOR", description: "A", quantity: 1, unitPrice: 10, isOptional: false, isIncluded: true }],
      discount: 0,
      taxRate: 0,
      depositPercent: 0,
    });
    await saveQuoteDraft({
      leadId,
      items: [
        { type: "LABOR", description: "B", quantity: 1, unitPrice: 20, isOptional: false, isIncluded: true },
        { type: "LABOR", description: "C", quantity: 1, unitPrice: 30, isOptional: false, isIncluded: true },
      ],
      discount: 0,
      taxRate: 0,
      depositPercent: 0,
    });

    const quotes = await prisma.quote.findMany({ where: { leadId }, include: { items: true } });
    expect(quotes).toHaveLength(1);
    expect(quotes[0].items).toHaveLength(2);
    expect(quotes[0].items.map((i) => i.description).sort()).toEqual(["B", "C"]);
  });

  it("sends a quote, updates lead status, and queues a notification", async () => {
    const saveResult = await saveQuoteDraft({
      leadId,
      items: [{ type: "LABOR", description: "A", quantity: 1, unitPrice: 100, isOptional: false, isIncluded: true }],
      discount: 0,
      taxRate: 0,
      depositPercent: 0,
    });
    const quote = await prisma.quote.findFirst({ where: { leadId } });

    const result = await sendQuote(quote!.id);
    expect(result.error).toBeNull();

    const sent = await prisma.quote.findUniqueOrThrow({ where: { id: quote!.id } });
    expect(sent.status).toBe("SENT");
    expect(sent.sentAt).not.toBeNull();
    expect(sent.publicToken).toBeTruthy();

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.status).toBe("ESTIMATE_SENT");

    const notifications = await prisma.notification.findMany({ where: { relatedEntityId: quote!.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("QUOTE_SENT");

    void saveResult;
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- quote-actions`
Expected: FAIL — module `@/app/admin/(protected)/leads/[id]/quote-actions` not found.

- [ ] **Step 3: Implement the actions**

`app/admin/(protected)/leads/[id]/quote-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { saveQuoteDraftSchema, type SaveQuoteDraftInput } from "@/lib/quote";
import { computeQuoteTotals } from "@/lib/quote-totals";
import { queueNotification } from "@/lib/notifications";
import { getBusinessSettings } from "@/lib/settings";
import { NotificationType } from "@/lib/generated/prisma/client";

export async function saveQuoteDraft(input: SaveQuoteDraftInput) {
  const parsed = saveQuoteDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors, quoteId: null };
  }
  const data = parsed.data;

  const totals = computeQuoteTotals(data.items, data.discount, data.taxRate, data.depositPercent);

  const existing = await prisma.quote.findFirst({
    where: { leadId: data.leadId, status: "DRAFT" },
  });

  const quote = await prisma.$transaction(async (tx) => {
    const q = existing
      ? await tx.quote.update({
          where: { id: existing.id },
          data: {
            subtotal: totals.subtotal,
            discount: data.discount,
            tax: totals.tax,
            depositAmount: totals.depositAmount,
            total: totals.total,
          },
        })
      : await tx.quote.create({
          data: {
            leadId: data.leadId,
            status: "DRAFT",
            subtotal: totals.subtotal,
            discount: data.discount,
            tax: totals.tax,
            depositAmount: totals.depositAmount,
            total: totals.total,
          },
        });

    await tx.quoteItem.deleteMany({ where: { quoteId: q.id } });
    await tx.quoteItem.createMany({
      data: data.items.map((item, index) => ({
        quoteId: q.id,
        type: item.type,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        isOptional: item.isOptional,
        isIncluded: item.isIncluded,
        sortOrder: index,
      })),
    });

    return q;
  });

  revalidatePath(`/admin/leads/${data.leadId}`);
  return { error: null, quoteId: quote.id };
}

export async function sendQuote(quoteId: string) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { lead: { include: { customer: true } } },
  });
  if (!quote) {
    return { error: "Quote not found" };
  }

  await prisma.$transaction([
    prisma.quote.update({
      where: { id: quoteId },
      data: { status: "SENT", sentAt: new Date() },
    }),
    prisma.lead.update({
      where: { id: quote.leadId },
      data: { status: "ESTIMATE_SENT" },
    }),
  ]);

  const settings = await getBusinessSettings();
  await queueNotification({
    type: NotificationType.QUOTE_SENT,
    recipientEmail: quote.lead.customer.email,
    subject: `Your estimate from ${settings.name}`,
    body: `View your estimate: ${process.env.NEXT_PUBLIC_BASE_URL}/quote/view/${quote.publicToken}`,
    relatedEntityType: "Quote",
    relatedEntityId: quote.id,
  });

  revalidatePath(`/admin/leads/${quote.leadId}`);
  revalidatePath("/admin/quotes");
  return { error: null };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- quote-actions`
Expected: PASS (3/3).

- [ ] **Step 5: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/admin/(protected)/leads/[id]/quote-actions.ts" tests/integration/quote-actions.test.ts
git commit -m "feat: add saveQuoteDraft and sendQuote server actions"
```

---

### Task 5: Quote Builder — Added to the Lead Detail Page

**Files:**
- Create: `components/admin/quote-builder.tsx`
- Modify: `app/admin/(protected)/leads/[id]/page.tsx`

**Interfaces:**
- Consumes: `saveQuoteDraft`/`sendQuote` (Task 4), `computeQuoteTotals` (Task 2).

- [ ] **Step 1: Build the client component**

`components/admin/quote-builder.tsx`:

```tsx
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
```

- [ ] **Step 2: Wire it into the Lead detail page**

In `app/admin/(protected)/leads/[id]/page.tsx` (built in the admin-leads phase), the `prisma.lead.findUnique` call currently includes `customer`, `service`, `project`, `appointments`, `leadNotes`. Add `quote` to that same `include` object:

```ts
      quote: { include: { items: { orderBy: { sortOrder: "asc" } } } },
```

Add an import for `getBusinessSettings` and `QuoteBuilder`:

```tsx
import { getBusinessSettings } from "@/lib/settings";
import { QuoteBuilder } from "@/components/admin/quote-builder";
```

After fetching `lead`, fetch settings and build the serializable quote view (Decimal fields converted to strings before crossing into the client component, per the Global Constraints rule):

```tsx
  const settings = await getBusinessSettings();

  const quoteView = lead.quote
    ? {
        id: lead.quote.id,
        status: lead.quote.status,
        publicToken: lead.quote.publicToken,
        discount: lead.quote.discount.toString(),
        items: lead.quote.items.map((item) => ({
          type: item.type,
          description: item.description,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toString(),
          isOptional: item.isOptional,
          isIncluded: item.isIncluded,
        })),
      }
    : null;
```

Add a new `<section>` (after the existing "Appointments" section, before "Internal Notes") rendering the builder:

```tsx
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
      </section>
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Run a full production build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/admin/quote-builder.tsx "app/admin/(protected)/leads/[id]/page.tsx"
git commit -m "feat: add quote builder to the lead detail page"
```

---

### Task 6: Public Quote View and Customer Response

**Files:**
- Create: `app/quote/view/[token]/page.tsx`, `app/quote/view/[token]/actions.ts`, `components/quote/quote-response-form.tsx`, `tests/integration/quote-response.test.ts`

**Interfaces:**
- Consumes: `queueNotification`/`getBusinessSettings` (foundation).
- Produces: `respondToQuote(token, action, message?)`, consumed by `QuoteResponseForm`.

- [ ] **Step 1: Write the failing tests**

`tests/integration/quote-response.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { respondToQuote } = await import("@/app/quote/view/[token]/actions");

let quoteId: string;
let publicToken: string;

async function seedSentQuote() {
  await prisma.businessSettings.deleteMany();
  await prisma.businessSettings.create({
    data: {
      name: "Test Co",
      phone: "555-0100",
      email: "owner@example.com",
      addressStreet: "1 Main St",
      addressCity: "Springfield",
      addressState: "IL",
      addressZip: "62701",
      serviceAreaZips: [],
    },
  });

  const service = await prisma.service.create({
    data: { name: "Test", slug: "quote-response-test-service", description: "d" },
  });
  const customer = await prisma.customer.create({
    data: { name: "Jane", phone: "555", email: "quote-response-test@example.com" },
  });
  const lead = await prisma.lead.create({
    data: { bookingRef: "CW-2026-6666", customerId: customer.id, serviceId: service.id, status: "ESTIMATE_SENT" },
  });
  const quote = await prisma.quote.create({
    data: { leadId: lead.id, status: "SENT", sentAt: new Date(), total: 500 },
  });
  quoteId = quote.id;
  publicToken = quote.publicToken;
}

describe("respondToQuote", () => {
  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.quote.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "quote-response-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "quote-response-test-service" } });
    await seedSentQuote();
  });

  afterAll(async () => {
    await prisma.notification.deleteMany();
    await prisma.quote.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "quote-response-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "quote-response-test-service" } });
    await prisma.businessSettings.deleteMany();
  });

  it("accepts a quote and queues a QUOTE_ACCEPTED notification", async () => {
    const result = await respondToQuote(publicToken, "ACCEPT");
    expect(result.error).toBeNull();

    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(quote.status).toBe("ACCEPTED");
    expect(quote.respondedAt).not.toBeNull();

    const notifications = await prisma.notification.findMany({ where: { relatedEntityId: quoteId } });
    expect(notifications.some((n) => n.type === "QUOTE_ACCEPTED")).toBe(true);
  });

  it("declines a quote and queues a QUOTE_DECLINED notification", async () => {
    const result = await respondToQuote(publicToken, "DECLINE", "Too expensive");
    expect(result.error).toBeNull();

    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(quote.status).toBe("DECLINED");

    const notifications = await prisma.notification.findMany({ where: { relatedEntityId: quoteId } });
    const declineNotif = notifications.find((n) => n.type === "QUOTE_DECLINED");
    expect(declineNotif?.body).toContain("Too expensive");
  });

  it("requests changes without changing quote status", async () => {
    const result = await respondToQuote(publicToken, "REQUEST_CHANGES", "Can we swap the material?");
    expect(result.error).toBeNull();

    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(quote.status).toBe("SENT");

    const notifications = await prisma.notification.findMany({ where: { relatedEntityId: quoteId } });
    const changesNotif = notifications.find((n) => n.type === "QUOTE_CHANGES_REQUESTED");
    expect(changesNotif?.body).toContain("swap the material");
  });

  it("rejects a response to an already-accepted quote", async () => {
    await respondToQuote(publicToken, "ACCEPT");
    const second = await respondToQuote(publicToken, "DECLINE");
    expect(second.error).not.toBeNull();
  });

  it("rejects an unknown token", async () => {
    const result = await respondToQuote("not-a-real-token", "ACCEPT");
    expect(result.error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- quote-response`
Expected: FAIL — module `@/app/quote/view/[token]/actions` not found.

- [ ] **Step 3: Implement `respondToQuote`**

`app/quote/view/[token]/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { queueNotification } from "@/lib/notifications";
import { getBusinessSettings } from "@/lib/settings";
import { NotificationType } from "@/lib/generated/prisma/client";

export async function respondToQuote(
  token: string,
  action: "ACCEPT" | "DECLINE" | "REQUEST_CHANGES",
  message?: string
) {
  const quote = await prisma.quote.findUnique({
    where: { publicToken: token },
    include: { lead: { include: { customer: true } } },
  });
  if (!quote) {
    return { error: "Quote not found" };
  }
  if (quote.status === "ACCEPTED" || quote.status === "DECLINED") {
    return { error: "This quote has already been responded to." };
  }

  const settings = await getBusinessSettings();

  if (action === "ACCEPT") {
    await prisma.quote.update({
      where: { id: quote.id },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });
    await queueNotification({
      type: NotificationType.QUOTE_ACCEPTED,
      recipientEmail: settings.email,
      subject: `${quote.lead.customer.name} accepted their estimate`,
      body: "View the lead in the admin dashboard for details.",
      relatedEntityType: "Quote",
      relatedEntityId: quote.id,
    });
  } else if (action === "DECLINE") {
    await prisma.quote.update({
      where: { id: quote.id },
      data: { status: "DECLINED", respondedAt: new Date() },
    });
    await queueNotification({
      type: NotificationType.QUOTE_DECLINED,
      recipientEmail: settings.email,
      subject: `${quote.lead.customer.name} declined their estimate`,
      body: message ? `Customer note: ${message}` : "No additional comments.",
      relatedEntityType: "Quote",
      relatedEntityId: quote.id,
    });
  } else {
    await queueNotification({
      type: NotificationType.QUOTE_CHANGES_REQUESTED,
      recipientEmail: settings.email,
      subject: `${quote.lead.customer.name} requested changes to their estimate`,
      body: message ?? "No details provided.",
      relatedEntityType: "Quote",
      relatedEntityId: quote.id,
    });
  }

  revalidatePath(`/admin/leads/${quote.leadId}`);
  return { error: null };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- quote-response`
Expected: PASS (5/5).

- [ ] **Step 5: Build the response form (client component)**

`components/quote/quote-response-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { respondToQuote } from "@/app/quote/view/[token]/actions";

export function QuoteResponseForm({ token }: { token: string }) {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function respond(action: "ACCEPT" | "DECLINE" | "REQUEST_CHANGES") {
    setError(null);
    startTransition(async () => {
      const res = await respondToQuote(token, action, message || undefined);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (action === "ACCEPT") {
        setResult("Thanks! We've received your acceptance and will be in touch to schedule your project.");
      } else if (action === "DECLINE") {
        setResult("Thanks for letting us know.");
      } else {
        setResult("Thanks — we've received your requested changes and will follow up.");
      }
    });
  }

  if (result) {
    return <p className="mt-6 text-sm text-green-700">{result}</p>;
  }

  return (
    <div className="mt-8 space-y-3">
      {mode === "idle" ? (
        <div className="flex flex-wrap gap-3">
          <Button type="button" disabled={isPending} onClick={() => respond("ACCEPT")}>
            Accept Estimate
          </Button>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => setMode("changes")}>
            Request Changes
          </Button>
          <Button type="button" variant="ghost" disabled={isPending} onClick={() => respond("DECLINE")}>
            Decline
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What would you like changed?"
            rows={4}
          />
          <div className="flex gap-2">
            <Button type="button" disabled={isPending} onClick={() => respond("REQUEST_CHANGES")}>
              Send Request
            </Button>
            <Button type="button" variant="outline" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Build the public page**

`app/quote/view/[token]/page.tsx`:

```tsx
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
```

- [ ] **Step 7: Verify it compiles and builds**

Run: `npx tsc --noEmit` then `npm run build`
Expected: no errors; `/quote/view/[token]` listed in the route output.

- [ ] **Step 8: Commit**

```bash
git add app/quote/view components/quote/quote-response-form.tsx tests/integration/quote-response.test.ts
git commit -m "feat: add public quote view and customer response actions"
```

---

### Task 7: Admin Quotes List Page

**Files:**
- Create: `app/admin/(protected)/quotes/page.tsx` (replaces the foundation-phase placeholder)

- [ ] **Step 1: Build the page**

`app/admin/(protected)/quotes/page.tsx`:

```tsx
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
```

- [ ] **Step 2: Verify it compiles and builds**

Run: `npx tsc --noEmit` then `npm run build`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/admin/(protected)/quotes/page.tsx"
git commit -m "feat: add admin quotes list page"
```

---

### Task 8: Full Verification Pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass.

- [ ] **Step 2: Run a full production build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 3: End-to-end manual walkthrough**

Run `npm run dev`:
1. Open an existing lead's detail page, build a quote with at least one LABOR, one MATERIAL, and one OPTIONAL (unchecked "Included") item — confirm totals update live as fields change and the optional excluded item doesn't affect the subtotal.
2. Save the draft, reload the page, confirm the items and totals persisted correctly.
3. Send the quote — confirm the lead's status becomes `ESTIMATE_SENT`, the quote builder becomes locked with a "View public quote" link, and a `QUOTE_SENT` notification was queued (verify via `npx prisma studio`).
4. Open the public link in a fresh browser context (no admin session) — confirm it loads without login, confirm `Quote.status` becomes `VIEWED` and `viewedAt` is set after the first load only (reload again and confirm it doesn't re-trigger).
5. Accept the quote — confirm the success message, confirm `Quote.status` is `ACCEPTED`, confirm a `QUOTE_ACCEPTED` notification was queued, and confirm reloading the public page now shows the "You accepted" message instead of the action buttons.
6. On a second quote, use "Request Changes" with a message — confirm the quote's status stays `SENT`/`VIEWED` (not transitioned) and a `QUOTE_CHANGES_REQUESTED` notification carries the message.
7. On a third quote, Decline — confirm `QUOTE_DECLINED` status and notification.
8. Visit `/admin/quotes`, confirm all quotes appear with correct statuses and totals, and the status filter works.
9. Confirm `/admin/leads` and the rest of the admin dashboard still work unaffected.

- [ ] **Step 4: Tag the milestone**

```bash
git add -A
git commit -m "chore: complete admin quotes phase" --allow-empty
git tag phase-6-admin-quotes
```
