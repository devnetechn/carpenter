# Notifications — Design Spec

> **Process note:** Per the user's standing instruction to continue
> through all remaining phases without stopping for live approval (they
> are asleep), this spec's decisions are self-approved and documented in
> full here for review on request. This is the tenth phase built under
> that instruction. Scope classification: **bounded** — this closes a gap
> in an existing flow (`queueNotification`, used by every prior phase)
> rather than introducing a new subsystem or admin page, so this spec is
> intentionally shorter than the architectural phases before it.

## Purpose

Every phase since Booking Wizard has called `queueNotification()`, which
has only ever written a `QUEUED` row to the `Notification` table — no
email has actually been sent all session, by design (explicitly deferred
in the Booking Wizard and Admin Quotes specs as "a later phase"). This is
that phase: `queueNotification()` gains a real send attempt through an
`EmailProvider` abstraction, with Resend as the concrete implementation
named in the original top-level spec ("Abstraction + Resend as default
provider").

## No Resend API key is available in this environment

`.env` has `RESEND_API_KEY=""`. As with Stripe in the Payments phase, this
doesn't block building *real* integration code — it means the code must
degrade honestly rather than pretending to send. Three states, not two:

- **Not configured** (`RESEND_API_KEY` unset/empty): the row stays
  `QUEUED` — exactly today's behavior. This is not a failure; it's "no
  send was attempted."
- **Configured, send succeeds**: row moves to `SENT` with `sentAt` set.
- **Configured, send fails** (Resend returns an error, network failure):
  row moves to `FAILED`.

This three-state design is why `EmailProvider.send()` returns a tagged
result (`{status: "sent"} | {status: "failed", error} | {status:
"skipped", reason}`) rather than a boolean — a boolean can't distinguish
"we tried and it broke" from "we didn't try."

## Implementation shape

- `lib/email-provider.ts`: `EmailProvider` interface, `ResendEmailProvider`
  (calls Resend's REST API directly via `fetch` — no new npm dependency;
  Resend's API is a single `POST https://api.resend.com/emails` call with
  a bearer token, not complex enough to justify a new package), and
  `NoopEmailProvider` (returns `skipped` unconditionally). Module-level
  selection: `ResendEmailProvider` if `process.env.RESEND_API_KEY` is
  set, otherwise `NoopEmailProvider` — mirroring the exact selection
  pattern already used for `PaymentProvider` in the Payments phase.
- `lib/notifications.ts`'s `queueNotification()` is modified — not
  replaced — to call `emailProvider.send()` after creating the row and
  update `status`/`sentAt` based on the result. **Every existing call
  site across the whole app is unchanged** — this was the deciding factor
  in modifying `queueNotification` in place rather than adding a
  parallel "send" step every caller would need to remember to invoke.

## Why this doesn't touch any test

`.env.test` has no `RESEND_API_KEY`, so `NoopEmailProvider` is selected
in the test environment automatically — every existing integration test
asserting `notification.status === "QUEUED"` (e.g.
`tests/integration/notifications.test.ts`) keeps passing unmodified. New
tests target the new logic directly: `ResendEmailProvider`'s
success/failure branching (with a mocked `fetch`), and
`queueNotification`'s three-way status transition (with a mocked
`emailProvider`).

## Explicit non-goals

- No admin UI for viewing/retrying the notification queue — not
  requested anywhere in the original spec or any prior phase's design,
  and would be scope creep for a "make sending actually work" phase.
- No email templates/HTML — `Notification.body` is already a plain-text
  string written by each call site (e.g. `QUOTE_SENT`'s body is a
  sentence with a link); this phase sends that text as the email's `text`
  field, unchanged.
