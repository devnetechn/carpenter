# Carpentry Booking & Job Management System — Design

Status: Approved (pending final user sign-off on this document)
Date: 2026-08-20

## 1. Purpose & Scope

A production-quality, single-tenant web application for one carpentry
contractor. It replaces ad-hoc phone/email intake with a structured pipeline:

```
Customer Request → Lead → Consultation → Estimate → Approval →
Appointment → Job → Payment → Completed → Review
```

This is explicitly **not** a multi-tenant SaaS product. There is one
business, one admin account (with room for a second staff account later),
and no organization/tenant tables anywhere in the schema.

Business identity (name, logo, service area, hours, pricing defaults) is
**placeholder content for now**, fully driven through `BusinessSettings` and
seed data — swapping in the real business's details later is a data change,
never a code change.

## 2. Tech Stack & Environment

- Next.js 15 (App Router), TypeScript, Tailwind CSS
- PostgreSQL (connects to a Postgres instance the user already runs locally;
  connection string via `DATABASE_URL` in `.env`) + Prisma ORM
- Auth.js (NextAuth) v5 — Credentials provider, Prisma adapter, database
  sessions
- shadcn/ui (Radix-based primitives, copied into the repo, not a runtime
  dependency) as the base component layer, heavily restyled to a custom
  "clean + calm + premium" design system — not left looking like a generic
  shadcn template
- Resend for outbound email, behind a `NotificationService` interface
- Stripe (test-mode-first) for deposit/partial/final payments via
  PaymentIntents; no raw card data ever touches the server
- Local-disk file storage behind a `Storage` interface (`save`/`delete`),
  gitignored `/uploads` directory — swappable to S3/Blob/Cloudinary later by
  adding one new implementation class

## 3. Architecture

Single Next.js application, one codebase, one deploy. Route groups separate
concerns; there is no separate admin app or monorepo.

```
app/
  (public)/                 marketing site: home, services, about, portfolio, contact
  (booking)/quote/          multi-step booking wizard (customer-facing)
  (customer)/status/[ref]/  booking-reference lookup, no login required
  (customer)/review/[token]/ post-completion review submission
  (customer)/pay/[token]/   public payment page (Stripe Elements)
  quote/[token]/            public quote view (accept / decline / request changes)
  (admin)/                  everything behind auth
  api/
    upload/                 multipart file upload -> Storage
    webhooks/stripe/        Stripe webhook receiver
    availability/           shared slot-availability lookup
```

- **Server Components + Server Actions** handle all mutations (create lead,
  update status, build quote, etc.). No hand-maintained REST layer.
  API routes exist only where HTTP endpoints are required: the Stripe
  webhook and the multipart upload handler.
- **Business logic lives in `lib/`** (`lib/availability.ts`, `lib/quotes.ts`,
  `lib/notifications.ts`, `lib/storage.ts`, `lib/serviceArea.ts`, etc.),
  imported by server actions, API routes, and the admin UI alike — one
  source of truth, never duplicated in components.
- **Auth**: Auth.js v5, Credentials provider, Prisma adapter, database
  sessions. Middleware protects every route under `(admin)`.
- **Components**: `components/ui/` = restyled shadcn primitives (the only
  place Radix is touched directly). `components/booking/` and
  `components/admin/` compose those primitives into feature components
  (StepIndicator, PhotoUploader, QuoteItemTable, LeadStatusBadge,
  AvailabilityPicker, etc.). No feature component talks to Prisma directly.

## 4. Database Schema

Grouped by workflow stage. No tenant/organization tables — everything
belongs to the one business by definition.

**Identity & configuration**
- `AdminUser` — id, email, passwordHash, name, role, timestamps
- `BusinessSettings` — singleton row: name, logo, phone, email, address,
  taxRate, depositPercent, defaultAppointmentDurationMin,
  serviceAreaZips, socialLinks
- `BusinessHours` — dayOfWeek, openTime, closeTime, isClosed
- `BlockedTime` — start, end, reason

**Catalog (extensible intake)**
- `Service` — id, name, slug, description, icon, active, sortOrder
- `ServiceQuestion` — id, serviceId, label, fieldType
  (text/number/select/boolean/textarea), options (JSON, for selects),
  required, sortOrder. Seeding new questions for a service is a data
  change, not a code change — this is what makes Step 2 of the wizard
  extensible.

**Customer & lead**
- `Customer` — name, phone, email, address fields, createdAt
- `Lead` — customerId, serviceId, status (New → Contacted →
  Consultation Scheduled → Estimate Sent → Follow-up → Approved →
  Scheduled → Completed → Lost), budgetMin, budgetMax, notes, source,
  createdAt
- `Project` — leadId, description, answers (JSON keyed by
  `ServiceQuestion.id`), address fields, withinServiceArea (bool,
  computed at submit time). Created as a draft on wizard Step 1 and
  updated through the flow, so an abandoned booking still leaves a
  recoverable partial lead.
- `ProjectPhoto` — projectId, url, caption, uploadedAt
- `LeadNote` — leadId, adminUserId, body, createdAt (internal-only notes)

**Scheduling**
- `Appointment` — leadId, type (consultation/follow-up/job-visit), start,
  end, status (scheduled/completed/cancelled/no-show), notes. Serves both
  the booking wizard's consultation slot and admin-created appointments —
  one table, one conflict-check code path.

**Quoting**
- `Quote` — leadId, status (Draft/Sent/Viewed/Accepted/Declined/Expired),
  subtotal, discount, tax, depositAmount, total, sentAt, viewedAt,
  respondedAt, expiresAt, publicToken
- `QuoteItem` — quoteId, type (labor/material/optional), description,
  quantity, unitPrice, isOptional, isIncluded

