# Public Marketing Site — Design

Status: Approved (pending final user sign-off on this document)
Date: 2026-08-20

## 1. Purpose & Scope

The first customer-facing cycle of the carpentry booking system: the public
marketing website that establishes trust and drives visitors toward the
booking wizard. This is the first of two cycles under the "Customer
Booking" phase from the foundation spec's roadmap:

1. **This cycle** — public marketing site (Home, Services, About, Portfolio,
   Contact) plus a `/quote` stub page.
2. **Next cycle** — the full 8-step booking wizard that replaces the stub.

This cycle does not implement the wizard itself. `/quote` exists only as a
landing point for the site's CTAs so no link on the site is dead; its real
implementation is a separate spec.

Builds directly on the foundation phase (`docs/superpowers/specs/2026-08-20-carpentry-booking-system-design.md`
and its implementation, tag `phase-1-foundation`): Prisma schema, seed data,
`BusinessSettings`/`Service`/`Job`/`Review` models, and the shadcn/ui +
Tailwind design system already exist and are reused, not rebuilt.

## 2. Pages & Routes

All under a `(marketing)` route group (no URL segment added):

```
app/(marketing)/
  layout.tsx        SiteHeader + SiteFooter shell
  page.tsx           Home
  services/
    page.tsx          Services listing
    [slug]/page.tsx    Service detail
  about/page.tsx      About
  portfolio/page.tsx  Portfolio
  contact/
    page.tsx           Contact form
    actions.ts         Server action: create inquiry Lead
app/quote/
  page.tsx            Stub: "Full booking wizard — coming in the next phase"
```

`/quote` sits outside the `(marketing)` group (own route, no shared
header/footer requirement yet — the wizard cycle decides its own shell).

**Both CTA labels point to the same route.** "Request a Quote" (primary)
and "Book a Consultation" (secondary) are button copy, not separate flows —
the wizard's Step 6 (from the foundation spec) already handles consultation
scheduling as part of the single intake pipeline, so a second flow would
duplicate that logic. Confirmed in brainstorming.

## 3. Shared Layout

- **SiteHeader**: sticky, wordmark logo (styled `BusinessSettings.name` —
  no image file required), nav links (Home, Services, About, Portfolio,
  Contact), primary CTA button ("Request a Quote" → `/quote`). Mobile:
  collapses to a hamburger menu.
- **SiteFooter**: business info pulled live from `BusinessSettings`
  (address, phone, email), quick links to each marketing page, social links
  rendered only when `facebookUrl`/`instagramUrl` are set, secondary CTA
  ("Book a Consultation" → `/quote`).

Both read `BusinessSettings` via a server-side fetch in the layout — no
hardcoded business identity anywhere in these components, consistent with
the foundation spec's global constraint that the UI renders whatever is in
the database.

## 4. Data Model Addition

One migration on top of the foundation schema:

```prisma
model Job {
  // ...existing fields...
  featuredOnWebsite Boolean @default(false)
}
```

Portfolio and Home query:

```ts
prisma.job.findMany({
  where: { status: "COMPLETED", featuredOnWebsite: true },
  include: { service: true, reviews: { where: { approved: true } } },
})
```

No new tables. `JobPhoto` is intentionally **not** used by this cycle —
see Section 6 (placeholder art) for why featured projects don't need real
photo records yet.

## 5. Seed Data Additions

Extend `prisma/seed.ts` with 4–5 example completed jobs, each with a linked
`Customer`, `Lead` (status `COMPLETED`), `Job` (status `COMPLETED`,
`featuredOnWebsite: true`, realistic `scopeOfWork`, a `completionDate`),
and one approved `Review` (rating, a realistic testimonial quote,
`projectType` matching the job's service). Services represented: a deck,
custom cabinets, a built-in, and a remodel — enough variety for Portfolio
and Home's testimonial section to look populated rather than empty.

## 6. Placeholder Art System

No real project photography exists yet (placeholder business). Rather than
faking photo-realism or using generic stock imagery (licensing risk,
"obviously AI/stock" aesthetic the original brief explicitly warned
against), this cycle builds a small library of **designed, non-photographic
visual treatments**:

`components/marketing/project-art.tsx` — `<ProjectArt service={slug} size=... />`,
a set of hand-built SVG/CSS compositions per service category (wood-grain
planes, joinery-line patterns, tool-silhouette accents, warm amber/charcoal
palette matching the design tokens from the foundation phase). Reused
across Services (per-service page), Portfolio (per featured job, keyed by
`job.service.slug`), and Home (hero + testimonial section).

This keeps the "swap for real photography later" path simple: `ProjectArt`
and a future `<ProjectPhoto url={...} />` component share the same prop
footprint (`service`, `size`, `className`), so replacing one with the other
per-instance is a local change, not a redesign.

## 7. Contact Form

`app/(marketing)/contact/actions.ts` — one server action, `submitContactInquiry`:

1. Zod-validates `name`, `email`, `phone`, `message` (all required except
   phone).
2. Creates a `Customer` (or reuses one matching the submitted email — same
   lookup-or-create pattern the wizard will use in the next cycle).
3. Creates a `Lead`: `serviceId` = the seeded **"Other"** service (already
   present from the foundation seed — no schema change needed for a
   service-less inquiry), `status: NEW`, `source: "contact-form"`,
   `notes` = the message body.
4. Calls the foundation's `NotificationService` to record/send a
   "new booking"-type notification to the business email from
   `BusinessSettings`.

The submitted inquiry appears in the admin Leads list exactly like a
wizard-originated lead once that admin view is built — no separate
"contact inquiries" table or view needed.

## 8. Out of Scope (explicitly)

- The booking wizard itself (`/quote`'s real implementation) — next cycle.
- Real photography / uploaded portfolio images — `JobPhoto` stays unused
  by the public site until a later phase.
- Admin-side controls for `featuredOnWebsite` (toggling it is a direct
  seed/DB edit for now; an admin UI control belongs to the Jobs phase).
- Any change to `(admin)` routes or the auth/settings foundation.

## 9. Testing Approach

- Unit tests for the contact-form Zod schema (mirroring the foundation's
  `settings-validation.test.ts` pattern).
- Integration test for `submitContactInquiry` against the test database
  (creates Customer + Lead, verifies `source`/`serviceId`/`status`), with
  `next/cache`'s `revalidatePath` mocked as established in the foundation
  phase.
- Manual browser verification of each page rendering with live
  `BusinessSettings`/`Service`/seeded `Job`/`Review` data, and of the
  contact form's full submit → Lead-created path.
