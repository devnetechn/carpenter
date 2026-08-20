# Job Management — Design Spec

> **Process note:** Per the user's explicit standing instruction mid-session
> ("badi padayon sa sunod ayaw na pangayo og permission nako matug sako" —
> continue through all remaining phases without asking for confirmation,
> they are asleep), this spec's brainstorming/design decisions are
> self-approved rather than gated on live user approval. Documented here in
> full for review on request. This is the sixth phase built under that
> standing instruction (following Booking Wizard, Admin Leads, Admin
> Calendar, and Admin Quotes).

## Purpose

Once a customer accepts a quote (Admin Quotes phase, `phase-6-admin-quotes`),
the business needs to turn that accepted quote into an actual job: something
with its own status lifecycle (Scheduled → In Progress → On Hold → Completed
/ Cancelled), its own materials/labor tracking that can diverge from the
original quote as real conditions on site change, and a photo record
(before/during/after) for both internal record-keeping and marketing.

The `Job`, `JobPhoto`, and `JobLineItem` Prisma models already exist in the
schema (added during the foundation phase) and are already consumed as
read-only data by the marketing site (`featuredOnWebsite`, `JobPhoto` on the
Portfolio page). This phase builds the admin-side write path: creating jobs
from accepted quotes and managing them to completion.

## Explicit scope boundaries

- **In scope:** converting an accepted quote into a `Job`; a Jobs list page;
  a Job detail page with status control, an editable info panel
  (scope/address/start date), independent line-item tracking, before/during/
  after photo upload, and the `featuredOnWebsite` toggle.
- **Out of scope (deferred to later phases per the original roadmap):**
  Invoices/Payments (the `Job.invoices` relation stays unused until the
  Payments phase), the Reviews submission/approval flow (the `Job.reviews`
  relation stays unused until the Reviews phase), any customer-facing job
  tracking page (not requested in the original spec — job management is
  admin-only).

## Job creation: converting an accepted quote

**Trigger:** a "Convert to Job" button appended to the Quote section of the
lead detail page (`app/admin/(protected)/leads/[id]/page.tsx`), shown only
when `latestQuote.status === "ACCEPTED"` and no `Job` already exists for
this lead.

**One job per lead:** enforced at the application layer (a `findFirst`
check before create inside the same transaction), not a database unique
constraint. A schema-level `@@unique` on `Job.leadId` would block a
legitimate future case — re-creating a job after a `CANCELLED` one — so the
simpler, reversible app-layer check is preferred here. This mirrors the
existing "one DRAFT quote per lead" pattern already used in
`saveQuoteDraft`.

**What gets created, inside one transaction:**

1. A `Job` row:
   - `quoteId` = the accepted quote's id, `leadId`, `customerId` copied from
     the lead.
   - `status` = `SCHEDULED` (the model default).
   - `scopeOfWork` defaults to the lead's service name (e.g. "Deck
     Construction") — a plain string the admin can edit afterward on the
     job detail page.
   - `addressStreet/City/State/Zip` copied from `lead.project` (guaranteed
     to exist by this point in the pipeline — every lead reaching
     `ACCEPTED` on its quote has already completed the booking wizard's
     address step).
   - `startDate`/`completionDate` left `null` — the admin sets a start date
     from the job detail page once scheduled with the customer.
2. `JobLineItem` rows seeded from the accepted `Quote`'s `QuoteItem` rows,
   **excluding items where `isIncluded` is `false`** (unselected optional
   upsells were never part of what the customer agreed to pay for). Each
   copied item's `total` is materialized as `quantity * unitPrice` at copy
   time (unlike `QuoteItem`, `JobLineItem.total` is a stored column, not
   computed on read — see Data Model Notes below).
3. `Lead.status` updated to `SCHEDULED` (the next stage after
   `APPROVED`/`ESTIMATE_SENT` in the existing `LeadStatus` pipeline).

**Explicit design correction carried over from the original brainstorming
session:** the user corrected the original database design to "track
materials independently from the quote" — this is why `JobLineItem` is a
distinct table from `QuoteItem` rather than a foreign key back to it. Job
line items are seeded from the quote once, then edited completely
independently afterward (added, removed, quantities corrected) as the job
runs, with zero further coupling to the `Quote`/`QuoteItem` rows. This is
why the copy is a one-time, one-directional data copy, not a live join.

After creation, the admin is redirected to the new job's detail page,
`/admin/jobs/[id]`.

## Job detail page (`/admin/jobs/[id]`)

Sections, top to bottom:

