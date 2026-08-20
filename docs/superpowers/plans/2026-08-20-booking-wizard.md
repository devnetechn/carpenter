# Booking Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/quote` stub with the real 8-step booking wizard: service selection, dynamic project questions, photo upload, address/service-area check, budget, availability-based scheduling, customer info, and a confirmation screen with a booking reference.

**Architecture:** One client component (`BookingWizard`) holds all step state in memory; each step is its own component. Persistence is deferred until Step 7 (Customer Information) — a single transactional server action creates `Customer`/`Lead`/`Project`/`ProjectPhoto`/`Appointment` together, since `Lead.customerId` is required and nothing upstream of contact info is safely persistable. A shared `lib/availability.ts` slot engine backs both this wizard and (later) the admin calendar.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Prisma, Zod, Vitest — as established in prior phases.

**Spec:** `docs/superpowers/specs/2026-08-20-booking-wizard-design.md`

## Global Constraints

- Persistence happens once, at Step 7, inside a single Prisma transaction — no draft `Lead` created at Step 1 (deliberate deviation from the foundation spec's literal wording, documented and justified in the design spec's Section 3 note).
- The availability engine (`lib/availability.ts`) is the one and only conflict-prevention code path — no duplicated slot/overlap logic anywhere else.
- Re-check slot availability server-side at submit time (inside the transaction) even though the client only shows already-filtered slots — closes the race window between "view slots" and "submit."
- File uploads go through `api/upload`, reusing `storage`/`detectImageType` from the foundation phase — do not re-implement validation.
- Max 10 photos, 10MB each, jpeg/png/webp only (matching the foundation's `detectImageType` support).

---

### Task 1: Availability Engine — Pure Slot Computation

**Files:**
- Create: `lib/availability.ts`, `tests/unit/availability.test.ts`

**Interfaces:**
- Produces: `computeAvailableSlots(hours, busy, durationMin, rangeStart, rangeEnd): AvailableSlot[]` — pure function, no DB access, consumed by Task 2's `getAvailableSlots` wrapper.

- [ ] **Step 1: Write the failing tests**

`tests/unit/availability.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeAvailableSlots } from "@/lib/availability";

const monday = new Date("2026-08-24T00:00:00.000Z"); // a Monday

const businessHours = [
  { dayOfWeek: 0, openTime: "00:00", closeTime: "00:00", isClosed: true },
  { dayOfWeek: 1, openTime: "09:00", closeTime: "11:00", isClosed: false },
  { dayOfWeek: 2, openTime: "09:00", closeTime: "11:00", isClosed: false },
  { dayOfWeek: 3, openTime: "09:00", closeTime: "11:00", isClosed: false },
  { dayOfWeek: 4, openTime: "09:00", closeTime: "11:00", isClosed: false },
  { dayOfWeek: 5, openTime: "09:00", closeTime: "11:00", isClosed: false },
  { dayOfWeek: 6, openTime: "00:00", closeTime: "00:00", isClosed: true },
];

describe("computeAvailableSlots", () => {
  it("generates duration-sized slots within business hours", () => {
    const rangeStart = new Date(monday);
    const rangeEnd = new Date(monday.getTime() + 24 * 60 * 60 * 1000);

    const slots = computeAvailableSlots(businessHours, [], 60, rangeStart, rangeEnd);

    expect(slots).toHaveLength(2);
    expect(slots[0].start.getUTCHours()).toBe(9);
    expect(slots[1].start.getUTCHours()).toBe(10);
  });

  it("produces no slots on a closed day", () => {
    const sunday = new Date("2026-08-23T00:00:00.000Z");
    const rangeEnd = new Date(sunday.getTime() + 24 * 60 * 60 * 1000);

    const slots = computeAvailableSlots(businessHours, [], 60, sunday, rangeEnd);

    expect(slots).toHaveLength(0);
  });

  it("excludes slots overlapping a busy window", () => {
    const rangeStart = new Date(monday);
    const rangeEnd = new Date(monday.getTime() + 24 * 60 * 60 * 1000);
    const busy = [
      {
        start: new Date("2026-08-24T09:00:00.000Z"),
        end: new Date("2026-08-24T10:00:00.000Z"),
      },
    ];

    const slots = computeAvailableSlots(businessHours, busy, 60, rangeStart, rangeEnd);

    expect(slots).toHaveLength(1);
    expect(slots[0].start.getUTCHours()).toBe(10);
  });

  it("excludes slots overlapping a blocked-time-style window spanning multiple slots", () => {
    const rangeStart = new Date(monday);
    const rangeEnd = new Date(monday.getTime() + 24 * 60 * 60 * 1000);
    const busy = [
      {
        start: new Date("2026-08-24T08:30:00.000Z"),
        end: new Date("2026-08-24T11:30:00.000Z"),
      },
    ];

    const slots = computeAvailableSlots(businessHours, busy, 60, rangeStart, rangeEnd);

    expect(slots).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- availability`
Expected: FAIL — module `@/lib/availability` not found.

- [ ] **Step 3: Implement `computeAvailableSlots`**

`lib/availability.ts`:

```ts
export interface AvailableSlot {
  start: Date;
  end: Date;
}

interface BusinessHoursLike {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

interface BusyWindow {
  start: Date;
  end: Date;
}

export function computeAvailableSlots(
  hours: BusinessHoursLike[],
  busy: BusyWindow[],
  durationMin: number,
  rangeStart: Date,
  rangeEnd: Date
): AvailableSlot[] {
  const slots: AvailableSlot[] = [];
  const hoursByDay = new Map(hours.map((h) => [h.dayOfWeek, h]));

  const cursor = new Date(rangeStart);
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor < rangeEnd) {
    const dayHours = hoursByDay.get(cursor.getUTCDay());
    if (dayHours && !dayHours.isClosed) {
      const [openH, openM] = dayHours.openTime.split(":").map(Number);
      const [closeH, closeM] = dayHours.closeTime.split(":").map(Number);

      const dayOpen = new Date(cursor);
      dayOpen.setUTCHours(openH, openM, 0, 0);
      const dayClose = new Date(cursor);
      dayClose.setUTCHours(closeH, closeM, 0, 0);

      let slotStart = new Date(dayOpen);
      while (slotStart.getTime() + durationMin * 60000 <= dayClose.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + durationMin * 60000);
        if (slotStart >= rangeStart && slotEnd <= rangeEnd) {
          const overlaps = busy.some((b) => slotStart < b.end && slotEnd > b.start);
          if (!overlaps) {
            slots.push({ start: new Date(slotStart), end: new Date(slotEnd) });
          }
        }
        slotStart = slotEnd;
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return slots;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- availability`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add lib/availability.ts tests/unit/availability.test.ts
git commit -m "feat: add pure slot-availability computation"
```

---

### Task 2: Availability Engine — Prisma Wrapper

**Files:**
- Modify: `lib/availability.ts`
- Create: `tests/integration/availability-db.test.ts`

**Interfaces:**
- Consumes: `computeAvailableSlots` (Task 1), `prisma` (`lib/db.ts`), `getBusinessSettings` (`lib/settings.ts`).
- Produces: `getAvailableSlots(rangeStart: Date, rangeEnd: Date): Promise<AvailableSlot[]>`, consumed by the `getAvailableSlotsAction` server action (Task 6) and, later, the admin calendar.

- [ ] **Step 1: Write the failing test**

`tests/integration/availability-db.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { getAvailableSlots } from "@/lib/availability";

describe("getAvailableSlots", () => {
  beforeEach(async () => {
    await prisma.appointment.deleteMany();
    await prisma.blockedTime.deleteMany();
    await prisma.businessHours.deleteMany();
    await prisma.businessSettings.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.service.deleteMany();

    await prisma.businessSettings.create({
      data: {
        name: "Test Co",
        phone: "555-0100",
        email: "owner@example.com",
        addressStreet: "1 Main St",
        addressCity: "Springfield",
        addressState: "IL",
        addressZip: "62701",
        defaultAppointmentDurationMin: 60,
        serviceAreaZips: [],
      },
    });
    await prisma.businessHours.createMany({
      data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        dayOfWeek,
        openTime: "09:00",
        closeTime: "10:00",
        isClosed: false,
      })),
    });
  });

  afterEach(async () => {
    await prisma.appointment.deleteMany();
    await prisma.blockedTime.deleteMany();
    await prisma.businessHours.deleteMany();
    await prisma.businessSettings.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.service.deleteMany();
  });

  it("returns one open slot per weekday and excludes a booked appointment", async () => {
    const rangeStart = new Date("2026-08-24T00:00:00.000Z"); // Monday
    const rangeEnd = new Date("2026-08-25T00:00:00.000Z"); // Tuesday

    const withoutBooking = await getAvailableSlots(rangeStart, rangeEnd);
    expect(withoutBooking).toHaveLength(1);

    const service = await prisma.service.create({
      data: { name: "Other", slug: "other", description: "d" },
    });
    const customer = await prisma.customer.create({
      data: { name: "Jane", phone: "555", email: "jane@example.com" },
    });
    const lead = await prisma.lead.create({
      data: {
        bookingRef: "CW-2026-0001",
        customerId: customer.id,
        serviceId: service.id,
      },
    });
    await prisma.appointment.create({
      data: {
        leadId: lead.id,
        type: "CONSULTATION",
        start: withoutBooking[0].start,
        end: withoutBooking[0].end,
        status: "SCHEDULED",
      },
    });

    const withBooking = await getAvailableSlots(rangeStart, rangeEnd);
    expect(withBooking).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- availability-db`
Expected: FAIL — `getAvailableSlots` is not exported from `@/lib/availability`.

- [ ] **Step 3: Add the wrapper**

Append to `lib/availability.ts`:

```ts
import { prisma } from "@/lib/db";
import { getBusinessSettings } from "@/lib/settings";

export async function getAvailableSlots(
  rangeStart: Date,
  rangeEnd: Date
): Promise<AvailableSlot[]> {
  const [hours, settings, appointments, blockedTimes] = await Promise.all([
    prisma.businessHours.findMany(),
    getBusinessSettings(),
    prisma.appointment.findMany({
      where: {
        status: { not: "CANCELLED" },
        start: { lt: rangeEnd },
        end: { gt: rangeStart },
      },
    }),
    prisma.blockedTime.findMany({
      where: { start: { lt: rangeEnd }, end: { gt: rangeStart } },
    }),
  ]);

  const busy: BusyWindow[] = [
    ...appointments.map((a) => ({ start: a.start, end: a.end })),
    ...blockedTimes.map((b) => ({ start: b.start, end: b.end })),
  ];

  return computeAvailableSlots(
    hours,
    busy,
    settings.defaultAppointmentDurationMin,
    rangeStart,
    rangeEnd
  );
}
```

(Add the `import { prisma } from "@/lib/db"; import { getBusinessSettings } from "@/lib/settings";` lines at the top of the file alongside any existing imports.)

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- availability-db`
Expected: PASS (1/1).

- [ ] **Step 5: Commit**

```bash
git add lib/availability.ts tests/integration/availability-db.test.ts
git commit -m "feat: add Prisma-backed availability wrapper"
```

---

### Task 3: Service Area Check

**Files:**
- Create: `lib/service-area.ts`, `tests/unit/service-area.test.ts`

**Interfaces:**
- Produces: `isWithinServiceArea(zip: string, serviceAreaZips: string[]): boolean`, consumed by the address step's server action (Task 6) and `submitBookingAction` (Task 7).

- [ ] **Step 1: Write the failing test**

`tests/unit/service-area.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isWithinServiceArea } from "@/lib/service-area";

describe("isWithinServiceArea", () => {
  it("returns true for a ZIP in the list", () => {
    expect(isWithinServiceArea("45501", ["45501", "45502"])).toBe(true);
  });

  it("returns false for a ZIP not in the list", () => {
    expect(isWithinServiceArea("99999", ["45501", "45502"])).toBe(false);
  });

  it("trims whitespace before comparing", () => {
    expect(isWithinServiceArea(" 45501 ", ["45501"])).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- service-area`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement it**

`lib/service-area.ts`:

```ts
export function isWithinServiceArea(zip: string, serviceAreaZips: string[]): boolean {
  return serviceAreaZips.includes(zip.trim());
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- service-area`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add lib/service-area.ts tests/unit/service-area.test.ts
git commit -m "feat: add service area ZIP check"
```

---

### Task 4: Upload API Route

**Files:**
- Create: `app/api/upload/route.ts`, `tests/integration/upload-route.test.ts`

**Interfaces:**
- Consumes: `storage`, `detectImageType` (foundation phase, `lib/storage.ts` / `lib/fileSignature.ts`).
- Produces: `POST /api/upload` accepting `multipart/form-data` with a `file` field, returning `{ url: string }` or `{ error: string }`. Consumed by the photo-upload step (Task 11).

- [ ] **Step 1: Write the failing test**

`tests/integration/upload-route.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/upload/route";
import { storage } from "@/lib/storage";

function requestWithFile(file: File): NextRequest {
  const formData = new FormData();
  formData.set("file", file);
  return new NextRequest("http://localhost/api/upload", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/upload", () => {
  it("accepts a valid PNG and returns a /uploads URL", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const file = new File([bytes], "photo.png", { type: "image/png" });

    const res = await POST(requestWithFile(file));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toMatch(/^\/uploads\/[\w-]+\.png$/);

    await storage.delete(body.url);
  });

  it("rejects content that isn't actually a recognized image format", async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], "fake.png", {
      type: "image/png",
    });

    const res = await POST(requestWithFile(file));
    expect(res.status).toBe(400);
  });

  it("rejects a request with no file", async () => {
    const formData = new FormData();
    const req = new NextRequest("http://localhost/api/upload", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- upload-route`
Expected: FAIL — module `@/app/api/upload/route` not found.

- [ ] **Step 3: Implement the route**

`app/api/upload/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { detectImageType } from "@/lib/fileSignature";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detectedType = detectImageType(buffer);
  if (!detectedType) {
    return NextResponse.json(
      { error: "Unsupported or invalid file type" },
      { status: 400 }
    );
  }

  const url = await storage.save(buffer, file.name);
  return NextResponse.json({ url });
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- upload-route`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add app/api/upload/route.ts tests/integration/upload-route.test.ts
git commit -m "feat: add photo upload API route"
```

---

### Task 5: Booking Validation Schemas

**Files:**
- Create: `lib/booking.ts`, `tests/unit/booking-validation.test.ts`

**Interfaces:**
- Produces: `addressSchema`, `customerInfoSchema`, `submitBookingSchema`, `type SubmitBookingInput` — consumed by the wizard's step components (client-side inline checks) and `submitBookingAction` (Task 7, server-side gate).

- [ ] **Step 1: Write the failing test**

`tests/unit/booking-validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { addressSchema, customerInfoSchema, submitBookingSchema } from "@/lib/booking";

describe("addressSchema", () => {
  it("accepts a valid address", () => {
    const result = addressSchema.safeParse({
      addressStreet: "1 Main St",
      addressCity: "Springfield",
      addressState: "IL",
      addressZip: "62701",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing street", () => {
    const result = addressSchema.safeParse({
      addressStreet: "",
      addressCity: "Springfield",
      addressState: "IL",
      addressZip: "62701",
    });
    expect(result.success).toBe(false);
  });
});

describe("customerInfoSchema", () => {
  it("accepts valid customer info", () => {
    const result = customerInfoSchema.safeParse({
      customerName: "Jane Doe",
      customerPhone: "555-010-0100",
      customerEmail: "jane@example.com",
      preferredContact: "EMAIL",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid preferredContact value", () => {
    const result = customerInfoSchema.safeParse({
      customerName: "Jane Doe",
      customerPhone: "555-010-0100",
      customerEmail: "jane@example.com",
      preferredContact: "CARRIER_PIGEON",
    });
    expect(result.success).toBe(false);
  });
});

describe("submitBookingSchema", () => {
  const valid = {
    serviceId: "service_1",
    answers: { q1: "yes" },
    photoUrls: ["/uploads/a.png"],
    addressStreet: "1 Main St",
    addressCity: "Springfield",
    addressState: "IL",
    addressZip: "62701",
    budgetMin: 1000,
    budgetMax: 5000,
    slotStart: "2026-08-24T13:00:00.000Z",
    slotEnd: "2026-08-24T14:00:00.000Z",
    customerName: "Jane Doe",
    customerPhone: "555-010-0100",
    customerEmail: "jane@example.com",
    preferredContact: "EMAIL",
  };

  it("accepts a fully valid submission", () => {
    expect(submitBookingSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts omitted budget fields", () => {
    const { budgetMin, budgetMax, ...rest } = valid;
    expect(submitBookingSchema.safeParse(rest).success).toBe(true);
  });

  it("rejects more than 10 photos", () => {
    const result = submitBookingSchema.safeParse({
      ...valid,
      photoUrls: Array(11).fill("/uploads/a.png"),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing slot", () => {
    const { slotStart, ...rest } = valid;
    expect(submitBookingSchema.safeParse(rest).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- booking-validation`
Expected: FAIL — module `@/lib/booking` not found.

- [ ] **Step 3: Implement the schemas**

`lib/booking.ts`:

```ts
import { z } from "zod";

export const addressSchema = z.object({
  addressStreet: z.string().min(1),
  addressCity: z.string().min(1),
  addressState: z.string().length(2),
  addressZip: z.string().min(5),
});

export const customerInfoSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().min(7),
  customerEmail: z.string().email(),
  preferredContact: z.enum(["EMAIL", "PHONE", "TEXT"]),
});

export const submitBookingSchema = z.object({
  serviceId: z.string().min(1),
  answers: z.record(z.string(), z.string()),
  photoUrls: z.array(z.string()).max(10),
  addressStreet: z.string().min(1),
  addressCity: z.string().min(1),
  addressState: z.string().length(2),
  addressZip: z.string().min(5),
  budgetMin: z.coerce.number().nonnegative().optional(),
  budgetMax: z.coerce.number().nonnegative().optional(),
  slotStart: z.string().min(1),
  slotEnd: z.string().min(1),
  customerName: z.string().min(1),
  customerPhone: z.string().min(7),
  customerEmail: z.string().email(),
  preferredContact: z.enum(["EMAIL", "PHONE", "TEXT"]),
});

export type SubmitBookingInput = z.infer<typeof submitBookingSchema>;
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- booking-validation`
Expected: PASS (9/9).

- [ ] **Step 5: Commit**

```bash
git add lib/booking.ts tests/unit/booking-validation.test.ts
git commit -m "feat: add booking wizard validation schemas"
```

---

### Task 6: Server Actions — Service Area & Availability Wrappers

**Files:**
- Create: `app/quote/actions.ts`

**Interfaces:**
- Consumes: `isWithinServiceArea` (Task 3), `getAvailableSlots` (Task 2), `getBusinessSettings` (foundation).
- Produces: `checkServiceAreaAction(zip: string): Promise<boolean>`, `getAvailableSlotsAction(): Promise<{ start: string; end: string }[]>` — consumed by the address step (Task 12) and schedule step (Task 14). `submitBookingAction` is added to this same file in Task 7.

- [ ] **Step 1: Implement the two action wrappers**

`app/quote/actions.ts`:

```ts
"use server";

import { getBusinessSettings } from "@/lib/settings";
import { isWithinServiceArea } from "@/lib/service-area";
import { getAvailableSlots } from "@/lib/availability";

export async function checkServiceAreaAction(zip: string): Promise<boolean> {
  const settings = await getBusinessSettings();
  return isWithinServiceArea(zip, settings.serviceAreaZips);
}

export async function getAvailableSlotsAction(): Promise<
  { start: string; end: string }[]
> {
  const rangeStart = new Date();
  const rangeEnd = new Date(rangeStart.getTime() + 14 * 24 * 60 * 60 * 1000);
  const slots = await getAvailableSlots(rangeStart, rangeEnd);
  return slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() }));
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add "app/quote/actions.ts"
git commit -m "feat: add service-area and availability server actions"
```

---

### Task 7: Server Action — Submit Booking

**Files:**
- Modify: `app/quote/actions.ts`
- Create: `tests/integration/submit-booking.test.ts`

**Interfaces:**
- Consumes: `submitBookingSchema`/`SubmitBookingInput` (Task 5), `isWithinServiceArea` (Task 3), `generateBookingRef` (foundation), `queueNotification` (foundation), `prisma` (foundation).
- Produces: `submitBookingAction(input: SubmitBookingInput): Promise<{ error: Record<string, string[]> | null; bookingRef: string | null }>`, consumed by the wizard shell (Task 8) at final submit.

- [ ] **Step 1: Write the failing test**

`tests/integration/submit-booking.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { submitBookingAction } = await import("@/app/quote/actions");

async function seedBaseline() {
  await prisma.appointment.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.customer.deleteMany({ where: { email: "wizard-test@example.com" } });
  await prisma.service.deleteMany({ where: { slug: "wizard-test-service" } });
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
      serviceAreaZips: ["62701"],
    },
  });

  return prisma.service.create({
    data: {
      name: "Wizard Test Service",
      slug: "wizard-test-service",
      description: "d",
    },
  });
}

function validInput(serviceId: string, overrides: Record<string, unknown> = {}) {
  return {
    serviceId,
    answers: { q1: "yes" },
    photoUrls: [],
    addressStreet: "1 Main St",
    addressCity: "Springfield",
    addressState: "IL",
    addressZip: "62701",
    budgetMin: 1000,
    budgetMax: 5000,
    slotStart: "2026-09-01T13:00:00.000Z",
    slotEnd: "2026-09-01T14:00:00.000Z",
    customerName: "Jane Doe",
    customerPhone: "555-010-0100",
    customerEmail: "wizard-test@example.com",
    preferredContact: "EMAIL",
    ...overrides,
  };
}

describe("submitBookingAction", () => {
  beforeEach(async () => {
    await seedBaseline();
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "wizard-test@example.com" } });
    await prisma.service.deleteMany({ where: { slug: "wizard-test-service" } });
    await prisma.businessSettings.deleteMany();
  });

  it("creates Customer, Lead, Project, and Appointment, and returns a booking reference", async () => {
    const service = await prisma.service.findUniqueOrThrow({
      where: { slug: "wizard-test-service" },
    });

    const result = await submitBookingAction(validInput(service.id));

    expect(result.error).toBeNull();
    expect(result.bookingRef).toMatch(/^CW-\d{4}-\d{4}$/);

    const customer = await prisma.customer.findFirst({
      where: { email: "wizard-test@example.com" },
    });
    expect(customer).not.toBeNull();

    const lead = await prisma.lead.findFirst({
      where: { customerId: customer!.id },
      include: { project: true, appointments: true },
    });
    expect(lead?.project?.withinServiceArea).toBe(true);
    expect(lead?.project?.status).toBe("submitted");
    expect(lead?.appointments).toHaveLength(1);

    const notifications = await prisma.notification.findMany({
      where: { relatedEntityId: lead!.id },
    });
    expect(notifications.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects a slot that is already booked", async () => {
    const service = await prisma.service.findUniqueOrThrow({
      where: { slug: "wizard-test-service" },
    });

    const first = await submitBookingAction(
      validInput(service.id, { customerEmail: "wizard-test@example.com" })
    );
    expect(first.error).toBeNull();

    const second = await submitBookingAction(
      validInput(service.id, { customerEmail: "wizard-test-2@example.com" })
    );
    expect(second.error).not.toBeNull();
    expect(second.bookingRef).toBeNull();

    await prisma.customer.deleteMany({ where: { email: "wizard-test-2@example.com" } });
  });

  it("rejects an invalid submission without creating any records", async () => {
    const result = await submitBookingAction(
      validInput("not-a-real-service-id", { customerEmail: "" })
    );
    expect(result.error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- submit-booking`
Expected: FAIL — `submitBookingAction` is not exported from `@/app/quote/actions`.

- [ ] **Step 3: Implement `submitBookingAction`**

Append to `app/quote/actions.ts`:

```ts
import { prisma } from "@/lib/db";
import { generateBookingRef } from "@/lib/booking-ref";
import { queueNotification } from "@/lib/notifications";
import { submitBookingSchema, type SubmitBookingInput } from "@/lib/booking";
import { NotificationType } from "@/lib/generated/prisma/client";

class SlotConflictError extends Error {}

export async function submitBookingAction(input: SubmitBookingInput) {
  const parsed = submitBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors, bookingRef: null };
  }
  const data = parsed.data;
  const slotStart = new Date(data.slotStart);
  const slotEnd = new Date(data.slotEnd);

  const settings = await getBusinessSettings();
  const withinServiceArea = isWithinServiceArea(data.addressZip, settings.serviceAreaZips);

  let bookingRef: string;
  let leadId: string;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const conflicting = await tx.appointment.findFirst({
        where: {
          status: { not: "CANCELLED" },
          start: { lt: slotEnd },
          end: { gt: slotStart },
        },
      });
      if (conflicting) {
        throw new SlotConflictError();
      }

      let customer = await tx.customer.findFirst({
        where: { email: data.customerEmail },
      });
      if (!customer) {
        customer = await tx.customer.create({
          data: {
            name: data.customerName,
            phone: data.customerPhone,
            email: data.customerEmail,
            addressStreet: data.addressStreet,
            addressCity: data.addressCity,
            addressState: data.addressState,
            addressZip: data.addressZip,
          },
        });
      }

      const lead = await tx.lead.create({
        data: {
          bookingRef: await generateBookingRef(),
          customerId: customer.id,
          serviceId: data.serviceId,
          status: "NEW",
          source: "website",
          budgetMin: data.budgetMin,
          budgetMax: data.budgetMax,
        },
      });

      await tx.project.create({
        data: {
          leadId: lead.id,
          answers: data.answers,
          addressStreet: data.addressStreet,
          addressCity: data.addressCity,
          addressState: data.addressState,
          addressZip: data.addressZip,
          withinServiceArea,
          budgetMin: data.budgetMin,
          budgetMax: data.budgetMax,
          status: "submitted",
          photos: { create: data.photoUrls.map((url) => ({ url })) },
        },
      });

      await tx.appointment.create({
        data: {
          leadId: lead.id,
          type: "CONSULTATION",
          start: slotStart,
          end: slotEnd,
          status: "SCHEDULED",
        },
      });

      return { bookingRef: lead.bookingRef, leadId: lead.id };
    });
    bookingRef = result.bookingRef;
    leadId = result.leadId;
  } catch (err) {
    if (err instanceof SlotConflictError) {
      return {
        error: { slotStart: ["This time slot was just booked. Please choose another."] },
        bookingRef: null,
      };
    }
    throw err;
  }

  await queueNotification({
    type: NotificationType.NEW_BOOKING,
    recipientEmail: settings.email,
    subject: `New booking request from ${data.customerName}`,
    body: `${data.customerName} requested a quote. Reference: ${bookingRef}`,
    relatedEntityType: "Lead",
    relatedEntityId: leadId,
  });
  await queueNotification({
    type: NotificationType.BOOKING_CONFIRMATION,
    recipientEmail: data.customerEmail,
    subject: `Your request has been received — ${bookingRef}`,
    body: `Thanks for reaching out! Your booking reference is ${bookingRef}. We'll be in touch to confirm your consultation.`,
    relatedEntityType: "Lead",
    relatedEntityId: leadId,
  });

  return { error: null, bookingRef };
}
```

(Add the four new imports to the top of `app/quote/actions.ts` alongside the existing ones from Task 6.)

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- submit-booking`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add "app/quote/actions.ts" tests/integration/submit-booking.test.ts
git commit -m "feat: add transactional submit-booking server action"
```

---

### Task 8: Wizard Shell, State, and Step Indicator

**Files:**
- Create: `components/booking/booking-wizard.tsx`, `components/booking/step-indicator.tsx`, `components/booking/types.ts`

**Interfaces:**
- Produces: `WizardData` type and the `BookingWizard` component shell (renders `StepIndicator` + the active step, holds state, exposes `data`/`updateData`/`goNext`/`goBack` to step components via props). Step components (Tasks 9–15) plug into this shell one at a time.

- [ ] **Step 1: Define the shared wizard data shape**

`components/booking/types.ts`:

```ts
export interface ServiceQuestionOption {
  id: string;
  label: string;
  fieldType: "TEXT" | "NUMBER" | "SELECT" | "BOOLEAN" | "TEXTAREA";
  options: string[] | null;
  required: boolean;
}

