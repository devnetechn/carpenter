# Payments — Design Spec

> **Process note:** Per the user's standing instruction to continue through
> all remaining phases without stopping for live approval (they are
> asleep), this spec's decisions are self-approved and documented in full
> here for review on request. This is the seventh phase built under that
> instruction (Booking Wizard, Admin Leads, Admin Calendar, Admin Quotes,
> Job Management, and now Payments).

## Purpose

Once a job exists, the business needs to bill the customer — a deposit
before work starts, partial payments during the job, a final payment at
completion — and record what's been paid. The `Invoice` and `Payment`
models already exist in the schema (foundation phase), fully shaped for
Stripe: `Payment.stripePaymentIntentId` (unique, nullable),
`Payment.method`, `PaymentStatus` (`PENDING`/`SUCCEEDED`/`FAILED`/
`REFUNDED`), `InvoiceStatus` (`UNPAID`/`PARTIALLY_PAID`/`PAID`/`VOID`),
`InvoiceType` (`DEPOSIT`/`PARTIAL`/`FINAL`). No migration needed.

## Explicit scope decision: manual payment recording, not live Stripe checkout

The original spec calls for "Stripe-ready payments (no raw card
storage)." This phase makes the data model and code **structurally**
Stripe-ready but does **not** wire a live Stripe Checkout/Elements flow,
for the same reason real email sending was deferred in the notifications
work threaded through every prior phase: **there is no Stripe account or
API key available in this environment**, and fabricating a payment button
that doesn't actually charge a card would be actively misleading — worse
than not building it, since "Stripe-ready" must never be confused with
"processes real payments."

Concretely:

- A `PaymentProvider` interface (`lib/payment-provider.ts`) is introduced,
  mirroring the existing `Storage` interface (`lib/storage.ts`) and the
  `queueNotification` abstraction: one clean seam where a real
  `StripePaymentProvider` plugs in later without touching admin UI, the
  public invoice page, or the database layer. Its only implementation for
  now is `ManualPaymentProvider`, which records a payment the business
  received by another channel (check, cash, bank transfer, or a card
  charged outside this system) — this is how most small carpentry
  businesses already collect deposits today, so it is real, useful
  functionality, not a stub.
- The public invoice page is **view-only** — it shows the amount due and
  status and tells the customer to contact the business to arrange
  payment. It does not present a "Pay Now" button, because there is
  nothing behind it that would actually move money. This is the honest
  choice: a page that looks like it processes a payment but doesn't would
  be a serious trust problem for a real business's customers.
- `Payment.method` (already a free-text `String` in the schema, not an
  enum) accommodates `"cash"`, `"check"`, `"bank_transfer"`, or `"card"`
  without a migration.

## Invoice creation

**Trigger:** a "Create Invoice" form on the Job detail page
(`app/admin/(protected)/jobs/[id]/page.tsx`), below the existing sections.
Admin picks a type (`DEPOSIT`/`PARTIAL`/`FINAL`), enters an amount and
optional due date. No auto-creation on job conversion — deposit timing
varies too much by job (some businesses invoice the deposit before
scheduling, some at the first site visit) for a fixed automatic trigger to
be correct, and the admin already has the quote's `depositAmount` visible
on the linked lead page to reference when entering the amount.

## Recording a payment

**Trigger:** a "Record Payment" form attached to each invoice on the Job
detail page. Admin enters an amount, picks a method (free-text input with
`cash`/`check`/`bank_transfer`/`card` as quick-select options), and
submits. This creates a `Payment` row with `status: SUCCEEDED` and
`paidAt: now()` via `ManualPaymentProvider.recordPayment()` — a real
payment already happened (through the provider's own POS terminal, bank
transfer, mailed check, etc.); the admin is recording that fact.

**Invoice status recomputation:** after recording a payment, the invoice's
`status` is recomputed from the sum of its `SUCCEEDED` payments against
its `amount`: `0` paid → stays `UNPAID`; `0 <` paid `< amount` →
`PARTIALLY_PAID`; paid `>= amount` → `PAID`. This recomputation is a pure
function (`lib/invoice-totals.ts`) unit-tested in isolation, then used by
the recording action — mirroring how `computeQuoteTotals` is unit-tested
separately from `saveQuoteDraft`.

A `PAYMENT_RECEIVED` notification (already in the `NotificationType`
enum) is queued to the business's own email on every recorded payment —
consistent with how `QUOTE_ACCEPTED`/`QUOTE_DECLINED` notify the business
about customer-triggered events, this notifies the business about an
admin-recorded event for audit-trail completeness, not because the admin
needs to be told about an action they just took themselves.

## Public invoice view (`/invoice/view/[token]`)

Unauthenticated, `Invoice.publicToken`-addressed, mirroring
`/quote/view/[token]`'s structure:

- Business name, job scope of work, invoice type and amount, due date if
  set.
- Payment history: each `SUCCEEDED` payment's amount, method, and date —
  so a customer can see what's already been credited.
- Status messaging: "Paid in full" / "Partially paid — $X remaining" /
  "Payment due" / a void notice, no interactive payment element (see
  Explicit scope decision above).

## Admin Payments list page (`/admin/payments`)

Replaces the foundation-phase placeholder. Lists `Payment` rows (not
invoices — the business wants to see the money that's actually moved),
structurally identical to the Jobs/Quotes/Leads list pages: a
status-filter `<select>` (`PENDING`/`SUCCEEDED`/`FAILED`/`REFUNDED`) +
table with columns Customer (via `payment.invoice.job.customer`) / Job
(link to `/admin/jobs/[id]`) / Invoice Type / Amount / Method / Status /
Paid Date.

## Data Model Notes

- No schema changes. `Invoice`, `Payment`, `InvoiceType`, `InvoiceStatus`,
  `PaymentStatus`, and `NotificationType.PAYMENT_RECEIVED` are already
  fully modeled.
- `Invoice.amount` and `Payment.amount` are `Decimal` — converted to
  `.toString()` before crossing into any `"use client"` component, per
  the standing project-wide rule.

## Security & Validation

- All invoice/payment mutation server actions live under
  `app/admin/(protected)/`, inheriting the existing route-group auth
  protection.
- Zod schemas for invoice creation and payment recording, mirroring
  `lib/job.ts`'s style.
- No card data is ever collected or stored by this application at any
  point — consistent with "no raw card storage" from the original spec,
  trivially satisfied since no card form exists yet.

## Testing Plan

- Unit tests for `lib/invoice-totals.ts` (`computeInvoiceStatus`): no
  payments → `UNPAID`; partial sum → `PARTIALLY_PAID`; sum meets or
  exceeds amount → `PAID`; a `VOID` invoice's status is never recomputed
  by a payment (an edge case worth a dedicated test, since voiding an
  invoice should be a deliberate admin action untouched by later payment
  recording).
- Integration tests for `createInvoice` and `recordPayment` server
  actions: invoice creation persists correctly; recording a payment
  updates `Invoice.status` correctly across the `UNPAID` →
  `PARTIALLY_PAID` → `PAID` transitions; a `PAYMENT_RECEIVED` notification
  is queued.
- Manual Playwright walkthrough: create a `DEPOSIT` invoice on a job,
  record a partial payment, confirm the invoice shows `PARTIALLY_PAID`,
  record the remainder, confirm `PAID`; open the public invoice link and
  confirm it renders the payment history and status without any payment
  UI; confirm `/admin/payments` lists the payment with correct
  customer/job/status and the status filter works.
