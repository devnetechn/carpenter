# Admin Leads Management — Design

Status: Approved (self-approved per explicit instruction to proceed without
stopping for confirmation this session — flagged for review on request)
Date: 2026-08-20

## 1. Purpose & Scope

The wizard and contact form now create real `Lead` records, but the admin
dashboard has no way to see or act on them (`/admin/leads` is still the
foundation phase's "Coming soon" placeholder). This cycle builds:

- A leads list at `/admin/leads` — filterable by status, sorted newest first.
- A lead detail page at `/admin/leads/[id]` showing full context: customer
  info, service, project answers, photos, address/service-area flag,
  budget, appointments, internal notes — and a status-update control.
- Internal notes (`LeadNote`) — admin-only, never customer-visible.
- The Overview page gets real metrics (new leads count, upcoming
  appointments count) since the data now exists to show — small addition,
  not a separate cycle.

This does not build the Calendar, Quotes, Jobs, Payments, or Reviews admin
sections — each is its own later cycle per the roadmap.

## 2. Architecture

Both pages are Server Components reading directly via Prisma (no need for
client-side data fetching — this is an internal, authenticated admin
surface, consistent with the Settings page pattern from the foundation
phase). Status updates and note-adding are Server Actions in
`app/admin/(protected)/leads/actions.ts`, following the same
`"use server"` + separate-schema-file pattern established for Settings and
Contact.

## 3. Leads List (`/admin/leads`)

Table columns: booking reference, customer name, service, status (badge,
color-coded), budget range, created date. A status filter (select,
defaults to "All") narrows the list via a query param
(`?status=NEW`), enabling a fast Server Component re-fetch — no client
state needed. Each row links to the detail page.

## 4. Lead Detail (`/admin/leads/[id]`)

Sections:
- **Customer**: name, phone, email, preferred contact method (from
  `Project`-adjacent data — note: `preferredContact` isn't currently a
  schema field; see Section 6).
- **Project**: service name, dynamic answers (rendered as label/value
  pairs by re-joining against `ServiceQuestion` for labels — answers are
  stored as `{questionId: value}` JSON), photos (grid), address +
  service-area badge, budget range.
- **Appointments**: any `Appointment` rows for this lead (the wizard
  creates one `CONSULTATION` appointment at submission).
- **Status control**: a select showing all `LeadStatus` values, updates
  via server action, writes an `AuditLog` row on change (per the
  foundation spec's audit requirement).
- **Internal notes**: list of `LeadNote` rows (author + timestamp + body)
  and an add-note form. Tied to the logged-in admin user via
  `auth()`.

## 5. Overview Metrics Addition

Replace the Overview placeholder with three real counts, queried directly:
- New leads (`Lead.status = NEW`)
- Upcoming appointments (`Appointment.status = SCHEDULED AND start > now()`)
- Total leads (all-time, for context)

No charts or historical trends in this cycle — just the counts the
foundation spec's dashboard-metrics list called "New leads" and "Upcoming
appointments," the two that are meaningful with only Leads data (the rest
— pending quotes, active jobs, revenue — depend on subsystems not built
yet and stay as later additions, not fake placeholder numbers).

## 6. Schema Note — `preferredContact`

The wizard's `SubmitBookingInput` collects `preferredContact` (EMAIL/
PHONE/TEXT) but the foundation schema's `Customer`/`Lead` models have no
field to persist it — it was silently dropped in `submitBookingAction`.
This cycle adds `Lead.preferredContact String?` (nullable, since
contact-form-created leads never collect this) so the detail page can
display it, and updates `submitBookingAction` to persist it. Small,
additive migration.

## 7. Testing Approach

- Unit test: the answers-to-labels join helper (given `ServiceQuestion[]`
  and an answers JSON blob, produces label/value pairs) — pure function,
  easy to get subtly wrong.
- Integration tests: the status-update server action (writes `AuditLog`,
  rejects an invalid status), the add-note action (creates `LeadNote`
  tied to the current admin user).
- Manual verification: seed/create a lead via the real wizard, confirm it
  appears in the list, filter by status, open the detail page, confirm
  all sections render, change status, add a note, confirm Overview counts
  update.