export interface ServiceOption {
  id: string;
  name: string;
  slug: string;
  description: string;
  questions: ServiceQuestionOption[];
}

export interface WizardData {
  serviceId: string;
  serviceSlug: string;
  answers: Record<string, string>;
  photoUrls: string[];
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
  withinServiceArea: boolean | null;
  budgetMin: string;
  budgetMax: string;
  slotStart: string;
  slotEnd: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  preferredContact: "EMAIL" | "PHONE" | "TEXT";
}

export const INITIAL_WIZARD_DATA: WizardData = {
  serviceId: "",
  serviceSlug: "",
  answers: {},
  photoUrls: [],
  addressStreet: "",
  addressCity: "",
  addressState: "",
  addressZip: "",
  withinServiceArea: null,
  budgetMin: "",
  budgetMax: "",
  slotStart: "",
  slotEnd: "",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  preferredContact: "EMAIL",
};
```

- [ ] **Step 2: Build the step indicator**

`components/booking/step-indicator.tsx`:

```tsx
const STEP_LABELS = [
  "Service",
  "Details",
  "Photos",
  "Address",
  "Budget",
  "Schedule",
  "Your Info",
  "Confirm",
];

export function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <ol className="mb-8 flex flex-wrap gap-2 text-xs">
      {STEP_LABELS.map((label, index) => {
        const stepNumber = index + 1;
        const isActive = stepNumber === currentStep;
        const isComplete = stepNumber < currentStep;
        return (
          <li
            key={label}
            className={`rounded-full border px-3 py-1 ${
              isActive
                ? "border-accent bg-accent text-accent-foreground"
                : isComplete
                  ? "border-accent/50 text-accent"
                  : "border-border text-muted-foreground"
            }`}
          >
            {stepNumber}. {label}
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 3: Build the wizard shell**

`components/booking/booking-wizard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { StepIndicator } from "@/components/booking/step-indicator";
import { StepSelectService } from "@/components/booking/step-select-service";
import type { ServiceOption, WizardData } from "@/components/booking/types";
import { INITIAL_WIZARD_DATA } from "@/components/booking/types";

export function BookingWizard({ services }: { services: ServiceOption[] }) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(INITIAL_WIZARD_DATA);

  function updateData(patch: Partial<WizardData>) {
    setData((prev) => ({ ...prev, ...patch }));
  }

  function goNext() {
    setStep((s) => Math.min(s + 1, 8));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 1));
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <StepIndicator currentStep={step} />
      {step === 1 && (
        <StepSelectService
          services={services}
          data={data}
          updateData={updateData}
          goNext={goNext}
        />
      )}
    </div>
  );
}
```

(Steps 2–8 are wired into this same `if` chain in Tasks 9–15 as each is built — this task only establishes Step 1 to prove the shell works end to end before the rest are added.)

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: fails only on the not-yet-created `StepSelectService` import — that's expected; Task 9 creates it. If your toolchain requires a clean compile before committing, stop here and proceed directly to Task 9 without a separate commit for this task, committing Tasks 8+9 together instead.

- [ ] **Step 5: Commit** (only after Task 9's `StepSelectService` exists — see Step 4 note)

```bash
git add components/booking/types.ts components/booking/step-indicator.tsx components/booking/booking-wizard.tsx
git commit -m "feat: add booking wizard shell and step indicator"
```

---

### Task 9: Step 1 — Select Service

**Files:**
- Create: `components/booking/step-select-service.tsx`

**Interfaces:**
- Consumes: `ServiceOption`, `WizardData` (Task 8).
- Produces: `StepSelectService` component, referenced by `BookingWizard` (Task 8).

- [ ] **Step 1: Build the component**

`components/booking/step-select-service.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import type { ServiceOption, WizardData } from "@/components/booking/types";

export function StepSelectService({
  services,
  data,
  updateData,
  goNext,
}: {
  services: ServiceOption[];
  data: WizardData;
  updateData: (patch: Partial<WizardData>) => void;
  goNext: () => void;
}) {
  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">What do you need done?</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {services.map((service) => (
          <button
            key={service.id}
            type="button"
            onClick={() => updateData({ serviceId: service.id, serviceSlug: service.slug })}
            className={`rounded-lg border p-4 text-left text-sm transition-colors ${
              data.serviceId === service.id
                ? "border-accent bg-accent/10"
                : "hover:border-accent"
            }`}
          >
            <span className="font-semibold">{service.name}</span>
            <p className="mt-1 text-muted-foreground">{service.description}</p>
          </button>
        ))}
      </div>
      <div className="mt-8">
        <Button disabled={!data.serviceId} onClick={goNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the shell compiles now**

Run: `npx tsc --noEmit`
Expected: no type errors (this satisfies Task 8's deferred verification).

- [ ] **Step 3: Commit Tasks 8 and 9 together**

```bash
git add components/booking
git commit -m "feat: add booking wizard shell, step indicator, and service selection step"
```

---

### Task 10: Step 2 — Project Details

**Files:**
- Create: `components/booking/step-project-details.tsx`
- Modify: `components/booking/booking-wizard.tsx`

**Interfaces:**
- Consumes: `ServiceOption.questions`, `WizardData.answers`.

- [ ] **Step 1: Build the component**

`components/booking/step-project-details.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ServiceOption, WizardData } from "@/components/booking/types";

export function StepProjectDetails({
  service,
  data,
  updateData,
  goNext,
  goBack,
}: {
  service: ServiceOption;
  data: WizardData;
  updateData: (patch: Partial<WizardData>) => void;
  goNext: () => void;
  goBack: () => void;
}) {
  function setAnswer(questionId: string, value: string) {
    updateData({ answers: { ...data.answers, [questionId]: value } });
  }

  const missingRequired = service.questions.some(
    (q) => q.required && !data.answers[q.id]
  );

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">Tell us about the project</h1>
      <div className="mt-6 space-y-5">
        {service.questions.map((question) => (
          <div key={question.id} className="space-y-2">
            <Label htmlFor={question.id}>
              {question.label}
              {question.required && " *"}
            </Label>
            {question.fieldType === "TEXTAREA" ? (
              <Textarea
                id={question.id}
                value={data.answers[question.id] ?? ""}
                onChange={(e) => setAnswer(question.id, e.target.value)}
              />
            ) : question.fieldType === "SELECT" ? (
              <select
                id={question.id}
                value={data.answers[question.id] ?? ""}
                onChange={(e) => setAnswer(question.id, e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select...</option>
                {(question.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : question.fieldType === "BOOLEAN" ? (
              <select
                id={question.id}
                value={data.answers[question.id] ?? ""}
                onChange={(e) => setAnswer(question.id, e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select...</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            ) : (
              <Input
                id={question.id}
                type={question.fieldType === "NUMBER" ? "number" : "text"}
                value={data.answers[question.id] ?? ""}
                onChange={(e) => setAnswer(question.id, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-8 flex gap-3">
        <Button variant="outline" onClick={goBack}>
          Back
        </Button>
        <Button disabled={missingRequired} onClick={goNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the wizard shell**

In `components/booking/booking-wizard.tsx`, add the import and a new branch:

```tsx
import { StepProjectDetails } from "@/components/booking/step-project-details";
```

```tsx
      {step === 2 && (
        <StepProjectDetails
          service={services.find((s) => s.id === data.serviceId)!}
          data={data}
          updateData={updateData}
          goNext={goNext}
          goBack={goBack}
        />
      )}
```

(Insert this branch immediately after the `step === 1` block.)

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add components/booking
git commit -m "feat: add project details step with dynamic per-service questions"
```

---

### Task 11: Step 3 — Project Photos

**Files:**
- Create: `components/booking/step-photos.tsx`
- Modify: `components/booking/booking-wizard.tsx`

**Interfaces:**
- Consumes: `POST /api/upload` (Task 4).

- [ ] **Step 1: Build the component**

`components/booking/step-photos.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { WizardData } from "@/components/booking/types";

const MAX_PHOTOS = 10;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export function StepPhotos({
  data,
  updateData,
  goNext,
  goBack,
}: {
  data: WizardData;
  updateData: (patch: Partial<WizardData>) => void;
  goNext: () => void;
  goBack: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    setError(null);

    const remaining = MAX_PHOTOS - data.photoUrls.length;
    const toUpload = Array.from(files).slice(0, remaining);

    for (const file of toUpload) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`${file.name} is not a supported image type.`);
        continue;
      }
      if (file.size > MAX_SIZE_BYTES) {
        setError(`${file.name} is larger than 10MB.`);
        continue;
      }

      setUploading(true);
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const body = await res.json();
      setUploading(false);

      if (!res.ok) {
        setError(body.error ?? "Upload failed.");
        continue;
      }
      updateData({ photoUrls: [...data.photoUrls, body.url] });
    }
  }

  function removePhoto(url: string) {
    updateData({ photoUrls: data.photoUrls.filter((u) => u !== url) });
  }

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">Add project photos</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Optional, but photos help us prepare a more accurate estimate.
      </p>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        disabled={data.photoUrls.length >= MAX_PHOTOS}
        onChange={(e) => handleFiles(e.target.files)}
        className="mt-6 text-sm"
      />
      {uploading && <p className="mt-2 text-sm text-muted-foreground">Uploading...</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
        {data.photoUrls.map((url) => (
          <div key={url} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Project" className="h-24 w-full rounded-md object-cover" />
            <button
              type="button"
              onClick={() => removePhoto(url)}
              className="absolute right-1 top-1 rounded-full bg-background/90 px-2 text-xs"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
      <div className="mt-8 flex gap-3">
        <Button variant="outline" onClick={goBack}>
          Back
        </Button>
        <Button onClick={goNext}>Continue</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the wizard shell**

In `components/booking/booking-wizard.tsx`:

```tsx
import { StepPhotos } from "@/components/booking/step-photos";
```

```tsx
      {step === 3 && (
        <StepPhotos data={data} updateData={updateData} goNext={goNext} goBack={goBack} />
      )}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add components/booking
git commit -m "feat: add project photos upload step"
```

---

### Task 12: Step 4 — Project Address

**Files:**
- Create: `components/booking/step-address.tsx`
- Modify: `components/booking/booking-wizard.tsx`

**Interfaces:**
- Consumes: `checkServiceAreaAction` (Task 6), `addressSchema` (Task 5).

- [ ] **Step 1: Build the component**

`components/booking/step-address.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkServiceAreaAction } from "@/app/quote/actions";
import { addressSchema } from "@/lib/booking";
import type { WizardData } from "@/components/booking/types";

export function StepAddress({
  data,
  updateData,
  goNext,
  goBack,
}: {
  data: WizardData;
  updateData: (patch: Partial<WizardData>) => void;
  goNext: () => void;
  goBack: () => void;
}) {
  const [checking, setChecking] = useState(false);

  const isValid = addressSchema.safeParse(data).success;

  async function handleContinue() {
    setChecking(true);
    const within = await checkServiceAreaAction(data.addressZip);
    updateData({ withinServiceArea: within });
    setChecking(false);
    goNext();
  }

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">Where is the project?</h1>
      <div className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="addressStreet">Street</Label>
          <Input
            id="addressStreet"
            value={data.addressStreet}
            onChange={(e) => updateData({ addressStreet: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1 space-y-2">
            <Label htmlFor="addressCity">City</Label>
            <Input
              id="addressCity"
              value={data.addressCity}
              onChange={(e) => updateData({ addressCity: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="addressState">State</Label>
            <Input
              id="addressState"
              maxLength={2}
              value={data.addressState}
              onChange={(e) => updateData({ addressState: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="addressZip">ZIP</Label>
            <Input
              id="addressZip"
              value={data.addressZip}
              onChange={(e) => updateData({ addressZip: e.target.value })}
            />
          </div>
        </div>
      </div>
      <div className="mt-8 flex gap-3">
        <Button variant="outline" onClick={goBack}>
          Back
        </Button>
        <Button disabled={!isValid || checking} onClick={handleContinue}>
          {checking ? "Checking..." : "Continue"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the wizard shell**

In `components/booking/booking-wizard.tsx`:

```tsx
import { StepAddress } from "@/components/booking/step-address";
```

```tsx
      {step === 4 && (
        <StepAddress data={data} updateData={updateData} goNext={goNext} goBack={goBack} />
      )}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add components/booking
git commit -m "feat: add project address step with service-area check"
```

---

### Task 13: Step 5 — Budget

**Files:**
- Create: `components/booking/step-budget.tsx`
- Modify: `components/booking/booking-wizard.tsx`

- [ ] **Step 1: Build the component**

`components/booking/step-budget.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WizardData } from "@/components/booking/types";

export function StepBudget({
  data,
  updateData,
  goNext,
  goBack,
}: {
  data: WizardData;
  updateData: (patch: Partial<WizardData>) => void;
  goNext: () => void;
  goBack: () => void;
}) {
  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">What&apos;s your estimated budget?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This helps us tailor recommendations. It&apos;s okay to estimate.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="budgetMin">Minimum ($)</Label>
          <Input
            id="budgetMin"
            type="number"
            value={data.budgetMin}
            onChange={(e) => updateData({ budgetMin: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="budgetMax">Maximum ($)</Label>
          <Input
            id="budgetMax"
            type="number"
            value={data.budgetMax}
            onChange={(e) => updateData({ budgetMax: e.target.value })}
          />
        </div>
      </div>
      <div className="mt-8 flex gap-3">
        <Button variant="outline" onClick={goBack}>
          Back
        </Button>
        <Button onClick={goNext}>Continue</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the wizard shell**

In `components/booking/booking-wizard.tsx`:

```tsx
import { StepBudget } from "@/components/booking/step-budget";
```

```tsx
      {step === 5 && (
        <StepBudget data={data} updateData={updateData} goNext={goNext} goBack={goBack} />
      )}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add components/booking
git commit -m "feat: add budget step"
```

---

### Task 14: Step 6 — Preferred Schedule

**Files:**
- Create: `components/booking/step-schedule.tsx`
- Modify: `components/booking/booking-wizard.tsx`

**Interfaces:**
- Consumes: `getAvailableSlotsAction` (Task 6).

- [ ] **Step 1: Build the component**

`components/booking/step-schedule.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getAvailableSlotsAction } from "@/app/quote/actions";
import type { WizardData } from "@/components/booking/types";

interface Slot {
  start: string;
  end: string;
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function StepSchedule({
  data,
  updateData,
  goNext,
  goBack,
}: {
  data: WizardData;
  updateData: (patch: Partial<WizardData>) => void;
  goNext: () => void;
  goBack: () => void;
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAvailableSlotsAction()
      .then(setSlots)
      .finally(() => setLoading(false));
  }, []);

  const slotsByDay = slots.reduce<Record<string, Slot[]>>((acc, slot) => {
    const day = formatDay(slot.start);
    acc[day] = acc[day] ?? [];
    acc[day].push(slot);
    return acc;
  }, {});

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">Choose a consultation time</h1>
      {loading && <p className="mt-6 text-sm text-muted-foreground">Loading availability...</p>}
      {!loading && slots.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          No upcoming availability found. Please continue and we&apos;ll follow up to schedule.
        </p>
      )}
      <div className="mt-6 space-y-6">
        {Object.entries(slotsByDay).map(([day, daySlots]) => (
          <div key={day}>
            <p className="text-sm font-semibold">{day}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {daySlots.map((slot) => (
                <button
                  key={slot.start}
                  type="button"
                  onClick={() => updateData({ slotStart: slot.start, slotEnd: slot.end })}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    data.slotStart === slot.start
                      ? "border-accent bg-accent/10"
                      : "hover:border-accent"
                  }`}
                >
                  {formatTime(slot.start)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 flex gap-3">
        <Button variant="outline" onClick={goBack}>
          Back
        </Button>
        <Button disabled={slots.length > 0 && !data.slotStart} onClick={goNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the wizard shell**

In `components/booking/booking-wizard.tsx`:

```tsx
import { StepSchedule } from "@/components/booking/step-schedule";
```

```tsx
      {step === 6 && (
        <StepSchedule data={data} updateData={updateData} goNext={goNext} goBack={goBack} />
      )}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add components/booking
git commit -m "feat: add schedule step backed by the availability engine"
```

---

### Task 15: Steps 7–8 — Customer Info, Confirmation, and Wiring the Real `/quote` Page

**Files:**
- Create: `components/booking/step-customer-info.tsx`, `components/booking/step-confirmation.tsx`
- Modify: `components/booking/booking-wizard.tsx`, `app/quote/page.tsx`

**Interfaces:**
- Consumes: `customerInfoSchema` (Task 5), `submitBookingAction` (Task 7).

- [ ] **Step 1: Build the customer info step**

`components/booking/step-customer-info.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { customerInfoSchema } from "@/lib/booking";
import { submitBookingAction } from "@/app/quote/actions";
import type { WizardData } from "@/components/booking/types";

export function StepCustomerInfo({
  data,
  updateData,
  goBack,
  onSubmitted,
}: {
  data: WizardData;
  updateData: (patch: Partial<WizardData>) => void;
  goBack: () => void;
  onSubmitted: (bookingRef: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isValid = customerInfoSchema.safeParse(data).success;

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await submitBookingAction({
        serviceId: data.serviceId,
        answers: data.answers,
        photoUrls: data.photoUrls,
        addressStreet: data.addressStreet,
        addressCity: data.addressCity,
        addressState: data.addressState,
        addressZip: data.addressZip,
        budgetMin: data.budgetMin ? Number(data.budgetMin) : undefined,
        budgetMax: data.budgetMax ? Number(data.budgetMax) : undefined,
        slotStart: data.slotStart,
        slotEnd: data.slotEnd,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail,
        preferredContact: data.preferredContact,
      });

      if (result.error || !result.bookingRef) {
        setError("Something went wrong. Please check your information and try again.");
        return;
      }
      onSubmitted(result.bookingRef);
    });
  }

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">Your contact information</h1>
      <div className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="customerName">Full name</Label>
          <Input
            id="customerName"
            value={data.customerName}
            onChange={(e) => updateData({ customerName: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customerPhone">Phone</Label>
          <Input
            id="customerPhone"
            type="tel"
            value={data.customerPhone}
            onChange={(e) => updateData({ customerPhone: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customerEmail">Email</Label>
          <Input
            id="customerEmail"
            type="email"
            value={data.customerEmail}
            onChange={(e) => updateData({ customerEmail: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="preferredContact">Preferred contact method</Label>
          <select
            id="preferredContact"
            value={data.preferredContact}
            onChange={(e) =>
              updateData({ preferredContact: e.target.value as WizardData["preferredContact"] })
            }
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="EMAIL">Email</option>
            <option value="PHONE">Phone</option>
            <option value="TEXT">Text</option>
          </select>
        </div>
      </div>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <div className="mt-8 flex gap-3">
        <Button variant="outline" onClick={goBack} disabled={isPending}>
          Back
        </Button>
        <Button disabled={!isValid || isPending} onClick={handleSubmit}>
          {isPending ? "Submitting..." : "Submit Request"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build the confirmation step**

`components/booking/step-confirmation.tsx`:

```tsx
import type { ServiceOption, WizardData } from "@/components/booking/types";

export function StepConfirmation({
  service,
  data,
  bookingRef,
}: {
  service: ServiceOption | undefined;
  data: WizardData;
  bookingRef: string;
}) {
  return (
    <div className="text-center">
      <h1 className="font-serif text-2xl font-semibold">Thanks, {data.customerName}!</h1>
      <p className="mt-3 text-muted-foreground">
        We&apos;ve received your request and will be in touch to confirm your consultation.
      </p>
      <div className="mt-8 space-y-2 rounded-lg border p-6 text-left text-sm">
        <p>
          <span className="font-semibold">Booking reference:</span> {bookingRef}
        </p>
        <p>
          <span className="font-semibold">Project type:</span> {service?.name}
        </p>
        <p>
          <span className="font-semibold">Address:</span> {data.addressStreet}, {data.addressCity},{" "}
          {data.addressState} {data.addressZip}
        </p>
        {data.slotStart && (
          <p>
            <span className="font-semibold">Consultation:</span>{" "}
            {new Date(data.slotStart).toLocaleString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire both into the wizard shell, adding a submitted-state**

In `components/booking/booking-wizard.tsx`, add the imports:

```tsx
import { StepCustomerInfo } from "@/components/booking/step-customer-info";
import { StepConfirmation } from "@/components/booking/step-confirmation";
```

Add a `bookingRef` state slot and the two new branches:

```tsx
  const [bookingRef, setBookingRef] = useState<string | null>(null);
```

```tsx
      {step === 7 && !bookingRef && (
        <StepCustomerInfo
          data={data}
          updateData={updateData}
          goBack={goBack}
          onSubmitted={(ref) => {
            setBookingRef(ref);
            setStep(8);
          }}
        />
      )}
      {step === 8 && bookingRef && (
        <StepConfirmation
          service={services.find((s) => s.id === data.serviceId)}
          data={data}
          bookingRef={bookingRef}
        />
      )}
```

- [ ] **Step 4: Replace the `/quote` stub with the real wizard page**

`app/quote/page.tsx`:

```tsx
import { prisma } from "@/lib/db";
import { BookingWizard } from "@/components/booking/booking-wizard";
import type { ServiceOption } from "@/components/booking/types";

export default async function QuotePage() {
  const rawServices = await prisma.service.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    include: { questions: { orderBy: { sortOrder: "asc" } } },
  });

  // Explicit mapping (not passing Prisma's result straight through): the
  // generated ServiceQuestion.options field is typed as Json | null, not
  // string[] | null, so it needs a narrowing cast here at the boundary.
  const services: ServiceOption[] = rawServices.map((service) => ({
    id: service.id,
    name: service.name,
    slug: service.slug,
    description: service.description,
    questions: service.questions.map((q) => ({
      id: q.id,
      label: q.label,
      fieldType: q.fieldType,
      options: (q.options as string[] | null) ?? null,
      required: q.required,
    })),
  }));

  return <BookingWizard services={services} />;
}
```

(This replaces the entire previous stub content.)

- [ ] **Step 5: Verify it compiles and builds**

Run: `npx tsc --noEmit` then `npm run build`
Expected: no type errors, no build failures. `/quote` should now be listed as a dynamic or static route rendering the wizard rather than the stub.

- [ ] **Step 6: Commit**

```bash
git add components/booking "app/quote/page.tsx"
git commit -m "feat: add customer info and confirmation steps; wire up the real /quote wizard"
```

---

### Task 16: Full Verification Pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass, including the new availability, service-area, upload-route, booking-validation, and submit-booking tests.

- [ ] **Step 2: Run a full production build**

Run: `npm run build`
Expected: no type errors, no build failures.

- [ ] **Step 3: End-to-end manual walkthrough**

Run `npm run dev` and, in a browser, complete the full wizard at `/quote`:
1. Select a service with distinct questions (e.g. Deck Construction) — confirm Step 2 renders that service's specific questions, not a generic set.
2. Upload a photo — confirm preview, and confirm removing it works.
3. Enter an address inside the seeded service area (e.g. ZIP `45501`) — confirm no blocking; try one outside it and confirm it still allows proceeding (informational only).
4. Enter a budget range.
5. Select an available consultation slot.
6. Enter contact info and submit — confirm the confirmation screen shows the booking reference, service name, address, and slot.
7. Verify via `npx prisma studio` (or a throwaway script) that `Customer`, `Lead`, `Project` (with `answers` JSON and `photos`), and `Appointment` rows were created, and two `Notification` rows (`NEW_BOOKING` and `BOOKING_CONFIRMATION`) were queued.
8. Repeat the flow choosing the **same** consultation slot in a second pass — confirm it no longer appears in Step 6's available slots (double-booking prevented).
9. Confirm the marketing site's "Request a Quote"/"Book a Consultation" CTAs (header, footer, Home, Services detail) now land on the real wizard, not the old stub.
10. Confirm `/admin/*` and its login flow still work unaffected.

- [ ] **Step 4: Tag the milestone**

```bash
git add -A
git commit -m "chore: complete booking wizard phase" --allow-empty
git tag phase-3-booking-wizard
```
