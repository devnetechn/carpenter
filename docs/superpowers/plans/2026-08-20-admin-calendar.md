# Admin Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/admin/calendar` placeholder with a real week/day calendar over `Appointment` and `BlockedTime`, letting the admin create, reschedule, and cancel appointments — and block time — without ever double-booking.

**Architecture:** A pure `groupEntriesByDay` function (not a pixel-positioned grid — a list-per-day layout, simpler to implement correctly and to verify) buckets appointments/blocked-time into day columns. The Calendar page is a Server Component; view/date navigation lives in the URL. Mutations are Server Actions that re-check for conflicts inside a transaction, exactly mirroring `submitBookingAction`'s pattern from the booking-wizard phase. Blocked time is **not** duplicated — the Calendar reuses the `addBlockedTime`/`removeBlockedTime` actions already built in the foundation phase's Settings page.

**Tech Stack:** Next.js 16, TypeScript, Tailwind, shadcn/ui, Prisma, Zod, Vitest — as established.

**Spec:** `docs/superpowers/specs/2026-08-20-admin-calendar-design.md`

## Global Constraints

- No calendar library, no drag-to-reschedule — hand-built list layout with explicit edit forms, consistent with the "no generic dashboard" direction.
- Month view is out of scope this cycle (week + day only).
- Every appointment create/reschedule re-verifies no overlap exists, inside a transaction — the same pattern as `submitBookingAction`.
- Never import a Prisma enum *value* into a `"use client"` file — plain string arrays only (same rule as the admin-leads phase).

---

### Task 1: Calendar Grid — Pure Day-Grouping Function

**Files:**
- Create: `lib/calendar-grid.ts`, `tests/unit/calendar-grid.test.ts`

**Interfaces:**
- Produces: `CalendarEntry` type, `groupEntriesByDay(entries, rangeStart, daysInView): DayGroup[]`, consumed by the Calendar page (Task 5).

- [ ] **Step 1: Write the failing tests**

`tests/unit/calendar-grid.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groupEntriesByDay, type CalendarEntry } from "@/lib/calendar-grid";

const monday = new Date("2026-08-24T00:00:00.000Z");

describe("groupEntriesByDay", () => {
  it("buckets an entry into the correct day within the range", () => {
    const entries: CalendarEntry[] = [
      {
        id: "1",
        kind: "appointment",
        title: "Consultation",
        start: new Date("2026-08-24T10:00:00.000Z"),
        end: new Date("2026-08-24T11:00:00.000Z"),
      },
    ];
    const days = groupEntriesByDay(entries, monday, 7);
    expect(days).toHaveLength(7);
    expect(days[0].entries).toHaveLength(1);
    expect(days[0].entries[0].id).toBe("1");
    for (let i = 1; i < 7; i++) expect(days[i].entries).toHaveLength(0);
  });

  it("assigns entries later in the week to the correct day index", () => {
    const entries: CalendarEntry[] = [
      {
        id: "2",
        kind: "appointment",
        title: "Follow-up",
        start: new Date("2026-08-26T09:00:00.000Z"),
        end: new Date("2026-08-26T10:00:00.000Z"),
      },
    ];
    const days = groupEntriesByDay(entries, monday, 7);
    expect(days[2].entries).toHaveLength(1);
  });

  it("excludes entries outside the visible range", () => {
    const entries: CalendarEntry[] = [
      {
        id: "3",
        kind: "appointment",
        title: "Next week",
        start: new Date("2026-09-02T09:00:00.000Z"),
        end: new Date("2026-09-02T10:00:00.000Z"),
      },
    ];
    const days = groupEntriesByDay(entries, monday, 7);
    expect(days.every((d) => d.entries.length === 0)).toBe(true);
  });

  it("sorts entries within a day by start time", () => {
    const entries: CalendarEntry[] = [
      { id: "late", kind: "appointment", title: "Late", start: new Date("2026-08-24T15:00:00.000Z"), end: new Date("2026-08-24T16:00:00.000Z") },
      { id: "early", kind: "blocked", title: "Early", start: new Date("2026-08-24T08:00:00.000Z"), end: new Date("2026-08-24T09:00:00.000Z") },
    ];
    const days = groupEntriesByDay(entries, monday, 7);
    expect(days[0].entries.map((e) => e.id)).toEqual(["early", "late"]);
  });

  it("returns daysInView groups even when there are no entries", () => {
    const days = groupEntriesByDay([], monday, 1);
    expect(days).toHaveLength(1);
    expect(days[0].entries).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- calendar-grid`
