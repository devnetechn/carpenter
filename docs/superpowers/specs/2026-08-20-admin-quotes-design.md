# Admin Quotes — Design

Status: Approved (self-approved per explicit instruction to proceed without
stopping for confirmation this session — flagged for review on request)
Date: 2026-08-20

## 1. Purpose & Scope

`/admin/quotes` is still the foundation phase's placeholder. This cycle
builds the estimate/quote workflow described in the foundation spec's
Section 6:

- A quote builder on the Lead detail page (not a separate creation page —
  a quote always belongs to exactly one lead, and the admin is already
  looking at that lead's context when they'd create one): add/edit/remove
  `QuoteItem` rows (labor/material/optional), with subtotal → discount →
  tax → deposit → total computed live from `BusinessSettings` defaults
  (overridable per-quote).
- A "Send" action that generates the quote's `publicToken`, moves status
  to `SENT`, timestamps `sentAt`, and queues a `QUOTE_SENT` notification.
- A public, unauthenticated quote view at `/quote/view/[token]` — the
  customer's page to review the quote and Accept / Decline / Request
  Changes.
- A `/admin/quotes` list page mirroring the Leads list's pattern (table,
  status filter) for a cross-lead view of every quote.

## 2. Architecture

Quote items are edited inline on `/admin/leads/[id]` (a new "Quote"
section added to the existing detail page, not a new route) via a
client component managing an in-memory item list before persisting —
matches the booking wizard's "collect in memory, persist in one
transactional write" pattern, since a quote's line items are naturally
edited as a batch (add a few items, adjust quantities, then save) rather
than one item at a time against the server.

Totals computation is a pure function — `lib/quote-totals.ts` — taking
line items + discount + tax rate + deposit percent, producing subtotal/
tax/total/deposit. Unit-testable independent of the UI, and reused by
both the admin builder (live preview as the admin edits) and the public
quote view (rendering the final numbers).

Server Actions in `app/admin/(protected)/leads/[id]/quote-actions.ts`:
`saveQuoteDraft` (create-or-replace the quote's line items + discount/
tax/deposit overrides, staying in `DRAFT`), `sendQuote` (generates
token, flips to `SENT`, notifies). Customer-facing actions in
`app/quote/view/[token]/actions.ts`: `respondToQuote` (Accept/Decline/
Request Changes), reusing the `queueNotification` pattern for the
`QUOTE_ACCEPTED` notification.

## 3. Quote States and Transitions

`Quote.status`: `DRAFT → SENT → VIEWED → ACCEPTED | DECLINED`. `VIEWED`
is set automatically the first time the public token URL is loaded
(not a separate action — a side effect of the public page's own load,
guarded so it only fires once via `viewedAt IS NULL`). "Request Changes"
does not have its own status value in the foundation schema — it's
recorded as a note on the Lead (via the existing `LeadNote` mechanism
from the admin-leads cycle) and the quote stays `SENT`, since the
schema's `QuoteStatus` enum has no `CHANGES_REQUESTED` value and adding
one is unnecessary: "request changes" in practice means "the admin goes
back into the draft, adjusts items, and re-sends" — the existing
DRAFT-edit-SENT cycle already models that without a new state.

"Request Changes" does not transition `Quote.status` at all — it stays
`SENT`/`VIEWED`. The customer's message is delivered to the admin via a
queued `Notification` (a new `QUOTE_CHANGES_REQUESTED` type — see below),
**not** a `LeadNote`: `LeadNote.adminUserId` is required and the
admin-leads cycle established notes as admin-authored only, so writing a
customer's free-text message into that table would require inventing a
fake admin author. The notification's body carries the message instead,
consistent with how every other customer-originated event already flows
through `Notification` in this app (the contact form, the booking
wizard). Declining also needs its own notification type — the foundation
schema's `NotificationType` enum has `QUOTE_SENT` and `QUOTE_ACCEPTED`
but no decline/changes-requested equivalents. This cycle adds
`QUOTE_DECLINED` and `QUOTE_CHANGES_REQUESTED` to that enum — a small,
additive migration, the same kind already done for `Lead.preferredContact`
in the admin-leads cycle.

`EXPIRED` (already in the schema's `QuoteStatus` enum) is set lazily:
the public view checks `expiresAt` on load and treats an expired-but-
still-SENT quote as expired for display purposes, without a background
job — this cycle doesn't add a cron/scheduled task, consistent with
YAGNI for a small business's quote volume.

## 4. Totals Calculation

```
subtotal = sum(quantity * unitPrice) for items where isIncluded = true
           (isOptional items default isIncluded = false and are excluded
           from subtotal unless the admin explicitly includes them)
afterDiscount = subtotal - discount
tax = afterDiscount * taxRate
total = afterDiscount + tax
depositAmount = total * depositPercent
```

`taxRate`/`depositPercent` come from `BusinessSettings` at save time and
are applied immediately to compute `tax`/`depositAmount` as frozen dollar
amounts on the `Quote` row (the schema stores the computed amounts, not
the rates themselves — there's no `Quote.taxRate` field). Once saved,
those dollar amounts don't recompute on their own, so a later change to
business-wide default rates never silently alters an already-drafted
quote; adjusting an existing quote's totals means re-saving the draft,
which reapplies whatever rate is current at that moment.

## 5. Public Quote View

`/quote/view/[token]` (a token-scoped route, not `/quote/[token]` — kept
distinct from the booking wizard's `/quote` route entirely, avoiding any
routing ambiguity between "start a new booking" and "view an existing
quote"). No login — the unguessable `publicToken` is the access control,
consistent with the booking-reference pattern already established.
Displays: business info, itemized line items, subtotal/discount/tax/
total/deposit, and Accept/Decline/Request-Changes actions when status is
`SENT` or `VIEWED`. Already-`ACCEPTED`/`DECLINED` quotes show their
outcome instead of the action buttons.

## 6. Out of Scope (explicitly)

- Converting an accepted quote into a Job — that's the Jobs phase.
- PDF export / email-attached quote documents — the public link *is* the
  deliverable, per the foundation spec's "generate a professional
  customer-facing quote" read as "a page," not a PDF generation pipeline.
- Quote revisions/versioning — editing a `DRAFT` quote overwrites its
  items; there's no history of prior drafts.

## 7. Testing Approach

- Unit tests: `lib/quote-totals.ts` (discount/tax/deposit math, optional-
  item inclusion rules).
- Integration tests: `saveQuoteDraft`, `sendQuote` (token generation,
  status transition, notification queued), `respondToQuote` (Accept/
  Decline paths, notification queued on Accept).
- Manual walkthrough: build a quote on an existing lead with a mix of
  labor/material/optional items, confirm live totals; send it; open the
  public link in a fresh (unauthenticated) context and confirm it loads
  without login, confirm `viewedAt` gets set exactly once; accept it and
  confirm the lead's admin view reflects the acceptance; confirm the
  quotes list page shows correct statuses across multiple leads.
