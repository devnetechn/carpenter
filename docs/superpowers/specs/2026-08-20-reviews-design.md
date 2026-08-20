# Reviews — Design Spec

> **Process note:** Per the user's standing instruction to continue
> through all remaining phases without stopping for live approval (they
> are asleep), this spec's decisions are self-approved and documented in
> full here for review on request. This is the eighth phase built under
> that instruction.

## Purpose

The `Review` model already exists (foundation phase) and the marketing
site already reads from it: `app/(marketing)/portfolio/page.tsx` includes
`reviews: { where: { approved: true }, take: 1 }` on each featured job.
What's missing is how a `Review` row gets created (customer submission)
and how `approved` ever becomes `true` (admin moderation). This phase
builds both halves.

## Public review submission link: using the Job's own id, not a new token column

`Review` has no token field, and `Job` has no `publicToken` column either
(unlike `Quote`/`Invoice`, which do). Adding one would be the obvious fix,
but it isn't necessary: a Prisma `cuid()` — Job's own `id` — is already an
unguessable, high-entropy identifier (timestamp + counter + cryptographic
randomness, ~25 characters), which is exactly what a bearer-capability
token is. Using it directly as the review-submission link
(`/review/submit/[jobId]`) avoids a schema migration and an extra column
whose only job would be to hold another random string.

This is a deliberately different trust call than `Quote`/`Invoice`, which
use a *dedicated* `publicToken` distinct from their `id`: those expose
financial data and actions, so keeping the friendly-looking id
(potentially reused in admin UI, URLs, logs) separate from the bearer
token is worth the extra column. A leaked review-submission link only
lets someone submit one opinion about a job that's already
publicly-featured-eligible — low enough stakes that reusing the id is the
right, YAGNI-respecting call here.

## Public review submission (`/review/submit/[jobId]`)

Unauthenticated, server-rendered:

- If the job doesn't exist: `notFound()`.
- If `job.status !== "COMPLETED"`: a plain message — "This project isn't
  marked complete yet — please check back once it's finished." No form.
- If a `Review` already exists for this job (enforced at the application
  layer with a `findFirst` check before create, mirroring the "one job
  per lead" and "one DRAFT quote per lead" patterns already used
  elsewhere): show "Thanks — you've already left a review for this
  project." instead of the form.
- Otherwise, render the submission form: a 1–5 star rating (radio-style
  buttons, not a raw number input — the spec's UI direction is "Clean +
  Calm + Premium," and a raw `<input type="number">` for a star rating
  would read as generic-AI-template), a project type text field
  pre-filled from `job.lead.service.name` but editable (a customer might
  describe their project more specifically — "kitchen remodel" vs. the
  service catalog's generic "Remodeling"), and a review body textarea.

Submitting calls `submitReview(jobId, { rating, projectType, body })`,
which creates the `Review` row with `approved: false` (the model default)
and queues a notification to the business (see below) so they know to
moderate it.

## Admin moderation (`/admin/reviews`)

Replaces the foundation-phase placeholder. A status-filter (`All` /
`Pending` / `Approved`) + table, structurally identical to every other
admin list page: Customer / Job (link to `/admin/jobs/[id]`) / Project
Type / Rating / Body (truncated) / Approved badge / Actions.

Because `Review.approved` is a plain boolean (no `REJECTED` state in the
schema), moderation has exactly two actions, matching that binary
model precisely rather than inventing a third state the schema doesn't
have:

- **Approve** — sets `approved: true`. Immediately eligible to appear on
  the public Portfolio page (which already filters on
  `approved: true`).
- **Delete** — removes the row entirely. This is the correct action for
  a review that shouldn't exist publicly at all (spam, abuse, wrong
  project) — there's no "rejected but retained" state to move it to, so
  deletion is the only meaningful alternative to approval.

## Inviting a review: an explicit admin action, not automatic

A "Send Review Request" button appears on the Job detail page (Payments
phase's page, extended here), enabled only when `job.status ===
"COMPLETED"`. Clicking it queues a `REVIEW_REQUEST` notification (already
in the `NotificationType` enum from the foundation phase) to the
customer's email, containing the `/review/submit/[jobId]` link.

This mirrors the existing "Send Quote" pattern exactly: nothing in this
codebase auto-sends a customer-facing notification purely as a side
effect of a status change (`QUOTE_SENT` only fires on the explicit "Send
Quote" click, not on quote creation) — completing a job and inviting a
review are related but separably-timed business decisions (an admin may
want to do a final walkthrough, take after-photos, or wait a day before
asking for a review). There's no schema field to track "already sent," so
the button stays clickable on every visit to a completed job; this is an
accepted, low-stakes tradeoff — an admin clicking it twice sends two
identical invite emails, not a corrupted state.

## New notification type: `REVIEW_SUBMITTED`

The `NotificationType` enum needs one additive value —
`REVIEW_SUBMITTED` — for notifying the business when a customer submits
a review (mirroring how `QUOTE_ACCEPTED`/`QUOTE_DECLINED`/
`QUOTE_CHANGES_REQUESTED` notify the business about customer-triggered
quote events). This is the same kind of small additive enum migration
already done once this session for the Quotes phase.

## Data Model Notes

- One schema change: `NotificationType` gains `REVIEW_SUBMITTED`.
  Everything else (`Review`, `Job`, `REVIEW_REQUEST`) is already modeled.
- No `Decimal` fields are involved in this phase — `Review.rating` is a
  plain `Int`, so none of the standing Decimal-to-client-component rules
  apply here.

## Security & Validation

- `submitReview` is the one new *unauthenticated* server action in this
  phase (unlike every other Reviews/Payments/Jobs action, which lives
  under `app/admin/(protected)/`) — it lives at
  `app/review/submit/[jobId]/actions.ts`, mirroring where
  `app/quote/view/[token]/actions.ts` and the (Payments-phase) public
  invoice page's read-only pattern already established unauthenticated
  customer-facing action files.
- `rating` is validated server-side to an integer 1–5 (Zod
  `z.coerce.number().int().min(1).max(5)`) regardless of what the
  client's star UI sends.
- `body` requires a minimum length (`z.string().min(1)`) so an empty
  review can't be submitted.
- Admin moderation actions (`approveReview`, `deleteReview`) live under
  `app/admin/(protected)/reviews/`, inheriting route-group auth
  protection.

## Testing Plan

- Integration tests for `submitReview`: creates an unapproved `Review`
  for a `COMPLETED` job; rejects submission for a job that isn't
  `COMPLETED`; rejects a second submission for a job that already has a
  review; queues a `REVIEW_SUBMITTED` notification.
- Integration tests for `approveReview`/`deleteReview`: approving flips
  `approved` to `true`; deleting removes the row.
- Manual Playwright walkthrough: mark a job `COMPLETED`, click "Send
  Review Request" and confirm the notification is queued with the
  correct link, open `/review/submit/[jobId]` in a fresh browser context
  and submit a review, confirm it appears in `/admin/reviews` as
  `Pending`, confirm resubmitting the same link shows the "already
  submitted" message instead of the form, approve it in admin, confirm
  it now appears in the public `/portfolio` page's quote for that job.