Expected: FAIL — module `@/lib/calendar-grid` not found.

- [ ] **Step 3: Implement it**

`lib/calendar-grid.ts`:

```ts
export interface CalendarEntry {
  id: string;
  kind: "appointment" | "blocked";
  title: string;
  start: Date;
  end: Date;
  status?: string;
}

export interface DayGroup {
  dayIndex: number;
  date: Date;
  entries: CalendarEntry[];
}

export function groupEntriesByDay(
  entries: CalendarEntry[],
  rangeStart: Date,
  daysInView: number
): DayGroup[] {
  const rangeStartMidnight = new Date(rangeStart);
  rangeStartMidnight.setUTCHours(0, 0, 0, 0);

  const groups: DayGroup[] = Array.from({ length: daysInView }, (_, i) => ({
    dayIndex: i,
    date: new Date(rangeStartMidnight.getTime() + i * 24 * 60 * 60 * 1000),
    entries: [],
  }));

  for (const entry of entries) {
    const dayIndex = Math.floor(
      (entry.start.getTime() - rangeStartMidnight.getTime()) / (24 * 60 * 60 * 1000)
    );
    if (dayIndex >= 0 && dayIndex < daysInView) {
      groups[dayIndex].entries.push(entry);
    }
  }

  for (const group of groups) {
    group.entries.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  return groups;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- calendar-grid`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add lib/calendar-grid.ts tests/unit/calendar-grid.test.ts
git commit -m "feat: add pure calendar day-grouping function"
```

---

### Task 2: Appointment Validation Schemas

**Files:**
- Create: `lib/appointment.ts`, `tests/unit/appointment-validation.test.ts`

**Interfaces:**
- Produces: `createAppointmentSchema`, `rescheduleAppointmentSchema`, `type CreateAppointmentInput`, `type RescheduleAppointmentInput`, consumed by Task 3's server actions.

- [ ] **Step 1: Write the failing tests**

`tests/unit/appointment-validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createAppointmentSchema, rescheduleAppointmentSchema } from "@/lib/appointment";

