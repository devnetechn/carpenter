# Admin Leads Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin real visibility into and control over the Leads the booking wizard and contact form already create — a list, a detail view, status updates with audit logging, internal notes, and real Overview metrics.

**Architecture:** Both pages are Server Components reading Prisma directly (an authenticated internal surface — no client-fetch layer needed, matching the Settings page pattern). Mutations are Server Actions in `app/admin/(protected)/leads/actions.ts`. A shared `lib/lead-status.ts` constant (plain strings, not the Prisma enum) is used by anything that might render in a Client Component, since importing Prisma's generated enum *value* into client code risks bundling server-only runtime code into the browser — the foundation phase only ever imported Prisma *types* into client components, never enum values, and this plan preserves that boundary.

**Tech Stack:** Next.js 16, TypeScript, Tailwind, shadcn/ui, Prisma, Zod, Vitest — as established.

**Spec:** `docs/superpowers/specs/2026-08-20-admin-leads-design.md`

## Global Constraints

- Never pass `AdminUser.passwordHash` (or any field containing it) into a Client Component prop — map to a narrow, explicit shape at the server/client boundary, per the pattern already used for `BusinessSettings.taxRate`/`depositPercent` in the foundation phase.
- Never import a Prisma enum *value* (e.g. `LeadStatus.NEW`, or `Object.values(LeadStatus)`) into a `"use client"` file — only `import type`. Shared status lists for client use live in `lib/lead-status.ts` as plain string arrays.
- Every lead status change writes an `AuditLog` row, per the foundation spec.
- `LeadNote` is admin-only — never rendered on any public/customer-facing page.

---

### Task 1: Schema — `Lead.preferredContact`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the field**

In the `Lead` model, add after `source`:

```prisma
  source       String        @default("website")
  preferredContact String?
```

- [ ] **Step 2: Migrate dev and test databases**

```bash
npx prisma migrate dev --name add_lead_preferred_contact
npx dotenv -e .env.test -- npx prisma migrate deploy
npx prisma generate
```

- [ ] **Step 3: Commit**

```bash
git add prisma
git commit -m "feat: add Lead.preferredContact"
```

---

### Task 2: Persist `preferredContact` on Booking Submission

**Files:**
- Modify: `app/quote/actions.ts`

**Interfaces:**
- The wizard already collects and validates `preferredContact` (Task 5 of the booking-wizard plan) — it was silently dropped before this task.

- [ ] **Step 1: Save it on the Lead**

In `submitBookingAction`, in the `tx.lead.create` call, add `preferredContact: data.preferredContact` alongside the existing fields.

- [ ] **Step 2: Update the existing test to assert it**

In `tests/integration/submit-booking.test.ts`, in the first test case, add after the existing `lead?.project?.status` assertion:

```ts
    expect(lead?.preferredContact).toBe("EMAIL");
```

- [ ] **Step 3: Run the test and confirm it passes**

Run: `npm run test -- submit-booking`
Expected: PASS (3/3).

- [ ] **Step 4: Commit**

```bash
git add "app/quote/actions.ts" tests/integration/submit-booking.test.ts
git commit -m "feat: persist preferredContact from the booking wizard"
```

---

### Task 3: Shared Status List and Answer-Label Helper

**Files:**
- Create: `lib/lead-status.ts`, `lib/lead-answers.ts`, `tests/unit/lead-answers.test.ts`

