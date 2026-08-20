# Admin Calendar — Design

Status: Approved (self-approved per explicit instruction to proceed without
stopping for confirmation this session — flagged for review on request)
Date: 2026-08-20

## 1. Purpose & Scope

`/admin/calendar` is still the foundation phase's placeholder. This cycle
builds a real calendar over the `Appointment` and `BlockedTime` tables that
already exist and are already populated by the booking wizard:

- Week view (default) and Day view, both server-rendered, with prev/next
  navigation via query params (`?view=week&date=2026-08-24`). Month view is
  explicitly deferred — week/day cover the actual "don't get double-booked"
  workflow a solo/small-crew contractor needs day-to-day; month is a nice-
  to-have visual overview, not a decision-making surface, and adding it now
  would triple the layout work in this cycle for no functional gain.
- Create an appointment (any type: CONSULTATION/FOLLOW_UP/JOB_VISIT),
  attached to an existing Lead, choosing a lead-search + available slot.
- Reschedule (change start/end) and Cancel (status → CANCELLED) an
  existing appointment.
- Block time (create/delete `BlockedTime` windows), rendered visually
  distinct from appointments on the grid.
- All create/reschedule paths route through `lib/availability.ts` — the
  same conflict-prevention logic the wizard already uses, per the
  foundation spec's "one conflict-prevention code path" requirement.

## 2. Architecture

`/admin/calendar` is a Server Component reading `Appointment` (with
`lead.customer`, `lead.service` included for display) and `BlockedTime`
for the visible date range. View/navigation state lives entirely in the
URL (`view`, `date` query params) — no client state needed for the grid
itself, consistent with the Leads list's status-filter pattern.

The grid rendering (laying out events into an hour-by-day layout) is a
pure function — `lib/calendar-grid.ts` — taking appointments/blocks and
producing positioned entries, unit-testable independent of any UI.

Mutations are client-triggered forms calling Server Actions in
`app/admin/(protected)/calendar/actions.ts` (create/reschedule/cancel
appointment), following the established `"use server"` +
shared-schema-file pattern. Blocked time is **not** a new action set —
the Calendar page's "Block Time" control calls the `addBlockedTime`/
`removeBlockedTime` actions already built in the foundation phase's
`app/admin/(protected)/settings/actions.ts`, imported directly rather
than duplicated. `BlockedTime` has exactly one creation/deletion path;
Settings and Calendar are two UI entry points onto it, not two systems.

## 3. Conflict Prevention on Admin-Created Appointments

`createAppointment` and `rescheduleAppointment` both re-check for overlap
against non-cancelled `Appointment` rows (and `BlockedTime`) inside a
transaction before writing — the same pattern `submitBookingAction`
already established for the wizard. The admin is not exempt from double-
booking prevention; if they need to override (e.g. an emergency overlap),
that's a deliberate manual data edit outside this UI, not a feature this
cycle builds.

## 4. Block Time

A `BlockedTime` window (start, end, optional reason) blocks all
appointment slots overlapping it — this already works today because
`lib/availability.ts`'s `getAvailableSlots` already subtracts
`BlockedTime`. This cycle only adds the admin UI to create/delete them;
no changes to the availability engine itself are needed.

## 5. Out of Scope (explicitly)

- Month view (Section 1).
- Drag-to-reschedule / drag-to-resize — this cycle uses explicit
  edit forms, not calendar-library drag interactions (no calendar
  library is introduced; the grid is hand-built Tailwind, consistent
  with "no generic dashboard" direction from the original brief).
- Recurring appointments or recurring blocked time.
- Any change to the wizard's Step 6 scheduling UI — it already uses the
  same engine and needs no changes here.

## 6. Testing Approach

- Unit tests: `lib/calendar-grid.ts`'s pure layout function (given
  appointments/blocks, produces correct hour-positioned entries;
  handles overlapping/adjacent events).
- Integration tests: `createAppointment` (happy path + conflict
  rejection, mirroring `submitBookingAction`'s existing conflict test),
  `rescheduleAppointment`, `cancelAppointment`. `addBlockedTime`/
  `removeBlockedTime` already have integration test coverage from the
  foundation phase — no new tests needed for logic this cycle doesn't
  change.
- Manual walkthrough: view the week containing the wizard-created
  appointment from earlier testing, create a new appointment for an
  existing lead, attempt to double-book an occupied slot and confirm
  rejection, reschedule an appointment, cancel one, block a time range
  and confirm it visually renders and blocks wizard availability.