describe("createAppointmentSchema", () => {
  it("accepts a valid appointment", () => {
    const result = createAppointmentSchema.safeParse({
      leadId: "lead_1",
      type: "CONSULTATION",
      start: "2026-08-24T13:00:00.000Z",
      end: "2026-08-24T14:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid type", () => {
    const result = createAppointmentSchema.safeParse({
      leadId: "lead_1",
      type: "SLEEPOVER",
      start: "2026-08-24T13:00:00.000Z",
      end: "2026-08-24T14:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing leadId", () => {
    const result = createAppointmentSchema.safeParse({
      leadId: "",
      type: "CONSULTATION",
      start: "2026-08-24T13:00:00.000Z",
      end: "2026-08-24T14:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("rescheduleAppointmentSchema", () => {
  it("accepts a valid reschedule payload", () => {
    const result = rescheduleAppointmentSchema.safeParse({
      appointmentId: "appt_1",
      start: "2026-08-24T13:00:00.000Z",
      end: "2026-08-24T14:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing end", () => {
    const result = rescheduleAppointmentSchema.safeParse({
      appointmentId: "appt_1",
      start: "2026-08-24T13:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- appointment-validation`
Expected: FAIL — module `@/lib/appointment` not found.

- [ ] **Step 3: Implement the schemas**

`lib/appointment.ts`:

```ts
import { z } from "zod";

export const createAppointmentSchema = z.object({
  leadId: z.string().min(1),
  type: z.enum(["CONSULTATION", "FOLLOW_UP", "JOB_VISIT"]),
  start: z.string().min(1),
  end: z.string().min(1),
  notes: z.string().optional(),
});

export const rescheduleAppointmentSchema = z.object({
  appointmentId: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>;
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- appointment-validation`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add lib/appointment.ts tests/unit/appointment-validation.test.ts
git commit -m "feat: add appointment validation schemas"
```

---

### Task 3: Calendar Server Actions

**Files:**
- Create: `app/admin/(protected)/calendar/actions.ts`, `tests/integration/calendar-actions.test.ts`

**Interfaces:**
- Consumes: `createAppointmentSchema`/`rescheduleAppointmentSchema` (Task 2), `prisma` (foundation).
- Produces: `createAppointment(input)`, `rescheduleAppointment(input)`, `cancelAppointment(appointmentId)`, consumed by Task 6's client components.

- [ ] **Step 1: Write the failing tests**

`tests/integration/calendar-actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createAppointment, rescheduleAppointment, cancelAppointment } = await import(
  "@/app/admin/(protected)/calendar/actions"
);

let leadId: string;

async function seedLead() {
  const service = await prisma.service.create({
    data: { name: "Test", slug: "calendar-test-service", description: "d" },
  });
  const customer = await prisma.customer.create({
    data: { name: "Jane", phone: "555", email: "calendar-test@example.com" },
  });
  const lead = await prisma.lead.create({
    data: {
      bookingRef: "CW-2026-8888",
      customerId: customer.id,
      serviceId: service.id,
      status: "NEW",
    },
  });
  leadId = lead.id;
  return lead;
}

describe("calendar server actions", () => {
  beforeEach(async () => {
    await prisma.appointment.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "calendar-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "calendar-test-service" } });
    await seedLead();
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "calendar-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "calendar-test-service" } });
  });

  it("creates an appointment", async () => {
    const result = await createAppointment({
      leadId,
      type: "CONSULTATION",
      start: "2026-09-10T13:00:00.000Z",
      end: "2026-09-10T14:00:00.000Z",
    });
    expect(result.error).toBeNull();

    const appts = await prisma.appointment.findMany({ where: { leadId } });
    expect(appts).toHaveLength(1);
    expect(appts[0].type).toBe("CONSULTATION");
  });

  it("rejects an overlapping appointment", async () => {
    await createAppointment({
      leadId,
      type: "CONSULTATION",
      start: "2026-09-10T13:00:00.000Z",
      end: "2026-09-10T14:00:00.000Z",
    });

    const second = await createAppointment({
      leadId,
      type: "FOLLOW_UP",
      start: "2026-09-10T13:30:00.000Z",
      end: "2026-09-10T14:30:00.000Z",
    });
    expect(second.error).not.toBeNull();

    const appts = await prisma.appointment.findMany({ where: { leadId } });
    expect(appts).toHaveLength(1);
  });

  it("reschedules an appointment to a free slot", async () => {
    const created = await prisma.appointment.create({
      data: {
        leadId,
        type: "CONSULTATION",
        start: new Date("2026-09-10T13:00:00.000Z"),
        end: new Date("2026-09-10T14:00:00.000Z"),
        status: "SCHEDULED",
      },
    });

    const result = await rescheduleAppointment({
      appointmentId: created.id,
      start: "2026-09-11T13:00:00.000Z",
      end: "2026-09-11T14:00:00.000Z",
    });
    expect(result.error).toBeNull();

    const updated = await prisma.appointment.findUniqueOrThrow({ where: { id: created.id } });
    expect(updated.start.toISOString()).toBe("2026-09-11T13:00:00.000Z");
  });

  it("rejects rescheduling into an occupied slot", async () => {
    const first = await prisma.appointment.create({
      data: {
        leadId,
        type: "CONSULTATION",
        start: new Date("2026-09-10T13:00:00.000Z"),
        end: new Date("2026-09-10T14:00:00.000Z"),
        status: "SCHEDULED",
      },
    });
    const second = await prisma.appointment.create({
      data: {
        leadId,
        type: "FOLLOW_UP",
        start: new Date("2026-09-12T13:00:00.000Z"),
        end: new Date("2026-09-12T14:00:00.000Z"),
        status: "SCHEDULED",
      },
    });

    const result = await rescheduleAppointment({
      appointmentId: second.id,
      start: "2026-09-10T13:30:00.000Z",
      end: "2026-09-10T14:30:00.000Z",
    });
    expect(result.error).not.toBeNull();

    const unchanged = await prisma.appointment.findUniqueOrThrow({ where: { id: second.id } });
    expect(unchanged.start.toISOString()).toBe("2026-09-12T13:00:00.000Z");
  });

  it("cancels an appointment", async () => {
    const created = await prisma.appointment.create({
      data: {
        leadId,
        type: "CONSULTATION",
        start: new Date("2026-09-10T13:00:00.000Z"),
        end: new Date("2026-09-10T14:00:00.000Z"),
        status: "SCHEDULED",
      },
    });

    await cancelAppointment(created.id);

    const updated = await prisma.appointment.findUniqueOrThrow({ where: { id: created.id } });
    expect(updated.status).toBe("CANCELLED");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- calendar-actions`
Expected: FAIL — module `@/app/admin/(protected)/calendar/actions` not found.

- [ ] **Step 3: Implement the actions**

`app/admin/(protected)/calendar/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  createAppointmentSchema,
  rescheduleAppointmentSchema,
  type CreateAppointmentInput,
  type RescheduleAppointmentInput,
} from "@/lib/appointment";
import type { Prisma } from "@/lib/generated/prisma/client";

class SlotConflictError extends Error {}

async function assertNoConflict(
  tx: Prisma.TransactionClient,
  start: Date,
  end: Date,
  excludeAppointmentId?: string
) {
  const conflicting = await tx.appointment.findFirst({
    where: {
      status: { not: "CANCELLED" },
      start: { lt: end },
      end: { gt: start },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
  });
  if (conflicting) {
    throw new SlotConflictError();
  }
}

export async function createAppointment(input: CreateAppointmentInput) {
  const parsed = createAppointmentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;
  const start = new Date(data.start);
  const end = new Date(data.end);

  try {
    await prisma.$transaction(async (tx) => {
      await assertNoConflict(tx, start, end);
      await tx.appointment.create({
        data: {
          leadId: data.leadId,
          type: data.type,
          start,
          end,
          notes: data.notes,
          status: "SCHEDULED",
        },
      });
    });
  } catch (err) {
    if (err instanceof SlotConflictError) {
      return { error: { start: ["This time overlaps an existing appointment."] } };
    }
    throw err;
  }

  revalidatePath("/admin/calendar");
  return { error: null };
}

export async function rescheduleAppointment(input: RescheduleAppointmentInput) {
  const parsed = rescheduleAppointmentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;
  const start = new Date(data.start);
  const end = new Date(data.end);

  try {
    await prisma.$transaction(async (tx) => {
      await assertNoConflict(tx, start, end, data.appointmentId);
      await tx.appointment.update({
        where: { id: data.appointmentId },
        data: { start, end },
      });
    });
  } catch (err) {
    if (err instanceof SlotConflictError) {
      return { error: { start: ["This time overlaps an existing appointment."] } };
    }
    throw err;
  }

  revalidatePath("/admin/calendar");
  return { error: null };
}

export async function cancelAppointment(appointmentId: string) {
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "CANCELLED" },
  });
  revalidatePath("/admin/calendar");
  return { error: null };
}
```

(`Prisma.TransactionClient` is Prisma's own generated type for exactly this purpose — confirmed present in `lib/generated/prisma/internal/prismaNamespace.ts` before writing this.)

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- calendar-actions`
Expected: PASS (5/5).

- [ ] **Step 5: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/admin/(protected)/calendar/actions.ts" tests/integration/calendar-actions.test.ts
git commit -m "feat: add appointment create/reschedule/cancel server actions"
```

---

### Task 4: Wire Blocked-Time Actions to Also Revalidate the Calendar

**Files:**
- Modify: `app/admin/(protected)/settings/actions.ts`

**Interfaces:**
- `addBlockedTime`/`removeBlockedTime` already exist (foundation phase) and already have test coverage — this task only adds a second `revalidatePath` call, no behavior change requiring new tests.

- [ ] **Step 1: Add the second revalidation target**

In `addBlockedTime` and `removeBlockedTime`, add `revalidatePath("/admin/calendar");` immediately after the existing `revalidatePath("/admin/settings");` line in each function (both actions currently end with a single `revalidatePath` call — add the second line right after it in both places).

- [ ] **Step 2: Run the existing settings tests to confirm nothing broke**

Run: `npm run test -- settings-actions`
Expected: PASS (4/4) — unchanged, since the mocked `revalidatePath` accepts any path.

- [ ] **Step 3: Commit**

```bash
git add "app/admin/(protected)/settings/actions.ts"
git commit -m "feat: revalidate the calendar when blocked time changes"
```

---

### Task 5: Calendar Page

**Files:**
- Create: `app/admin/(protected)/calendar/page.tsx`

**Interfaces:**
- Consumes: `groupEntriesByDay` (Task 1), `prisma` (foundation).
- Produces: the page shell that Task 6's client components plug into.

- [ ] **Step 1: Build the page**

`app/admin/(protected)/calendar/page.tsx`:

```tsx
import Link from "next/link";
import { prisma } from "@/lib/db";
import { groupEntriesByDay, type CalendarEntry } from "@/lib/calendar-grid";
import { CreateAppointmentForm } from "@/components/admin/create-appointment-form";
import { AppointmentActions } from "@/components/admin/appointment-actions";
import { BlockTimeForm } from "@/components/admin/block-time-form";

function startOfWeekUTC(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

function startOfDayUTC(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const { view: viewParam, date: dateParam } = await searchParams;
  const view = viewParam === "day" ? "day" : "week";
  const anchorDate = dateParam ? new Date(dateParam) : new Date();

  const rangeStart = view === "day" ? startOfDayUTC(anchorDate) : startOfWeekUTC(anchorDate);
  const daysInView = view === "day" ? 1 : 7;
  const rangeEnd = new Date(rangeStart.getTime() + daysInView * 24 * 60 * 60 * 1000);

  const [appointments, blockedTimes, openLeads] = await Promise.all([
    prisma.appointment.findMany({
      where: { start: { lt: rangeEnd }, end: { gt: rangeStart } },
      include: { lead: { include: { customer: true, service: true } } },
      orderBy: { start: "asc" },
    }),
    prisma.blockedTime.findMany({
      where: { start: { lt: rangeEnd }, end: { gt: rangeStart } },
    }),
    prisma.lead.findMany({
      where: { status: { notIn: ["COMPLETED", "LOST"] } },
      include: { customer: true, service: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const entries: CalendarEntry[] = [
    ...appointments.map((a) => ({
      id: a.id,
      kind: "appointment" as const,
      title: `${a.type} — ${a.lead.customer.name} (${a.lead.service.name})`,
      start: a.start,
      end: a.end,
      status: a.status,
    })),
    ...blockedTimes.map((b) => ({
      id: b.id,
      kind: "blocked" as const,
      title: b.reason ?? "Blocked",
      start: b.start,
      end: b.end,
    })),
  ];

  const days = groupEntriesByDay(entries, rangeStart, daysInView);

  const stepDays = view === "day" ? 1 : 7;
  const prevDate = new Date(rangeStart.getTime() - stepDays * 24 * 60 * 60 * 1000);
  const nextDate = new Date(rangeStart.getTime() + stepDays * 24 * 60 * 60 * 1000);

  const leadOptions = openLeads.map((l) => ({
    id: l.id,
    label: `${l.customer.name} — ${l.service.name} (${l.bookingRef})`,
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Calendar</h1>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/admin/calendar?view=${view}&date=${prevDate.toISOString().slice(0, 10)}`}
            className="rounded-md border px-3 py-1.5"
          >
            &larr; Prev
          </Link>
          <Link
            href={`/admin/calendar?view=${view}&date=${nextDate.toISOString().slice(0, 10)}`}
            className="rounded-md border px-3 py-1.5"
          >
            Next &rarr;
          </Link>
          <Link
            href={`/admin/calendar?view=week&date=${anchorDate.toISOString().slice(0, 10)}`}
            className={`rounded-md border px-3 py-1.5 ${view === "week" ? "border-accent bg-accent/10" : ""}`}
          >
            Week
          </Link>
          <Link
            href={`/admin/calendar?view=day&date=${anchorDate.toISOString().slice(0, 10)}`}
            className={`rounded-md border px-3 py-1.5 ${view === "day" ? "border-accent bg-accent/10" : ""}`}
          >
            Day
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <CreateAppointmentForm leads={leadOptions} />
        <BlockTimeForm />
      </div>

      <div
        className="mt-6 grid gap-4"
        style={{ gridTemplateColumns: `repeat(${daysInView}, minmax(0, 1fr))` }}
      >
        {days.map((day) => (
          <div key={day.dayIndex} className="rounded-lg border p-3">
            <p className="text-sm font-semibold">
              {DAY_NAMES[day.date.getUTCDay()]} {day.date.getUTCMonth() + 1}/{day.date.getUTCDate()}
            </p>
            <div className="mt-2 space-y-2">
              {day.entries.map((entry) => (
                <div
                  key={entry.id}
                  className={`rounded-md border p-2 text-xs ${
                    entry.kind === "blocked"
                      ? "border-dashed bg-muted"
                      : entry.status === "CANCELLED"
                        ? "opacity-50 line-through"
                        : "bg-accent/5"
                  }`}
                >
                  <p className="font-medium">{entry.title}</p>
                  <p className="text-muted-foreground">
                    {entry.start.toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    –{" "}
                    {entry.end.toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                  {entry.kind === "appointment" && entry.status !== "CANCELLED" && (
                    <AppointmentActions
                      appointmentId={entry.id}
                      currentStart={entry.start.toISOString()}
                      currentEnd={entry.end.toISOString()}
                    />
                  )}
                </div>
              ))}
              {day.entries.length === 0 && (
                <p className="text-xs text-muted-foreground">Nothing scheduled.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: fails only on the not-yet-created `CreateAppointmentForm`/`AppointmentActions`/`BlockTimeForm` imports — expected; Task 6 creates them. Commit Tasks 5 and 6 together, matching the pattern used for the booking wizard's shell + first step.

---

### Task 6: Calendar Client Components

**Files:**
- Create: `components/admin/create-appointment-form.tsx`, `components/admin/appointment-actions.tsx`, `components/admin/block-time-form.tsx`

**Interfaces:**
- Consumes: `createAppointment`/`rescheduleAppointment`/`cancelAppointment` (Task 3), `addBlockedTime` (foundation, modified in Task 4).

- [ ] **Step 1: Build the create-appointment form**

`components/admin/create-appointment-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAppointment } from "@/app/admin/(protected)/calendar/actions";

interface LeadOption {
  id: string;
  label: string;
}

const APPOINTMENT_TYPES = ["CONSULTATION", "FOLLOW_UP", "JOB_VISIT"] as const;

export function CreateAppointmentForm({ leads }: { leads: LeadOption[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-sm font-semibold">
        {open ? "Close" : "+ New Appointment"}
      </button>
      {open && (
        <form
          action={(formData) =>
            startTransition(async () => {
              setError(null);
              const result = await createAppointment({
                leadId: String(formData.get("leadId")),
                type: String(formData.get("type")) as (typeof APPOINTMENT_TYPES)[number],
                start: new Date(String(formData.get("start"))).toISOString(),
                end: new Date(String(formData.get("end"))).toISOString(),
              });
              if (result.error) {
                setError("Could not create the appointment. Check the time isn't already booked.");
              } else {
                setOpen(false);
              }
            })
          }
          className="mt-3 grid gap-3 sm:grid-cols-2"
        >
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="leadId">Lead</Label>
            <select
              id="leadId"
              name="leadId"
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <select
              id="type"
              name="type"
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {APPOINTMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div />
          <div className="space-y-2">
            <Label htmlFor="start">Start</Label>
            <Input id="start" name="start" type="datetime-local" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end">End</Label>
            <Input id="end" name="end" type="datetime-local" required />
          </div>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={isPending || leads.length === 0}>
              {isPending ? "Saving..." : "Create Appointment"}
            </Button>
            {leads.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">No open leads to schedule.</p>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build the per-appointment reschedule/cancel controls**

`components/admin/appointment-actions.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancelAppointment, rescheduleAppointment } from "@/app/admin/(protected)/calendar/actions";

export function AppointmentActions({
  appointmentId,
  currentStart,
  currentEnd,
}: {
  appointmentId: string;
  currentStart: string;
  currentEnd: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [rescheduling, setRescheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (rescheduling) {
    return (
      <form
        action={(formData) =>
          startTransition(async () => {
            setError(null);
            const result = await rescheduleAppointment({
              appointmentId,
              start: new Date(String(formData.get("start"))).toISOString(),
              end: new Date(String(formData.get("end"))).toISOString(),
            });
            if (result.error) {
              setError("That time overlaps another appointment.");
            } else {
              setRescheduling(false);
            }
          })
        }
        className="mt-2 space-y-2"
      >
        <Input name="start" type="datetime-local" defaultValue={currentStart.slice(0, 16)} required />
        <Input name="end" type="datetime-local" defaultValue={currentEnd.slice(0, 16)} required />
        {error && <p className="text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={isPending}>
            Save
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setRescheduling(false)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-2 flex gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => setRescheduling(true)}>
        Reschedule
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await cancelAppointment(appointmentId);
          })
        }
      >
        Cancel
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Build the block-time control (reusing the Settings actions)**

`components/admin/block-time-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addBlockedTime } from "@/app/admin/(protected)/settings/actions";

export function BlockTimeForm() {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-sm font-semibold">
        {open ? "Close" : "+ Block Time"}
      </button>
      {open && (
        <form
          action={(formData) =>
            startTransition(async () => {
              await addBlockedTime(formData);
              setOpen(false);
            })
          }
          className="mt-3 grid gap-3 sm:grid-cols-3"
        >
          <div className="space-y-2">
            <Label htmlFor="block-start">Start</Label>
            <Input id="block-start" name="start" type="datetime-local" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="block-end">End</Label>
            <Input id="block-end" name="end" type="datetime-local" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="block-reason">Reason</Label>
            <Input id="block-reason" name="reason" placeholder="Optional" />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Block Time"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 5: Run a full production build**

Run: `npm run build`
Expected: no errors; `/admin/calendar` listed in the route output.

- [ ] **Step 6: Commit**

```bash
git add "app/admin/(protected)/calendar/page.tsx" components/admin/create-appointment-form.tsx components/admin/appointment-actions.tsx components/admin/block-time-form.tsx
git commit -m "feat: add admin calendar page with create/reschedule/cancel and block time"
```

---

### Task 7: Full Verification Pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass.

- [ ] **Step 2: Run a full production build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 3: End-to-end manual walkthrough**

Run `npm run dev`:
1. Visit `/admin/calendar` (week view by default) — confirm any existing appointments from earlier wizard testing render on the correct day with correct times.
2. Switch to Day view, confirm it shows only the current day; navigate Prev/Next in both views.
3. Create a new appointment for an existing open lead; confirm it appears on the grid.
4. Attempt to create a second appointment at the exact same overlapping time for a different lead; confirm it's rejected with a clear message and nothing was created.
5. Reschedule the created appointment to a free time; confirm the grid updates.
6. Attempt to reschedule it onto another existing appointment's time; confirm rejection.
7. Cancel an appointment; confirm it renders with the cancelled visual treatment (struck through/muted) rather than disappearing.
8. Block a time range; confirm it renders visually distinct (dashed border) on the grid.
9. Go through the public `/quote` wizard's Step 6 for a date/time inside the blocked range; confirm that slot no longer appears as available — proving the calendar's blocked time and the wizard's availability engine share the same underlying data with no separate system to fall out of sync.
10. Confirm `/admin/settings`'s existing blocked-time list still works unaffected (Task 4 only added an extra revalidation target, not new behavior).

- [ ] **Step 4: Tag the milestone**

```bash
git add -A
git commit -m "chore: complete admin calendar phase" --allow-empty
git tag phase-5-admin-calendar
```
