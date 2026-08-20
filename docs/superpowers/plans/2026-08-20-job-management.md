# Job Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the business convert an accepted quote into a `Job`, then manage that job to completion: status lifecycle, an editable info panel, materials/labor actually used (tracked independently of the quote), before/during/after photos, and a website-featured toggle.

**Architecture:** `Job`, `JobPhoto`, and `JobLineItem` are already fully modeled in the schema from the foundation phase — no migration needed. One new server action converts an `ACCEPTED` `Quote` into a `Job` (copying only the quote's `isIncluded` line items into fresh, independently-editable `JobLineItem` rows), triggered by a button on the lead detail page. A new `/admin/jobs` list page and `/admin/jobs/[id]` detail page follow the exact structural conventions already established by the Leads and Quotes admin pages (status-filtered table, status-update form, editable info form, line-item builder, file upload via the existing `/api/upload` route).

**Tech Stack:** Next.js App Router (Server Actions), Prisma 7, Zod v4, Vitest, existing `lib/storage.ts` + `lib/fileSignature.ts` for photo uploads.

**Spec:** `docs/superpowers/specs/2026-08-20-job-management-design.md`

## Global Constraints

- Never pass a raw Prisma `Decimal` field as a prop to a `"use client"` component — always convert via `.toString()` first.
- Never import a Prisma enum *value* into a `"use client"` file — only `import type`, or declare a local string-literal union type (as `quote-builder.tsx` already does for `ItemType`). Enum values may be imported freely in `"use server"` files.
- Any multi-write mutation must be wrapped in `prisma.$transaction`.
- Uncontrolled inputs (`useState(initialValue)`) that read server data must get a `key` prop derived from that data so they remount and resync after `revalidatePath` — see `JobInfoForm` below, matching the existing fix in `BusinessInfoForm`'s usage.
- `startTransition`'s callback must return `void`/`Promise<void>` — never return a Server Action's result directly.
- Follow existing file conventions exactly: list pages use a `<select>` + `<table>` filtered by `searchParams.status` (see `app/admin/(protected)/quotes/page.tsx`); status-update forms mirror `components/admin/lead-status-form.tsx`; info-edit forms mirror `components/admin/business-info-form.tsx`; item builders mirror `components/admin/quote-builder.tsx`; server actions that accept a single structured payload take one object argument (see `saveQuoteDraft`), not multiple positional args.
- `Lead.jobs` and `Quote.jobs` are **plural** relations (`Job[]`) — do not write `lead.job` / `quote.job` (this exact mistake was already made and fixed once this session for `lead.quotes`).

---

### Task 1: Quote-to-Job conversion server action

**Files:**
- Create: `lib/job-status.ts`
- Create: `app/admin/(protected)/leads/[id]/job-actions.ts`
- Test: `tests/integration/quote-to-job.test.ts`

**Interfaces:**
- Produces: `JOB_STATUSES: readonly string[]` (from `lib/job-status.ts`), `convertQuoteToJob(quoteId: string): Promise<{ error: string | null; jobId: string | null }>` (from `job-actions.ts`) — consumed by Task 2's `ConvertToJobButton`.

- [ ] **Step 1: Create the job status constant**

`lib/job-status.ts`:

```ts
export const JOB_STATUSES = ["SCHEDULED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;

export type JobStatusValue = (typeof JOB_STATUSES)[number];
```

- [ ] **Step 2: Write the failing test**

`tests/integration/quote-to-job.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { convertQuoteToJob } = await import("@/app/admin/(protected)/leads/[id]/job-actions");

let leadId: string;
let quoteId: string;

async function seedAcceptedQuote() {
  const service = await prisma.service.create({
    data: { name: "Test", slug: "job-conversion-test-service", description: "d" },
  });
  const customer = await prisma.customer.create({
    data: { name: "Jane", phone: "555", email: "job-conversion-test@example.com" },
  });
  const lead = await prisma.lead.create({
    data: { bookingRef: "CW-2026-8888", customerId: customer.id, serviceId: service.id, status: "ESTIMATE_SENT" },
  });
  await prisma.project.create({
    data: {
      leadId: lead.id,
      addressStreet: "42 Oak St",
      addressCity: "Springfield",
      addressState: "IL",
      addressZip: "62701",
    },
  });
  const quote = await prisma.quote.create({
    data: { leadId: lead.id, status: "ACCEPTED", total: 1000 },
  });
  await prisma.quoteItem.createMany({
    data: [
      { quoteId: quote.id, type: "LABOR", description: "Labor", quantity: 10, unitPrice: 50, isIncluded: true, sortOrder: 0 },
      { quoteId: quote.id, type: "MATERIAL", description: "Wood", quantity: 5, unitPrice: 20, isIncluded: true, sortOrder: 1 },
      { quoteId: quote.id, type: "OPTIONAL", description: "Upgrade", quantity: 1, unitPrice: 300, isOptional: true, isIncluded: false, sortOrder: 2 },
    ],
  });
  leadId = lead.id;
  quoteId = quote.id;
}

describe("convertQuoteToJob", () => {
  beforeEach(async () => {
    await prisma.jobLineItem.deleteMany();
    await prisma.job.deleteMany();
    await prisma.quoteItem.deleteMany();
    await prisma.quote.deleteMany();
    await prisma.project.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "job-conversion-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "job-conversion-test-service" } });
    await seedAcceptedQuote();
  });

  afterAll(async () => {
    await prisma.jobLineItem.deleteMany();
    await prisma.job.deleteMany();
    await prisma.quoteItem.deleteMany();
    await prisma.quote.deleteMany();
    await prisma.project.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "job-conversion-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "job-conversion-test-service" } });
  });

  it("creates a job seeded from included quote items and sets lead to SCHEDULED", async () => {
    const result = await convertQuoteToJob(quoteId);
    expect(result.error).toBeNull();
    expect(result.jobId).toBeTruthy();

    const job = await prisma.job.findUniqueOrThrow({
      where: { id: result.jobId! },
      include: { lineItems: true },
    });
    expect(job.leadId).toBe(leadId);
    expect(job.quoteId).toBe(quoteId);
    expect(job.status).toBe("SCHEDULED");
    expect(job.addressStreet).toBe("42 Oak St");
    expect(job.lineItems).toHaveLength(2);
    expect(job.lineItems.map((i) => i.description).sort()).toEqual(["Labor", "Wood"]);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.status).toBe("SCHEDULED");
  });

  it("rejects conversion of a quote that is not accepted", async () => {
    await prisma.quote.update({ where: { id: quoteId }, data: { status: "SENT" } });
    const result = await convertQuoteToJob(quoteId);
    expect(result.error).not.toBeNull();
    expect(result.jobId).toBeNull();
  });

  it("rejects a second conversion attempt for the same lead", async () => {
    await convertQuoteToJob(quoteId);
    const second = await convertQuoteToJob(quoteId);
    expect(second.error).not.toBeNull();
    expect(second.jobId).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/integration/quote-to-job.test.ts`
Expected: FAIL — `job-actions` module not found.

- [ ] **Step 4: Implement the conversion action**

`app/admin/(protected)/leads/[id]/job-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

class JobAlreadyExistsError extends Error {}

export async function convertQuoteToJob(quoteId: string) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      items: true,
      lead: { include: { project: true, service: true } },
    },
  });
  if (!quote) {
    return { error: "Quote not found", jobId: null };
  }
  if (quote.status !== "ACCEPTED") {
    return { error: "Only an accepted quote can be converted to a job.", jobId: null };
  }

  const includedItems = quote.items.filter((item) => item.isIncluded);

  let jobId: string;
  try {
    jobId = await prisma.$transaction(async (tx) => {
      const existingJob = await tx.job.findFirst({ where: { leadId: quote.leadId } });
      if (existingJob) {
        throw new JobAlreadyExistsError();
      }

      const job = await tx.job.create({
        data: {
          quoteId: quote.id,
          leadId: quote.leadId,
          customerId: quote.lead.customerId,
          scopeOfWork: quote.lead.service.name,
          addressStreet: quote.lead.project?.addressStreet ?? "",
          addressCity: quote.lead.project?.addressCity ?? "",
          addressState: quote.lead.project?.addressState ?? "",
          addressZip: quote.lead.project?.addressZip ?? "",
        },
      });

      if (includedItems.length > 0) {
        await tx.jobLineItem.createMany({
          data: includedItems.map((item) => ({
            jobId: job.id,
            type: item.type === "LABOR" ? "LABOR" : "MATERIAL",
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: Number(item.quantity.toString()) * Number(item.unitPrice.toString()),
          })),
        });
      }

      await tx.lead.update({ where: { id: quote.leadId }, data: { status: "SCHEDULED" } });

      return job.id;
    });
  } catch (err) {
    if (err instanceof JobAlreadyExistsError) {
      return { error: "A job already exists for this lead.", jobId: null };
    }
    throw err;
  }

  revalidatePath(`/admin/leads/${quote.leadId}`);
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin/jobs");
  return { error: null, jobId };
}
```

Note: an `OPTIONAL`-type quote item can only reach this code path if it was marked `isIncluded: true` (an upsell the customer agreed to) — the `isIncluded` filter runs first. Since `JobLineItemType` has no `OPTIONAL` value, such an item is copied in as `MATERIAL`. This is a deliberate, minor simplification: an included optional upsell is folded into the job's material tracking rather than getting its own type.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/integration/quote-to-job.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/job-status.ts "app/admin/(protected)/leads/[id]/job-actions.ts" tests/integration/quote-to-job.test.ts
git commit -m "feat: add quote-to-job conversion server action"
```

---

### Task 2: "Convert to Job" button on the lead detail page

**Files:**
- Create: `components/admin/convert-to-job-button.tsx`
- Modify: `app/admin/(protected)/leads/[id]/page.tsx`

**Interfaces:**
- Consumes: `convertQuoteToJob(quoteId: string)` from Task 1.
- Produces: `<ConvertToJobButton quoteId={string} />`, rendered by the lead detail page.

- [ ] **Step 1: Create the button component**

`components/admin/convert-to-job-button.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { convertQuoteToJob } from "@/app/admin/(protected)/leads/[id]/job-actions";

export function ConvertToJobButton({ quoteId }: { quoteId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await convertQuoteToJob(quoteId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/admin/jobs/${result.jobId}`);
    });
  }

  return (
    <div>
      <Button type="button" onClick={handleClick} disabled={isPending}>
        {isPending ? "Converting..." : "Convert to Job"}
      </Button>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the lead detail page**

In `app/admin/(protected)/leads/[id]/page.tsx`:

Add the import:

```tsx
import { ConvertToJobButton } from "@/components/admin/convert-to-job-button";
```

Add `jobs: { select: { id: true } },` to the `prisma.lead.findUnique` include block, alongside the existing `quotes` include.

At the end of the existing Quote `<section>` (after the `<QuoteBuilder ... />` element), add:

```tsx
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
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (`/admin/jobs/[id]` does not exist yet, but that's fine — it's a plain `<a href>`, not a typed `<Link>`, so it won't fail typechecking before Task 7 creates the route.)

- [ ] **Step 4: Commit**

```bash
git add components/admin/convert-to-job-button.tsx "app/admin/(protected)/leads/[id]/page.tsx"
git commit -m "feat: add Convert to Job button to the lead detail page"
```

---

### Task 3: Job mutation server actions (status, info, line items, photos, featured toggle)

**Files:**
- Create: `lib/job.ts`
- Create: `app/admin/(protected)/jobs/[id]/actions.ts`
- Test: `tests/integration/job-actions.test.ts`

**Interfaces:**
- Produces (from `lib/job.ts`): `jobInfoSchema`, `jobLineItemInputSchema`, `saveJobLineItemsSchema`, and inferred types `JobInfoInput`, `JobLineItemInput`, `SaveJobLineItemsInput`.
- Produces (from `actions.ts`): `updateJobStatus(jobId: string, status: string): Promise<{ error: string | null }>`, `saveJobInfo(jobId: string, formData: FormData): Promise<{ error: unknown }>`, `saveJobLineItems(input: SaveJobLineItemsInput): Promise<{ error: unknown }>`, `addJobPhoto(jobId: string, phase: string, url: string, caption?: string): Promise<{ error: string | null }>`, `deleteJobPhoto(photoId: string): Promise<{ error: string | null }>`, `toggleFeaturedOnWebsite(jobId: string, next: boolean): Promise<{ error: string | null }>`. Consumed by Tasks 4, 5, 6.

- [ ] **Step 1: Create the validation schemas**

`lib/job.ts`:

```ts
import { z } from "zod";

export const jobInfoSchema = z.object({
  scopeOfWork: z.string().min(1),
  addressStreet: z.string().min(1),
  addressCity: z.string().min(1),
  addressState: z.string().min(1).max(2),
  addressZip: z.string().min(1),
  startDate: z.string().optional(),
});

export const jobLineItemInputSchema = z.object({
  type: z.enum(["LABOR", "MATERIAL"]),
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
});

export const saveJobLineItemsSchema = z.object({
  jobId: z.string().min(1),
  items: z.array(jobLineItemInputSchema).min(1),
});

export type JobInfoInput = z.infer<typeof jobInfoSchema>;
export type JobLineItemInput = z.infer<typeof jobLineItemInputSchema>;
export type SaveJobLineItemsInput = z.infer<typeof saveJobLineItemsSchema>;
```

- [ ] **Step 2: Write the failing test**

`tests/integration/job-actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  updateJobStatus,
  saveJobInfo,
  saveJobLineItems,
  addJobPhoto,
  deleteJobPhoto,
  toggleFeaturedOnWebsite,
} = await import("@/app/admin/(protected)/jobs/[id]/actions");

let jobId: string;

async function seedJob() {
  const service = await prisma.service.create({
    data: { name: "Test", slug: "job-action-test-service", description: "d" },
  });
  const customer = await prisma.customer.create({
    data: { name: "Jane", phone: "555", email: "job-action-test@example.com" },
  });
  const lead = await prisma.lead.create({
    data: { bookingRef: "CW-2026-9999", customerId: customer.id, serviceId: service.id, status: "SCHEDULED" },
  });
  const job = await prisma.job.create({
    data: {
      leadId: lead.id,
      customerId: customer.id,
      scopeOfWork: "Deck",
      addressStreet: "1 A St",
      addressCity: "Springfield",
      addressState: "IL",
      addressZip: "62701",
    },
  });
  jobId = job.id;
}

describe("job server actions", () => {
  beforeEach(async () => {
    await prisma.jobPhoto.deleteMany();
    await prisma.jobLineItem.deleteMany();
    await prisma.job.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "job-action-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "job-action-test-service" } });
    await seedJob();
  });

  afterAll(async () => {
    await prisma.jobPhoto.deleteMany();
    await prisma.jobLineItem.deleteMany();
    await prisma.job.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "job-action-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "job-action-test-service" } });
  });

  it("sets completionDate when moved to COMPLETED and clears it when moved away", async () => {
    await updateJobStatus(jobId, "COMPLETED");
    let job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe("COMPLETED");
    expect(job.completionDate).not.toBeNull();

    await updateJobStatus(jobId, "IN_PROGRESS");
    job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe("IN_PROGRESS");
    expect(job.completionDate).toBeNull();
  });

  it("rejects an invalid status", async () => {
    const result = await updateJobStatus(jobId, "NOT_A_STATUS");
    expect(result.error).not.toBeNull();
  });

  it("saves job info fields", async () => {
    const formData = new FormData();
    formData.set("scopeOfWork", "Updated scope");
    formData.set("addressStreet", "2 B St");
    formData.set("addressCity", "Springfield");
    formData.set("addressState", "IL");
    formData.set("addressZip", "62701");
    formData.set("startDate", "2026-09-01");

    const result = await saveJobInfo(jobId, formData);
    expect(result.error).toBeNull();

    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.scopeOfWork).toBe("Updated scope");
    expect(job.addressStreet).toBe("2 B St");
    expect(job.startDate?.toISOString().slice(0, 10)).toBe("2026-09-01");
  });

  it("replaces line items on save rather than appending, and computes totals", async () => {
    await saveJobLineItems({
      jobId,
      items: [{ type: "LABOR", description: "A", quantity: 2, unitPrice: 50 }],
    });
    await saveJobLineItems({
      jobId,
      items: [
        { type: "LABOR", description: "B", quantity: 1, unitPrice: 100 },
        { type: "MATERIAL", description: "C", quantity: 4, unitPrice: 25 },
      ],
    });

    const items = await prisma.jobLineItem.findMany({ where: { jobId } });
    expect(items).toHaveLength(2);
    const c = items.find((i) => i.description === "C");
    expect(Number(c?.total)).toBeCloseTo(100);
  });

  it("adds and deletes a job photo", async () => {
    const addResult = await addJobPhoto(jobId, "BEFORE", "/uploads/test.jpg", "Test caption");
    expect(addResult.error).toBeNull();

    const photo = await prisma.jobPhoto.findFirstOrThrow({ where: { jobId } });
    expect(photo.phase).toBe("BEFORE");
    expect(photo.caption).toBe("Test caption");

    const deleteResult = await deleteJobPhoto(photo.id);
    expect(deleteResult.error).toBeNull();

    const remaining = await prisma.jobPhoto.findMany({ where: { jobId } });
    expect(remaining).toHaveLength(0);
  });

  it("toggles featuredOnWebsite", async () => {
    await toggleFeaturedOnWebsite(jobId, true);
    let job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.featuredOnWebsite).toBe(true);

    await toggleFeaturedOnWebsite(jobId, false);
    job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.featuredOnWebsite).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/integration/job-actions.test.ts`
Expected: FAIL — `actions` module not found.

- [ ] **Step 4: Implement the actions**

`app/admin/(protected)/jobs/[id]/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { jobInfoSchema, saveJobLineItemsSchema, type SaveJobLineItemsInput } from "@/lib/job";
import { JobStatus, JobPhotoPhase } from "@/lib/generated/prisma/client";

const VALID_STATUSES: string[] = Object.values(JobStatus);
const VALID_PHASES: string[] = Object.values(JobPhotoPhase);

export async function updateJobStatus(jobId: string, status: string) {
  if (!VALID_STATUSES.includes(status)) {
    return { error: "Invalid status" };
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: status as JobStatus,
      completionDate: status === "COMPLETED" ? new Date() : null,
    },
  });

  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin/jobs");
  return { error: null };
}

export async function saveJobInfo(jobId: string, formData: FormData) {
  const parsed = jobInfoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  await prisma.job.update({
    where: { id: jobId },
    data: {
      scopeOfWork: data.scopeOfWork,
      addressStreet: data.addressStreet,
      addressCity: data.addressCity,
      addressState: data.addressState,
      addressZip: data.addressZip,
      startDate: data.startDate ? new Date(data.startDate) : null,
    },
  });

  revalidatePath(`/admin/jobs/${jobId}`);
  return { error: null };
}

export async function saveJobLineItems(input: SaveJobLineItemsInput) {
  const parsed = saveJobLineItemsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  await prisma.$transaction(async (tx) => {
    await tx.jobLineItem.deleteMany({ where: { jobId: data.jobId } });
    await tx.jobLineItem.createMany({
      data: data.items.map((item) => ({
        jobId: data.jobId,
        type: item.type,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.quantity * item.unitPrice,
      })),
    });
  });

  revalidatePath(`/admin/jobs/${data.jobId}`);
  return { error: null };
}

export async function addJobPhoto(jobId: string, phase: string, url: string, caption?: string) {
  if (!VALID_PHASES.includes(phase)) {
    return { error: "Invalid photo phase" };
  }

  await prisma.jobPhoto.create({
    data: { jobId, phase: phase as JobPhotoPhase, url, caption: caption?.trim() || null },
  });

  revalidatePath(`/admin/jobs/${jobId}`);
  return { error: null };
}

export async function deleteJobPhoto(photoId: string) {
  const photo = await prisma.jobPhoto.findUnique({ where: { id: photoId } });
  if (!photo) {
    return { error: "Photo not found" };
  }

  await prisma.jobPhoto.delete({ where: { id: photoId } });
  await storage.delete(photo.url);

  revalidatePath(`/admin/jobs/${photo.jobId}`);
  return { error: null };
}

export async function toggleFeaturedOnWebsite(jobId: string, next: boolean) {
  await prisma.job.update({ where: { id: jobId }, data: { featuredOnWebsite: next } });
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin/jobs");
  revalidatePath("/portfolio");
  revalidatePath("/");
  return { error: null };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/integration/job-actions.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/job.ts "app/admin/(protected)/jobs/[id]/actions.ts" tests/integration/job-actions.test.ts
git commit -m "feat: add job status, info, line item, photo, and featured server actions"
```

---

### Task 4: Job status form and job info form components

**Files:**
- Create: `components/admin/job-status-form.tsx`
- Create: `components/admin/job-info-form.tsx`

**Interfaces:**
- Consumes: `updateJobStatus`, `saveJobInfo` (Task 3), `JOB_STATUSES` (Task 1).
- Produces: `<JobStatusForm jobId currentStatus />`, `<JobInfoForm jobId job={JobInfoView} />` with `JobInfoView = { scopeOfWork, addressStreet, addressCity, addressState, addressZip, startDate }` (all `string`) — consumed by Task 7.

- [ ] **Step 1: Create the status form**

`components/admin/job-status-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateJobStatus } from "@/app/admin/(protected)/jobs/[id]/actions";
import { JOB_STATUSES } from "@/lib/job-status";

export function JobStatusForm({ jobId, currentStatus }: { jobId: string; currentStatus: string }) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(currentStatus);

  return (
    <form
      action={() =>
        startTransition(async () => {
          await updateJobStatus(jobId, status);
        })
      }
      className="flex items-center gap-2"
    >
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="rounded-md border bg-background px-3 py-1.5 text-sm"
      >
        {JOB_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={isPending || status === currentStatus}>
        {isPending ? "Saving..." : "Update Status"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Create the job info form**

`components/admin/job-info-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveJobInfo } from "@/app/admin/(protected)/jobs/[id]/actions";

export interface JobInfoView {
  scopeOfWork: string;
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
  startDate: string;
}

export function JobInfoForm({ jobId, job }: { jobId: string; job: JobInfoView }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      key={`${job.scopeOfWork}-${job.startDate}`}
      action={(formData) =>
        startTransition(async () => {
          const result = await saveJobInfo(jobId, formData);
          setError(result.error ? "Please check the highlighted fields." : null);
          setMessage(result.error ? null : "Saved.");
        })
      }
      className="grid grid-cols-2 gap-4"
    >
      <div className="col-span-2 space-y-2">
        <Label htmlFor="scopeOfWork">Scope of work</Label>
        <Textarea id="scopeOfWork" name="scopeOfWork" defaultValue={job.scopeOfWork} required rows={3} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="addressStreet">Street</Label>
        <Input id="addressStreet" name="addressStreet" defaultValue={job.addressStreet} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="addressCity">City</Label>
        <Input id="addressCity" name="addressCity" defaultValue={job.addressCity} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="addressState">State</Label>
        <Input id="addressState" name="addressState" defaultValue={job.addressState} maxLength={2} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="addressZip">ZIP</Label>
        <Input id="addressZip" name="addressZip" defaultValue={job.addressZip} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="startDate">Start date</Label>
        <Input id="startDate" name="startDate" type="date" defaultValue={job.startDate} />
      </div>
      {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
      {message && <p className="col-span-2 text-sm text-green-700">{message}</p>}
      <div className="col-span-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save job info"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/admin/job-status-form.tsx components/admin/job-info-form.tsx
git commit -m "feat: add job status and job info form components"
```

---

### Task 5: Job line items component

**Files:**
- Create: `components/admin/job-line-items.tsx`

**Interfaces:**
- Consumes: `saveJobLineItems` (Task 3).
- Produces: `<JobLineItems jobId existingItems={ExistingLineItemView[]} />` with `ExistingLineItemView = { type: "LABOR" | "MATERIAL", description: string, quantity: string, unitPrice: string }` — consumed by Task 7. `quantity`/`unitPrice` are strings (already-converted `Decimal.toString()` values) per the Decimal-safety constraint.

- [ ] **Step 1: Create the component**

`components/admin/job-line-items.tsx`:

```tsx
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/admin/job-line-items.tsx
git commit -m "feat: add job line items component"
```

---

### Task 6: Job photos component and featured-on-website toggle

**Files:**
- Create: `components/admin/job-photos.tsx`
- Create: `components/admin/job-featured-toggle.tsx`

**Interfaces:**
- Consumes: `addJobPhoto`, `deleteJobPhoto`, `toggleFeaturedOnWebsite` (Task 3).
- Produces: `<JobPhotos jobId photos={JobPhotoView[]} />` with `JobPhotoView = { id: string, url: string, phase: "BEFORE" | "DURING" | "AFTER", caption: string | null }`; `<JobFeaturedToggle jobId featured={boolean} />` — both consumed by Task 7.

- [ ] **Step 1: Create the photos component**

`components/admin/job-photos.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { addJobPhoto, deleteJobPhoto } from "@/app/admin/(protected)/jobs/[id]/actions";

type Phase = "BEFORE" | "DURING" | "AFTER";
const PHASES: { value: Phase; label: string }[] = [
  { value: "BEFORE", label: "Before" },
  { value: "DURING", label: "During" },
  { value: "AFTER", label: "After" },
];

export interface JobPhotoView {
  id: string;
  url: string;
  phase: Phase;
  caption: string | null;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export function JobPhotos({ jobId, photos }: { jobId: string; photos: JobPhotoView[] }) {
  const [isPending, startTransition] = useTransition();
  const [phase, setPhase] = useState<Phase>("BEFORE");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(`${file.name} is not a supported image type.`);
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError(`${file.name} is larger than 10MB.`);
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.set("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const body = await res.json();
    setUploading(false);

    if (!res.ok) {
      setError(body.error ?? "Upload failed.");
      return;
    }

    startTransition(async () => {
      await addJobPhoto(jobId, phase, body.url, caption || undefined);
      setCaption("");
    });
  }

  function handleDelete(photoId: string) {
    startTransition(async () => {
      await deleteJobPhoto(photoId);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="space-y-1">
          <span className="block text-muted-foreground">Phase</span>
          <select
            value={phase}
            onChange={(e) => setPhase(e.target.value as Phase)}
            className="rounded-md border bg-background px-2 py-1.5"
          >
            {PHASES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-muted-foreground">Caption (optional)</span>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="rounded-md border bg-background px-2 py-1.5"
          />
        </label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading || isPending}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
      {uploading && <p className="text-sm text-muted-foreground">Uploading...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {PHASES.map((p) => {
        const phasePhotos = photos.filter((photo) => photo.phase === p.value);
        return (
          <div key={p.value}>
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">{p.label}</h3>
            {phasePhotos.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">No photos yet.</p>
            ) : (
              <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {phasePhotos.map((photo) => (
                  <div key={photo.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.caption ?? p.label}
                      className="h-24 w-full rounded-md object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleDelete(photo.id)}
                      disabled={isPending}
                      className="absolute right-1 top-1 rounded-full bg-background/90 px-2 text-xs"
                    >
                      &times;
                    </button>
                    {photo.caption && <p className="mt-1 text-xs text-muted-foreground">{photo.caption}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create the featured toggle**

`components/admin/job-featured-toggle.tsx` (a Server Component — no `"use client"` needed, it's a plain form bound to a Server Action):

```tsx
import { Button } from "@/components/ui/button";
import { toggleFeaturedOnWebsite } from "@/app/admin/(protected)/jobs/[id]/actions";

export function JobFeaturedToggle({ jobId, featured }: { jobId: string; featured: boolean }) {
  return (
    <form action={toggleFeaturedOnWebsite.bind(null, jobId, !featured)}>
      <Button type="submit" size="sm" variant="outline">
        {featured ? "Remove from website" : "Feature on website"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/admin/job-photos.tsx components/admin/job-featured-toggle.tsx
git commit -m "feat: add job photos component and featured-on-website toggle"
```

---

### Task 7: Job detail page

**Files:**
- Create: `app/admin/(protected)/jobs/[id]/page.tsx`

**Interfaces:**
- Consumes: `JobStatusForm`, `JobInfoForm` + `JobInfoView` (Task 4), `JobLineItems` + `ExistingLineItemView` (Task 5), `JobPhotos` + `JobPhotoView`, `JobFeaturedToggle` (Task 6).

- [ ] **Step 1: Build the page**

`app/admin/(protected)/jobs/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { JobStatusForm } from "@/components/admin/job-status-form";
import { JobInfoForm } from "@/components/admin/job-info-form";
import { JobLineItems } from "@/components/admin/job-line-items";
import { JobPhotos } from "@/components/admin/job-photos";
import { JobFeaturedToggle } from "@/components/admin/job-featured-toggle";

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
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles and builds**

Run: `npx tsc --noEmit` then `npm run build`
Expected: no errors; `/admin/jobs/[id]` listed in the route output.

- [ ] **Step 3: Commit**

```bash
git add "app/admin/(protected)/jobs/[id]/page.tsx"
git commit -m "feat: add job detail page"
```

---

### Task 8: Jobs list page

**Files:**
- Create: `app/admin/(protected)/jobs/page.tsx` (replaces the foundation-phase placeholder)

- [ ] **Step 1: Build the page**

`app/admin/(protected)/jobs/page.tsx`:

```tsx
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { JOB_STATUSES } from "@/lib/job-status";
import type { JobStatus } from "@/lib/generated/prisma/client";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const jobs = await prisma.job.findMany({
    where: status ? { status: status as JobStatus } : undefined,
    include: { lead: { include: { customer: true, service: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Jobs</h1>
        <form className="flex items-center gap-2">
          <select
            name="status"
            defaultValue={status ?? ""}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">All statuses</option>
            {JOB_STATUSES.map((s) => (
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
              <th className="pb-2 pr-4">Start Date</th>
              <th className="pb-2">Completion Date</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  <Link href={`/admin/jobs/${job.id}`} className="text-accent hover:underline">
                    {job.lead.customer.name}
                  </Link>
                </td>
                <td className="py-2 pr-4">{job.lead.service.name}</td>
                <td className="py-2 pr-4">
                  <Badge variant="secondary">{job.status}</Badge>
                </td>
                <td className="py-2 pr-4">
                  {job.startDate ? job.startDate.toLocaleDateString() : "—"}
                </td>
                <td className="py-2">
                  {job.completionDate ? job.completionDate.toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {jobs.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">No jobs match this filter.</p>
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
git add "app/admin/(protected)/jobs/page.tsx"
git commit -m "feat: add jobs list page"
```

---

### Task 9: Full Verification Pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass.

- [ ] **Step 2: Run a full production build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 3: End-to-end manual walkthrough**

Using an already-`ACCEPTED` quote from the Admin Quotes phase's manual walkthrough (or accept a fresh one first), with `npm run dev` running:

1. Open that lead's detail page, confirm the "Convert to Job" button appears under the Quote section, click it.
2. Confirm redirect to `/admin/jobs/[id]`, confirm the job's line items match only the quote's `isIncluded` items (any unchecked optional upsell must be absent).
3. Confirm the source lead's status is now `SCHEDULED`.
4. Reload the lead detail page — confirm the Quote section now shows a "View job" link instead of the Convert button.
5. Attempt to convert the same lead's quote again isn't possible from the UI (button is gone) — separately confirm via `npx prisma studio` or a scratch script that calling the action a second time is rejected (already covered by the automated test, but worth a quick sanity check).
6. On the job detail page: edit the scope of work, address, and start date via the Job Info form, save, reload, confirm persistence.
7. Edit line items — add a new material row, remove one of the seeded rows, save, reload, confirm persistence and confirm the "Total actual cost" recomputed correctly.
8. Upload at least one photo to each of Before/During/After with captions, confirm they appear grouped correctly, delete one and confirm it disappears and the file is removed from `public/uploads/`.
9. Toggle "Feature on website", confirm the button label flips.
10. Change status to `COMPLETED`, confirm `completionDate` gets set (check via the Jobs list page's Completion Date column). Change status back to `IN_PROGRESS`, confirm the Jobs list shows "—" for completion date again.
11. Set status back to `COMPLETED` and leave "Feature on website" on — visit the public `/portfolio` page and confirm this job now appears there (the marketing site already filters on `status: "COMPLETED", featuredOnWebsite: true`).
12. Visit `/admin/jobs`, confirm the job appears with correct status/dates, and the status filter works.
13. Confirm `/admin/leads`, `/admin/quotes`, and the rest of the admin dashboard still work unaffected.

- [ ] **Step 4: Tag the milestone**

```bash
git add -A
git commit -m "chore: complete job management phase" --allow-empty
git tag phase-7-job-management
```