1. **Header:** job reference (reuse the lead's `bookingRef` for continuity —
   there's no separate job reference format), customer name, link back to
   the source lead.
2. **Status control:** a dropdown + "Update Status" button, following the
   exact pattern already established by `LeadStatusForm`
   (`components/admin/lead-status-form.tsx`): `SCHEDULED`, `IN_PROGRESS`,
   `ON_HOLD`, `COMPLETED`, `CANCELLED`. Server-side, moving *into*
   `COMPLETED` sets `completionDate = new Date()`; moving *out of*
   `COMPLETED` (a correction) clears it back to `null`. This mirrors how
   `Quote.sentAt`/`viewedAt` are stamped automatically on transition rather
   than requiring manual date entry.
3. **Job info form:** editable `scopeOfWork` (textarea), address fields,
   and `startDate` (date input), saved via a single server action —
   structurally identical to `BusinessInfoForm`
   (`components/admin/business-info-form.tsx`), just a different model.
4. **Line items:** a client component list (type: LABOR/MATERIAL, same enum
   shape as `QuoteItemType` minus `OPTIONAL` — job line items track what
   was actually used, not upsell menu options), description, quantity,
   unit price, computed line total, add/remove rows, single "Save Line
   Items" action that replaces all rows transactionally (delete-then-
   recreate, the same pattern `saveQuoteDraft` already uses for
   `QuoteItem`). Total job cost (sum of line items) displayed read-only
   beneath the list — this is informational only in this phase, with no
   further reconciliation against the quote total (that reconciliation, if
   ever needed, belongs to the future Payments phase).
5. **Photos:** three phase sections (Before / During / After). Each has a
   file input reusing the existing `/api/upload` route and `lib/storage.ts`
   (already used by the booking wizard's photo step — no new upload
   infrastructure needed), an optional caption field, and persists
   immediately as a `JobPhoto` row per upload (no separate "save" step,
   consistent with treating each upload as its own atomic action). Existing
   photos are shown grouped by phase with a delete button per photo
   (deletes the DB row and the underlying file via `storage.delete`).
6. **Featured on website:** a single checkbox bound directly to
   `Job.featuredOnWebsite`, saved via its own minimal server action (a
   plain `<form>` submit, no client JS needed — it's a single boolean
   flip). This is the field the marketing site's Portfolio page already
   reads from.

## Jobs list page (`/admin/jobs`)

Replaces the foundation-phase placeholder. Structurally identical to the
Quotes list page (`/admin/quotes`) and Leads list page (`/admin/leads`):
a status-filter `<select>` + table, columns Customer / Service (via
`lead.service.name`) / Status / Start Date / Completion Date, each row
linking to `/admin/jobs/[id]`.

## Data Model Notes

- `JobLineItem.total` is a stored `Decimal` column (unlike `QuoteItem`,
  which has no `total` column and computes totals on read via
  `computeQuoteTotals`). The line-item save action computes and stores
  `quantity * unitPrice` per row at save time — no live computation needed
  on read, which keeps the Jobs list/detail pages simpler since there's no
  equivalent of `quote-totals.ts` needed for jobs in this phase (no
  discount/tax/deposit concepts apply to a job's actual-cost tracking).
- No schema changes are required for this phase — `Job`, `JobPhoto`, and
  `JobLineItem` were already fully modeled in the foundation schema.

## Security & Validation

- All job mutation server actions live under `app/admin/(protected)/`,
  inheriting the existing route-group auth protection — no new auth code
  needed.
- Photo uploads reuse the existing magic-byte validation
  (`lib/fileSignature.ts`) and 10MB size cap already enforced by
  `/api/upload` — no new validation code needed.
- Zod schemas for the job-info form and line-items save, following the
  exact validation style already used in `lib/quote.ts`.

## Testing Plan

- Unit tests for any new pure logic (there is very little pure logic in
  this phase — line-item totals are simple stored-column arithmetic,
  unlike quote totals which have discount/tax/deposit math worth unit
  testing in isolation).
- Integration test for the quote→job conversion server action: verifies
  the `Job` row, that `JobLineItem` rows are seeded correctly (included
  items copied, excluded optional items skipped), that `Lead.status`
  becomes `SCHEDULED`, and that a second conversion attempt on the same
  lead is rejected.
- Integration test for the status-transition side effects
  (`completionDate` set/cleared).
- Manual Playwright walkthrough covering: convert an accepted quote to a
  job, verify line items match included quote items only, edit line items
  independently and confirm the quote is untouched, upload photos to all
  three phases, toggle featured-on-website, mark the job completed and
  confirm `completionDate` is set, confirm `/admin/jobs` list and filter
  work, confirm the marketing Portfolio page picks up a newly-featured job.