**Interfaces:**
- Produces: `LEAD_STATUSES: readonly string[]` (Task 4's list page, Task 6's status form), `resolveAnswerLabels(questions, answers): AnswerEntry[]` (Task 6's detail page).

- [ ] **Step 1: Add the shared status list**

`lib/lead-status.ts`:

```ts
export const LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "CONSULTATION_SCHEDULED",
  "ESTIMATE_SENT",
  "FOLLOW_UP",
  "APPROVED",
  "SCHEDULED",
  "COMPLETED",
  "LOST",
] as const;

export type LeadStatusValue = (typeof LEAD_STATUSES)[number];
```

(This list must stay in sync with the `LeadStatus` enum in `prisma/schema.prisma` — it's a plain-string mirror, not a re-export, specifically so it's safe to import from Client Components.)

- [ ] **Step 2: Write the failing test for the answer-label helper**

`tests/unit/lead-answers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveAnswerLabels } from "@/lib/lead-answers";

describe("resolveAnswerLabels", () => {
  const questions = [
    { id: "q1", label: "Existing deck?" },
    { id: "q2", label: "Dimensions" },
    { id: "q3", label: "Unanswered question" },
  ];

  it("pairs answers with their question labels, in question order", () => {
    const result = resolveAnswerLabels(questions, { q2: "20x14", q1: "yes" });
    expect(result).toEqual([
      { label: "Existing deck?", value: "yes" },
      { label: "Dimensions", value: "20x14" },
    ]);
  });

  it("ignores answers with no matching question", () => {
    const result = resolveAnswerLabels(questions, { q1: "yes", stray: "orphan" });
    expect(result).toEqual([{ label: "Existing deck?", value: "yes" }]);
  });

  it("returns an empty array when there are no answers", () => {
    expect(resolveAnswerLabels(questions, {})).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npm run test -- lead-answers`
Expected: FAIL — module `@/lib/lead-answers` not found.

- [ ] **Step 4: Implement the helper**

`lib/lead-answers.ts`:

```ts
export interface AnswerEntry {
  label: string;
  value: string;
}

interface QuestionLike {
  id: string;
  label: string;
}

export function resolveAnswerLabels(
  questions: QuestionLike[],
  answers: Record<string, string>
): AnswerEntry[] {
  return questions
    .filter((q) => answers[q.id] !== undefined)
    .map((q) => ({ label: q.label, value: answers[q.id] }));
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm run test -- lead-answers`
Expected: PASS (3/3).

- [ ] **Step 6: Commit**

```bash
git add lib/lead-status.ts lib/lead-answers.ts tests/unit/lead-answers.test.ts
git commit -m "feat: add shared lead status list and answer-label helper"
```

---

### Task 4: Leads List Page

**Files:**
- Create: `app/admin/(protected)/leads/page.tsx`

**Interfaces:**
- Consumes: `LEAD_STATUSES` (Task 3), `prisma` (foundation), `Badge` (foundation shadcn component).

- [ ] **Step 1: Replace the placeholder page**

`app/admin/(protected)/leads/page.tsx`:

```tsx
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { LEAD_STATUSES } from "@/lib/lead-status";
import type { LeadStatus } from "@/lib/generated/prisma/client";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const leads = await prisma.lead.findMany({
    where: status ? { status: status as LeadStatus } : undefined,
    include: { customer: true, service: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Leads</h1>
        <form className="flex items-center gap-2">
          <select
            name="status"
            defaultValue={status ?? ""}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">All statuses</option>
            {LEAD_STATUSES.map((s) => (
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
              <th className="pb-2 pr-4">Reference</th>
              <th className="pb-2 pr-4">Customer</th>
              <th className="pb-2 pr-4">Service</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Budget</th>
              <th className="pb-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  <Link href={`/admin/leads/${lead.id}`} className="text-accent hover:underline">
                    {lead.bookingRef}
                  </Link>
                </td>
                <td className="py-2 pr-4">{lead.customer.name}</td>
                <td className="py-2 pr-4">{lead.service.name}</td>
                <td className="py-2 pr-4">
                  <Badge variant="secondary">{lead.status}</Badge>
                </td>
                <td className="py-2 pr-4">
                  {lead.budgetMin || lead.budgetMax
                    ? `$${lead.budgetMin?.toString() ?? "?"} - $${lead.budgetMax?.toString() ?? "?"}`
                    : "—"}
                </td>
                <td className="py-2">{lead.createdAt.toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {leads.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">No leads match this filter.</p>
        )}
      </div>
    </div>
  );
}
```

(`import type { LeadStatus }` — a type-only import, safe in a Server Component regardless, but kept as `type` for consistency with the Client Component boundary rule elsewhere in this plan.)

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add "app/admin/(protected)/leads/page.tsx"
git commit -m "feat: add admin leads list page"
```

---

### Task 5: Status Update and Note Server Actions

**Files:**
- Create: `app/admin/(protected)/leads/actions.ts`, `tests/integration/leads-actions.test.ts`

**Interfaces:**
- Consumes: `auth` (foundation `auth.ts`), `prisma` (foundation).
- Produces: `updateLeadStatus(leadId, status): Promise<{ error: string | null }>`, `addLeadNote(leadId, body): Promise<{ error: string | null }>`, consumed by Task 6's detail page components.

- [ ] **Step 1: Write the failing tests**

`tests/integration/leads-actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let adminUserId: string;
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: adminUserId } })),
}));

const { updateLeadStatus, addLeadNote } = await import(
  "@/app/admin/(protected)/leads/actions"
);

async function seedLead() {
  const service = await prisma.service.create({
    data: { name: "Test", slug: "leads-test-service", description: "d" },
  });
  const customer = await prisma.customer.create({
    data: { name: "Jane", phone: "555", email: "leads-test@example.com" },
  });
  return prisma.lead.create({
    data: {
      bookingRef: "CW-2026-9999",
      customerId: customer.id,
      serviceId: service.id,
      status: "NEW",
    },
  });
}

