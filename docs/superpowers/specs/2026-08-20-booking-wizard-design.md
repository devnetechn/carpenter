# Booking Wizard — Design

Status: Approved (self-approved per explicit instruction to proceed without
stopping for confirmation this session — flagged for review on request)
Date: 2026-08-20

## 1. Purpose & Scope

Cycle 2 of "Customer Booking": the real `/quote` implementation, replacing
the stub page from the marketing-site cycle. An 8-step multi-step intake
wizard matching the foundation spec's Section 5 exactly:

```
1. Select Service
2. Project Details (dynamic, per-service)
3. Project Photos
4. Project Address (service-area check)
5. Budget
6. Preferred Schedule (availability engine)
7. Customer Information
8. Confirmation (booking reference)
```

Builds on the foundation phase (schema, storage interface, booking-ref
generator, notification queue) and the marketing-site phase (design tokens,
Fraunces font, shadcn components, `Service`/`ServiceQuestion` data).

## 2. Architecture

Single route, `app/quote/page.tsx` (replaces the stub), rendering a
client-side stepper component (`components/booking/booking-wizard.tsx`)
that holds all step state in React state (not URL query params — keeps
back/forward navigation simple within the wizard, matches "one route,
client-driven step state" from the foundation spec).

**Draft-project-first persistence** (per foundation spec Section 5,
confirmed in the original foundation brainstorming): Step 1 (service
selection) immediately creates a draft `Lead` + `Project` server-side via a
server action, returning a `leadId`. Every subsequent step updates that
same `Project`/`Lead` via further server actions keyed by `leadId`, so an
abandoned wizard still leaves a recoverable partial lead. Final submit
(Step 8) flips `Project.status` from `"draft"` to `"submitted"` and moves
`Lead.status` to `NEW`.

**Business logic in `lib/`:**
- `lib/availability.ts` — the slot-availability engine (expand
  `BusinessHours` into slots, subtract `Appointment` overlaps and
  `BlockedTime`), used by both Step 6 of the wizard and (in a future admin
  Calendar phase) admin-side appointment creation. One conflict-prevention
  code path, per the foundation spec.
- `lib/service-area.ts` — ZIP-based service-area check against
  `BusinessSettings.serviceAreaZips`.
- `lib/booking.ts` — the wizard's server actions: `startDraftProject`,
  `updateProjectDetails`, `addProjectPhoto`, `removeProjectPhoto`,
  `updateProjectAddress`, `updateProjectBudget`, `scheduleConsultation`,
  `submitBooking`.

**File uploads**: Step 3 wires up the `api/upload` route (not built in the
foundation phase — only the `Storage` interface was) using the existing
`storage`/`detectImageType` from `lib/storage.ts` and `lib/fileSignature.ts`.

## 3. Step-by-Step Behavior

**Step 1 — Select Service**: grid of active `Service` rows (reusing the
same data the Services marketing page already queries). Selecting one
calls `startDraftProject(serviceId)`, creating `Customer` (placeholder,
filled in at Step 7) — actually deferred: see note below — a `Lead`
(`status: NEW`, `bookingRef` via `generateBookingRef()`) and a `Project`
(`status: "draft"`), returns `{ leadId, projectId }` held in wizard state
for the rest of the flow.

*Note on Customer timing*: creating a `Customer` before Step 7 (Customer
Information) is impossible — `Lead.customerId` is required and non-null in
the schema. Two options: (a) relax `Lead.customerId` to optional, or (b)
defer `Lead`/`Project` creation until Step 7 and hold Steps 1–6 answers in
client-side wizard state only, persisting everything at once when the
customer submits contact info. Option (b) preserves the schema as-is (no
migration) and still satisfies the spirit of "abandoned flow recoverable"
for the steps that matter most (a customer who filled in project details
and contact info but didn't hit final submit is the recoverable case worth
capturing — someone who bounced after selecting a service with no contact
info isn't actionable as a lead anyway). **Decision: option (b)** — Lead/
Project/Customer are all created together once Step 7 (contact info) is
reached, not at Step 1. Steps 1–6 hold answers in client wizard state.
This is a deliberate simplification from the foundation spec's literal
wording, made to avoid a schema change; flagging for review.

**Step 2 — Project Details**: fetches `ServiceQuestion` rows for the
selected service, renders fields by `fieldType` (TEXT/NUMBER/SELECT/
BOOLEAN/TEXTAREA). Answers held in wizard state as
`Record<questionId, string | number | boolean>`, written to
`Project.answers` (JSON) at submit time.

**Step 3 — Project Photos**: client-side preview, validates type
(jpeg/png/webp, matching the foundation's `detectImageType` support) and
size (10MB cap) before upload; uploads immediately to `api/upload` (not
deferred to final submit — matches foundation spec's rationale that large
uploads shouldn't ride along with the final submit payload), holds
returned URLs in wizard state, attached to `Project.photos` at submit time.
Max 10 photos.

**Step 4 — Project Address**: street/city/state/ZIP; ZIP checked client-side
against a server action wrapping `lib/service-area.ts`, shows inline
within/outside service-area messaging, never blocks progression.

**Step 5 — Budget**: min/max range (two number inputs or a preset-range
select — using free-form min/max number inputs for flexibility).

**Step 6 — Preferred Schedule**: calls a server action wrapping
`lib/availability.ts` for the next 14 days, renders available slots
grouped by day; selecting one holds `{ start, end }` in wizard state.

**Step 7 — Customer Information**: name, phone, email, preferred contact
method (SELECT: email/phone/text). On "Next," this is where the actual
persistence happens (per the Step 1 note): creates `Customer` (or reuses
one matching the submitted email, same pattern as the contact form),
`Lead`, `Project` (with all Step 2–5 answers attached), `ProjectPhoto` rows,
and an `Appointment` (type `CONSULTATION`) for the Step 6 slot — all in one
transaction.

**Step 8 — Confirmation**: displays customer name, project type, address,
appointment date/time, and the generated `bookingRef`. Queues a
`BOOKING_CONFIRMATION` notification.

## 4. Availability Engine

`lib/availability.ts`:

```ts
export interface AvailableSlot {
  start: Date;
  end: Date;
}

export async function getAvailableSlots(
  rangeStart: Date,
  rangeEnd: Date
): Promise<AvailableSlot[]>
```

Algorithm: for each day in range, look up `BusinessHours` for that
weekday; if closed, skip; otherwise expand open→close into
`BusinessSettings.defaultAppointmentDurationMin`-sized slots; drop any
slot overlapping a non-cancelled `Appointment` or a `BlockedTime` window.
This is the one function both the wizard and (later) the admin calendar
will call — no duplicated conflict logic.

## 5. Out of Scope (explicitly)

- Admin-side lead/appointment management UI — a later phase.
- Quote/estimate generation — a later phase.
- Any change to `Lead.customerId` nullability (see Step 1 note) — the
  chosen design avoids needing this.
- Editing/resuming a previously abandoned wizard session — not needed since
  persistence now happens at Step 7, not Step 1.

## 6. Testing Approach

- Unit tests: `lib/availability.ts` slot generation (business hours
  expansion, blocked-time subtraction, appointment-overlap subtraction),
  `lib/service-area.ts` ZIP matching, the wizard's Zod schemas per step.
- Integration tests: the final-submit server action (creates Customer/
  Lead/Project/ProjectPhoto/Appointment/Notification correctly), the
  `api/upload` route (valid image accepted, oversized/wrong-type rejected).
- Manual browser walkthrough of the full 8-step flow end to end, including
  a photo upload and a real slot booking, confirming no double-booking by
  attempting to select an already-booked slot in a second pass.