**Jobs**
- `Job` — quoteId (nullable), leadId, customerId, status (Scheduled/In
  Progress/On Hold/Completed/Cancelled), scopeOfWork, address fields,
  startDate, completionDate
- `JobPhoto` — jobId, url, phase (before/during/after), caption
- `JobLineItem` — jobId, type (labor/material), description, quantity,
  unitPrice, total. Independent from `QuoteItem` by design — tracks
  materials/labor actually used as the job progresses, which may differ
  from what was quoted.

**Payments**
- `Invoice` — jobId, type (deposit/partial/final), amount, dueDate,
  status, publicToken
- `Payment` — invoiceId, amount, method, stripePaymentIntentId, status
  (pending/succeeded/failed/refunded), paidAt

**Reviews & system**
- `Review` — jobId, customerId, rating (1-5), body, projectType,
  approved (bool), createdAt. Defaults unapproved; admin approves before
  it appears on the public site.
- `Notification` — type, recipientEmail, subject, body,
  relatedEntityType/Id, status (queued/sent/failed), sentAt
- `AuditLog` — adminUserId, action, entityType, entityId, metadata
  (JSON), createdAt — every lead/quote/job status transition is recorded

## 5. Customer Booking Flow

8 steps, single `/quote` route, client-driven step state, backed by a
draft `Project` created early (see above) rather than assembled entirely
client-side and submitted once at the end.

1. **Select Service** — from active `Service` rows
2. **Project Details** — dynamically rendered from that service's
   `ServiceQuestion` rows; answers stored as JSON on `Project`
3. **Project Photos** — client-side preview/validation (type, size cap,
   max count) before upload; upload goes through `api/upload` →
   `Storage` → URL attached to the draft `Project`
4. **Project Address** — street/city/state/zip; ZIP checked against
   `BusinessSettings.serviceAreaZips`, shown inline as
   within/outside service area, never blocks submission
5. **Budget** — estimated range
6. **Preferred Schedule** — slots computed by `lib/availability.ts`:
   expand `BusinessHours` into duration-sized slots, subtract
   overlapping non-cancelled `Appointment`s, subtract `BlockedTime`.
   The same function backs the admin calendar's appointment creation,
   so there is exactly one conflict-prevention code path.
7. **Customer Information** — name, phone, email, preferred contact
   method
8. **Confirmation** — customer name, project type, summary, appointment
   date/time, address, and a generated booking reference (e.g.
   `CW-2026-0341`) usable at `/status/[ref]` for account-free status
   lookup

## 6. Admin Workflows

- **Lead pipeline**: status changes are admin-driven (not automatic),
  each one written to `AuditLog` and optionally firing a
  `Notification` per the configured event (quote sent, quote accepted,
  payment received, job completed, review request).
- **Quote builder**: admin adds `QuoteItem` rows; subtotal → discount →
  tax (from `BusinessSettings.taxRate`, per-quote overridable) → deposit
  (from `depositPercent`, overridable) → total computed live. "Send"
  generates `publicToken`, moves status to Sent, notifies the customer
  with a link to `/quote/[token]`, where they can Accept / Decline /
  Request Changes.
- **Quote → Job**: converting is a manual admin action after acceptance
  (never automatic), creating a `Job` in Scheduled status linked back to
  `quoteId`/`leadId`.
- **Job execution**: admin manages `JobLineItem`s and `JobPhoto`s
  (before/during/after) as work proceeds. Marking a job Completed sets
  `completionDate` and fires the review-request notification with a
  link to `/review/[token]`.
- **Payments**: `Invoice`s (deposit/partial/final) are created manually
  by the admin against a `Job`, pre-filled from `depositPercent`/quote
  total but adjustable. Each invoice's public payment link
  (`/pay/[token]`) creates a Stripe PaymentIntent; the webhook updates
  `Payment.status`, and full payment fires the payment-received
  notification. Dashboard "Outstanding Payments" sums unpaid/partial
  invoices.
- **Calendar**: day/week/month views over `Appointment` +
  `BlockedTime` (visually distinct). Create/reschedule/cancel all route
  through `lib/availability.ts`.
- **Reviews**: submitted reviews default unapproved; admin approves
  before they surface on the public Home/Portfolio testimonials.

## 7. Security

- Server-side Zod validation on every server action and API route.
- Middleware-enforced Auth.js session check on all `/admin/*` routes.
- Uploads: MIME allowlist + magic-byte sniff, size cap, randomized
  on-disk filenames (no path traversal / overwrite).
- Rate limiting on public unauthenticated endpoints most exposed to
  abuse: `/quote` submission, `/api/upload`, `/admin/login`.
- Public tokens (`quote.publicToken`, review token, payment token) are
  random and unguessable, scoped to a single record — never sequential
  IDs.
- Passwords hashed with bcrypt. No raw card data touches the server —
  Stripe Elements/PaymentIntents run client-side.
- `AuditLog` on every lead/quote/job status transition.

## 8. Notifications

`NotificationService` interface: every event below is a typed call into
it, logged to the `Notification` table and sent via a Resend adapter.

New booking, booking confirmation, appointment reminder, appointment
cancellation, quote sent, quote accepted, payment received, job
completed, review request.

## 9. Out of Scope (explicitly)

- Multi-tenant/org support, tenant switching, subscription plans
- Customer account registration/login (booking-reference access instead)
- Live Stripe production keys (test-mode structure only, ready to swap)
- Cloud file storage (local-disk now, swappable interface for later)

## 10. Implementation Phases

Foundation → Database → Auth → Business Settings → Customer Booking →
Admin Dashboard → Calendar → Leads → Quotes → Jobs → Payments →
Reviews → Notifications. Each phase gets its own implementation plan via
the planning workflow, building on the schema and architecture fixed in
this document.