describe("lead admin actions", () => {
  beforeEach(async () => {
    await prisma.leadNote.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "leads-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "leads-test-service" } });
    await prisma.adminUser.deleteMany({ where: { email: "leads-test-admin@example.com" } });

    const admin = await prisma.adminUser.create({
      data: { email: "leads-test-admin@example.com", name: "Admin", passwordHash: "x" },
    });
    adminUserId = admin.id;
  });

  afterAll(async () => {
    await prisma.leadNote.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "leads-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "leads-test-service" } });
    await prisma.adminUser.deleteMany({ where: { email: "leads-test-admin@example.com" } });
  });

  it("updates lead status and writes an audit log", async () => {
    const lead = await seedLead();
    const result = await updateLeadStatus(lead.id, "CONTACTED");
    expect(result.error).toBeNull();

    const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updated.status).toBe("CONTACTED");

    const auditLogs = await prisma.auditLog.findMany({ where: { entityId: lead.id } });
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].action).toBe("lead.status_updated");
  });

  it("rejects an invalid status", async () => {
    const lead = await seedLead();
    const result = await updateLeadStatus(lead.id, "NOT_A_STATUS");
    expect(result.error).not.toBeNull();
  });

  it("adds a note tied to the current admin user", async () => {
    const lead = await seedLead();
    const result = await addLeadNote(lead.id, "Called, left voicemail.");
    expect(result.error).toBeNull();

    const notes = await prisma.leadNote.findMany({ where: { leadId: lead.id } });
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toBe("Called, left voicemail.");
    expect(notes[0].adminUserId).toBe(adminUserId);
  });

  it("rejects an empty note", async () => {
    const lead = await seedLead();
    const result = await addLeadNote(lead.id, "   ");
    expect(result.error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- leads-actions`
Expected: FAIL — module `@/app/admin/(protected)/leads/actions` not found.

- [ ] **Step 3: Implement the actions**

`app/admin/(protected)/leads/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { LeadStatus } from "@/lib/generated/prisma/client";

const VALID_STATUSES: string[] = Object.values(LeadStatus);

export async function updateLeadStatus(leadId: string, status: string) {
  if (!VALID_STATUSES.includes(status)) {
    return { error: "Invalid status" };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Not authenticated" };
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: { status: status as LeadStatus },
  });

  await prisma.auditLog.create({
    data: {
      adminUserId: session.user.id,
      action: "lead.status_updated",
      entityType: "Lead",
      entityId: leadId,
      metadata: { status },
    },
  });

  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/leads");
  return { error: null };
}

export async function addLeadNote(leadId: string, body: string) {
  if (!body.trim()) {
    return { error: "Note cannot be empty" };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Not authenticated" };
  }

  await prisma.leadNote.create({
    data: {
      leadId,
      adminUserId: session.user.id,
      body: body.trim(),
    },
  });

  revalidatePath(`/admin/leads/${leadId}`);
  return { error: null };
}
```

(This file is `"use server"` — it runs only on the server, so importing the Prisma `LeadStatus` enum *value* here is safe; the Global Constraint about enum values applies to `"use client"` files, not this one.)

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- leads-actions`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add "app/admin/(protected)/leads/actions.ts" tests/integration/leads-actions.test.ts
git commit -m "feat: add lead status update and note server actions"
```

---

### Task 6: Lead Detail Page

**Files:**
- Create: `app/admin/(protected)/leads/[id]/page.tsx`, `components/admin/lead-status-form.tsx`, `components/admin/lead-notes.tsx`

**Interfaces:**
- Consumes: `resolveAnswerLabels` (Task 3), `updateLeadStatus`/`addLeadNote` (Task 5), `LEAD_STATUSES` (Task 3).

- [ ] **Step 1: Verify the Badge component's variants**

Run: `grep -n "variant" components/ui/badge.tsx`
Confirm a `destructive` variant exists (used in Step 4 below for the "outside service area" indicator). If it doesn't, use `variant="secondary"` for that badge instead and drop the color distinction — don't invent a variant name the component doesn't support.

- [ ] **Step 2: Build the status form (client component)**

`components/admin/lead-status-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateLeadStatus } from "@/app/admin/(protected)/leads/actions";
import { LEAD_STATUSES } from "@/lib/lead-status";

export function LeadStatusForm({
  leadId,
  currentStatus,
}: {
  leadId: string;
  currentStatus: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(currentStatus);

  return (
    <form
      action={() => startTransition(() => updateLeadStatus(leadId, status))}
      className="flex items-center gap-2"
    >
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="rounded-md border bg-background px-3 py-1.5 text-sm"
      >
        {LEAD_STATUSES.map((s) => (
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

- [ ] **Step 3: Build the notes list + add-note form (client component)**

`components/admin/lead-notes.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addLeadNote } from "@/app/admin/(protected)/leads/actions";

export interface LeadNoteView {
  id: string;
  body: string;
  createdAt: Date;
  authorName: string;
}

export function LeadNotes({ leadId, notes }: { leadId: string; notes: LeadNoteView[] }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-2 space-y-4">
      <form
        action={(formData) =>
          startTransition(() => addLeadNote(leadId, String(formData.get("body") ?? "")))
        }
        className="space-y-2"
      >
        <Textarea name="body" rows={3} placeholder="Add an internal note..." required />
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving..." : "Add Note"}
        </Button>
      </form>
      <ul className="space-y-3 text-sm">
        {notes.map((note) => (
          <li key={note.id} className="rounded-md border p-3">
            <p>{note.body}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {note.authorName} &middot; {note.createdAt.toLocaleString()}
            </p>
          </li>
        ))}
      </ul>
      {notes.length === 0 && (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      )}
    </div>
  );
}
```

(`notes` here is explicitly the narrow `LeadNoteView[]` shape — never the raw Prisma `LeadNote & { adminUser: AdminUser }` type, which would carry `adminUser.passwordHash` into this Client Component's props. The detail page in Step 4 is responsible for mapping to this shape before passing it down.)

- [ ] **Step 4: Build the detail page**

`app/admin/(protected)/leads/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { resolveAnswerLabels } from "@/lib/lead-answers";
import { LeadStatusForm } from "@/components/admin/lead-status-form";
import { LeadNotes } from "@/components/admin/lead-notes";
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
    },
  });

  if (!lead) {
    notFound();
  }

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
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Internal Notes</h2>
        <LeadNotes leadId={lead.id} notes={noteViews} />
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no type errors. If Step 1 found no `destructive` badge variant, make sure the `variant={...}` expression here was adjusted accordingly before this check.

- [ ] **Step 6: Commit**

```bash
git add "app/admin/(protected)/leads/[id]" components/admin/lead-status-form.tsx components/admin/lead-notes.tsx
git commit -m "feat: add lead detail page with status control and internal notes"
```

---

### Task 7: Overview Metrics

**Files:**
- Modify: `app/admin/(protected)/page.tsx`

- [ ] **Step 1: Replace the placeholder with real counts**

`app/admin/(protected)/page.tsx`:

```tsx
import { prisma } from "@/lib/db";

export default async function OverviewPage() {
  const [newLeadsCount, upcomingAppointmentsCount, totalLeadsCount] = await Promise.all([
    prisma.lead.count({ where: { status: "NEW" } }),
    prisma.appointment.count({ where: { status: "SCHEDULED", start: { gt: new Date() } } }),
    prisma.lead.count(),
  ]);

  return (
    <div>
      <h1 className="text-lg font-semibold">Overview</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">New Leads</p>
          <p className="mt-1 text-2xl font-semibold">{newLeadsCount}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Upcoming Appointments</p>
          <p className="mt-1 text-2xl font-semibold">{upcomingAppointmentsCount}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Total Leads</p>
          <p className="mt-1 text-2xl font-semibold">{totalLeadsCount}</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add "app/admin/(protected)/page.tsx"
git commit -m "feat: add real lead/appointment counts to admin overview"
```

---

### Task 8: Full Verification Pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass.

- [ ] **Step 2: Run a full production build**

Run: `npm run build`
Expected: no type errors, no build failures.

- [ ] **Step 3: End-to-end manual walkthrough**

Run `npm run dev`:
1. Submit a booking through the real `/quote` wizard (as in the booking-wizard phase's verification) to generate a fresh lead with photos and answers.
2. Log into `/admin`, confirm the Overview page shows non-zero New Leads / Upcoming Appointments counts.
3. Visit `/admin/leads`, confirm the new lead appears with correct customer/service/status/budget.
4. Filter by status `NEW`, confirm the list narrows correctly; clear the filter.
5. Open the lead's detail page, confirm: customer info, dynamic project answers with correct labels, the uploaded photo, the service-area badge, the scheduled consultation appointment, and preferred contact method all render correctly.
6. Change the status via the dropdown, confirm it persists after reload and the list page reflects the new status.
7. Add an internal note, confirm it appears immediately with the correct admin name and timestamp.
8. Confirm none of this — status control, notes — is reachable or visible from any public/marketing page.

- [ ] **Step 4: Tag the milestone**

```bash
git add -A
git commit -m "chore: complete admin leads management phase" --allow-empty
git tag phase-4-admin-leads
```
