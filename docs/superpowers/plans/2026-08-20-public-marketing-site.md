# Public Marketing Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public marketing website (Home, Services, About, Portfolio, Contact) on top of the foundation phase, plus a `/quote` stub so no on-site CTA is dead.

**Architecture:** All marketing pages live under `app/(marketing)/` sharing one server-rendered layout (`SiteHeader` + `SiteFooter`) that reads `BusinessSettings` live — no hardcoded business identity. Visual interest comes from a small hand-built SVG placeholder-art library (`ProjectArt`), not photography, since no real project photos exist yet. Portfolio/testimonial content is driven by real `Job`/`Review` rows (a few seeded as featured completed projects), not a separate content model.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Prisma (existing schema + one new field), Zod, Vitest — all as established in the foundation phase.

**Spec:** `docs/superpowers/specs/2026-08-20-public-marketing-site-design.md` (and the foundation spec `docs/superpowers/specs/2026-08-20-carpentry-booking-system-design.md` for schema/architecture context this cycle builds on)

## Global Constraints

- No hardcoded business identity in components — everything about the business (name, phone, address, hours, socials) renders from `BusinessSettings`, per the foundation spec's global constraints.
- No real photography — visual interest comes from the `ProjectArt` SVG/CSS system (spec section 6), not stock images.
- `/quote`'s real implementation is out of scope — this cycle ships a stub page only (spec section 2/8).
- The `NotificationService` described in the foundation spec's full architecture does not exist yet (it's a later phase). This plan implements only a minimal `queueNotification()` helper that writes a `QUEUED` row to the existing `Notification` table — no real email sending. Do not build a Resend adapter here.
- Both "Request a Quote" and "Book a Consultation" CTAs link to the same `/quote` route — confirmed in brainstorming, no separate consultation-only flow.
- Server-side Zod validation on the contact form mutation, consistent with the foundation phase's validation pattern.

---

### Task 1: Schema Migration — `Job.featuredOnWebsite`

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `Job.featuredOnWebsite: boolean` field, queried by the Portfolio/Home pages built later in this plan.

- [ ] **Step 1: Add the field**

In `prisma/schema.prisma`, in the `Job` model, add after `status`:

```prisma
  status            JobStatus     @default(SCHEDULED)
  featuredOnWebsite Boolean       @default(false)
```

- [ ] **Step 2: Migrate the dev database**

Run: `npx prisma migrate dev --name add_job_featured_on_website`
Expected: migration created and applied with no errors.

- [ ] **Step 3: Migrate the test database**

Run: `npx dotenv -e .env.test -- npx prisma migrate deploy`
Expected: migration applied to `carpentry_test`.

- [ ] **Step 4: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: `lib/generated/prisma` regenerated with the new field on the `Job` type.

- [ ] **Step 5: Commit**

```bash
git add prisma
git commit -m "feat: add Job.featuredOnWebsite for portfolio display"
```

---

### Task 2: Booking Reference Generator

**Files:**
- Create: `lib/booking-ref.ts`, `tests/integration/booking-ref.test.ts`

**Interfaces:**
- Produces: `generateBookingRef(): Promise<string>` from `lib/booking-ref.ts`, consumed by the seed script (Task 4) and the contact form action (Task 11) — every `Lead` requires a unique `bookingRef`.

- [ ] **Step 1: Write the failing test**

`tests/integration/booking-ref.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { generateBookingRef } from "@/lib/booking-ref";

describe("generateBookingRef", () => {
  afterEach(async () => {
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.service.deleteMany();
  });

  it("returns a reference in the CW-YYYY-NNNN format", async () => {
    const ref = await generateBookingRef();
    expect(ref).toMatch(/^CW-\d{4}-\d{4}$/);
  });

  it("never returns a reference already used by an existing Lead", async () => {
    const service = await prisma.service.create({
      data: { name: "Other", slug: "other-test", description: "d" },
    });
    const customer = await prisma.customer.create({
      data: { name: "Jane", phone: "555", email: "jane@example.com" },
    });
    const taken = await generateBookingRef();
    await prisma.lead.create({
      data: {
        bookingRef: taken,
        customerId: customer.id,
        serviceId: service.id,
      },
    });

    const next = await generateBookingRef();
    expect(next).not.toBe(taken);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- booking-ref`
Expected: FAIL — module `@/lib/booking-ref` not found.

- [ ] **Step 3: Implement the generator**

`lib/booking-ref.ts`:

```ts
import { prisma } from "@/lib/db";

function randomSuffix(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function generateBookingRef(): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `CW-${year}-${randomSuffix()}`;
    const existing = await prisma.lead.findUnique({
      where: { bookingRef: candidate },
    });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique booking reference");
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- booking-ref`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add lib/booking-ref.ts tests/integration/booking-ref.test.ts
git commit -m "feat: add booking reference generator"
```

---

### Task 3: Notification Queue Helper

**Files:**
- Create: `lib/notifications.ts`, `tests/integration/notifications.test.ts`

**Interfaces:**
- Produces: `queueNotification(input: QueueNotificationInput): Promise<Notification>` from `lib/notifications.ts`, consumed by the contact form action (Task 11). `QueueNotificationInput = { type: NotificationType; recipientEmail: string; subject: string; body: string; relatedEntityType?: string; relatedEntityId?: string }`.

- [ ] **Step 1: Write the failing test**

`tests/integration/notifications.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { queueNotification } from "@/lib/notifications";
import { NotificationType } from "@/lib/generated/prisma/client";

describe("queueNotification", () => {
  afterEach(async () => {
    await prisma.notification.deleteMany();
  });

  it("writes a QUEUED notification row", async () => {
    const notification = await queueNotification({
      type: NotificationType.NEW_BOOKING,
      recipientEmail: "owner@example.com",
      subject: "New inquiry",
      body: "Someone submitted the contact form.",
      relatedEntityType: "Lead",
      relatedEntityId: "lead_123",
    });

    expect(notification.status).toBe("QUEUED");
    expect(notification.sentAt).toBeNull();

    const found = await prisma.notification.findUnique({
      where: { id: notification.id },
    });
    expect(found?.subject).toBe("New inquiry");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- notifications`
Expected: FAIL — module `@/lib/notifications` not found.

- [ ] **Step 3: Implement the queue helper**

`lib/notifications.ts`:

```ts
import { prisma } from "@/lib/db";
import type { NotificationType } from "@/lib/generated/prisma/client";

export interface QueueNotificationInput {
  type: NotificationType;
  recipientEmail: string;
  subject: string;
  body: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export async function queueNotification(input: QueueNotificationInput) {
  return prisma.notification.create({
    data: {
      type: input.type,
      recipientEmail: input.recipientEmail,
      subject: input.subject,
      body: input.body,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
    },
  });
}
```

(No real email sending yet — see Global Constraints. A later Notifications
phase adds a Resend-backed sender that processes `QUEUED` rows.)

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- notifications`
Expected: PASS (1/1).

- [ ] **Step 5: Commit**

```bash
git add lib/notifications.ts tests/integration/notifications.test.ts
git commit -m "feat: add notification queue helper"
```

---

### Task 4: Seed Data — Featured Portfolio Jobs

**Files:**
- Modify: `prisma/seed.ts`

**Interfaces:**
- Consumes: `generateBookingRef` from `lib/booking-ref.ts`.
- Produces: 4 seeded `Job` rows (`status: COMPLETED`, `featuredOnWebsite: true`) each with a `Customer`, `Lead`, and one approved `Review` — consumed by the Portfolio (Task 10) and Home (Task 7) pages.

- [ ] **Step 1: Extend the seed script**

In `prisma/seed.ts`, import the generator and add, after the existing `AdminUser` seeding block (before the final `console.log`):

```ts
import { generateBookingRef } from "../lib/booking-ref";
```

(add this import at the top of the file alongside the existing imports)

```ts
  await prisma.review.deleteMany();
  await prisma.job.deleteMany();

  const featuredProjects = [
    {
      serviceSlug: "deck-construction",
      customerName: "Michael Torres",
      customerEmail: "michael.torres@example.com",
      scopeOfWork:
        "Full replacement of an aging 300 sq ft deck with pressure-treated framing and cedar decking, including a new stair landing and cable railing.",
      rating: 5,
      review:
        "Heritage Fine Carpentry rebuilt our deck from the ground up and it completely changed how we use our backyard. The joinery work is beautiful up close and the crew kept the site spotless the whole time.",
    },
    {
      serviceSlug: "custom-cabinets",
      customerName: "Priya Anand",
      customerEmail: "priya.anand@example.com",
      scopeOfWork:
        "Custom kitchen cabinetry for a 12x14 kitchen remodel: 18 upper and lower units in painted maple with soft-close hardware and a matching island.",
      rating: 5,
      review:
        "The cabinets are exactly what we pictured but couldn't find off the shelf. Every drawer and door is perfectly aligned, and they worked around our schedule without a single missed date.",
    },
    {
      serviceSlug: "built-ins",
      customerName: "Sarah Whitfield",
      customerEmail: "sarah.whitfield@example.com",
      scopeOfWork:
        "Floor-to-ceiling built-in bookcases and a window seat with hidden storage for a home office, finished to match existing trim.",
      rating: 5,
      review:
        "You would never know the built-ins weren't original to the house. The attention to matching our existing trim profile was something other contractors didn't even mention.",
    },
    {
      serviceSlug: "remodeling",
      customerName: "David Chen",
      customerEmail: "david.chen@example.com",
      scopeOfWork:
        "Structural and finish carpentry for a two-room addition remodel, including new framing, trim, and door installation throughout.",
      rating: 4,
      review:
        "Solid, reliable work from a crew that communicated clearly at every stage. The finish carpentry on the trim and doors is what really stood out to us.",
    },
  ];

  for (const project of featuredProjects) {
    const service = await prisma.service.findUniqueOrThrow({
      where: { slug: project.serviceSlug },
    });
    const customer = await prisma.customer.create({
      data: {
        name: project.customerName,
        phone: "555-010-0100",
        email: project.customerEmail,
      },
    });
    const lead = await prisma.lead.create({
      data: {
        bookingRef: await generateBookingRef(),
        customerId: customer.id,
        serviceId: service.id,
        status: "COMPLETED",
        source: "seed",
      },
    });
    const job = await prisma.job.create({
      data: {
        leadId: lead.id,
        customerId: customer.id,
        status: "COMPLETED",
        featuredOnWebsite: true,
        scopeOfWork: project.scopeOfWork,
        addressStreet: "100 Example St",
        addressCity: "Riverton",
        addressState: "OH",
        addressZip: "45501",
        completionDate: new Date(),
      },
    });
    await prisma.review.create({
      data: {
        jobId: job.id,
        customerId: customer.id,
        rating: project.rating,
        body: project.review,
        projectType: service.name,
        approved: true,
      },
    });
  }
```

- [ ] **Step 2: Re-run the seed and verify**

Run: `npm run db:seed`
Expected: seed completes with no errors.

- [ ] **Step 3: Spot-check row counts**

Write a throwaway check (or use `npx prisma studio`) to confirm 4 `Job` rows exist with `featuredOnWebsite = true`, each with exactly one approved `Review`. Delete any throwaway script afterward — don't commit it.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: seed featured portfolio jobs and reviews"
```

---

### Task 5: ProjectArt Placeholder Component

**Files:**
- Create: `components/marketing/project-art.tsx`

**Interfaces:**
- Produces: `<ProjectArt service={slug} size="sm" | "md" | "lg" className={...} />`, consumed by the Services (Task 8), Portfolio (Task 10), and Home (Task 7) pages.

- [ ] **Step 1: Build the component**

`components/marketing/project-art.tsx`:

```tsx
const SIZE_CLASSES = {
  sm: "h-32",
  md: "h-48",
  lg: "h-72",
} as const;

type ProjectArtSize = keyof typeof SIZE_CLASSES;

function DeckPattern() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="200" fill="var(--color-muted)" />
      {Array.from({ length: 8 }).map((_, i) => (
        <rect key={i} x={i * 42} y="0" width="34" height="200" fill="var(--color-secondary)" />
      ))}
      {Array.from({ length: 4 }).map((_, i) => (
        <line
          key={i}
          x1="0"
          y1={i * 55 + 20}
          x2="320"
          y2={i * 55 + 20}
          stroke="var(--color-accent)"
          strokeWidth="2"
          opacity="0.5"
        />
      ))}
    </svg>
  );
}

function CabinetPattern() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="200" fill="var(--color-muted)" />
      {[0, 1, 2, 3].map((col) =>
        [0, 1].map((row) => (
          <rect
            key={`${col}-${row}`}
            x={col * 80 + 6}
            y={row * 100 + 6}
            width="68"
            height="88"
            rx="3"
            fill="var(--color-secondary)"
            stroke="var(--color-accent)"
            strokeWidth="1.5"
          />
        ))
      )}
      {[0, 1, 2, 3].map((col) => (
        <circle key={col} cx={col * 80 + 62} cy="50" r="2.5" fill="var(--color-accent)" />
      ))}
    </svg>
  );
}

function BuiltInPattern() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="200" fill="var(--color-muted)" />
      {[0, 1, 2, 3, 4].map((row) => (
        <rect key={row} x="10" y={row * 38 + 6} width="300" height="6" fill="var(--color-accent)" opacity="0.6" />
      ))}
      {[70, 150, 230].map((x) => (
        <rect key={x} x={x} y="6" width="6" height="188" fill="var(--color-secondary)" />
      ))}
    </svg>
  );
}

function RemodelPattern() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="200" fill="var(--color-muted)" />
      <polyline
        points="10,190 10,40 160,10 310,40 310,190"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2"
      />
      <line x1="10" y1="120" x2="310" y2="120" stroke="var(--color-secondary)" strokeWidth="2" />
      <line x1="160" y1="10" x2="160" y2="190" stroke="var(--color-secondary)" strokeWidth="2" opacity="0.6" />
    </svg>
  );
}

function DefaultPattern() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="200" fill="var(--color-muted)" />
      {Array.from({ length: 6 }).map((_, i) => (
        <path
          key={i}
          d={`M0 ${i * 36 + 10} Q 80 ${i * 36 - 10}, 160 ${i * 36 + 10} T 320 ${i * 36 + 10}`}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.5"
          opacity="0.5"
        />
      ))}
    </svg>
  );
}

const PATTERNS: Record<string, () => React.ReactElement> = {
  "deck-construction": DeckPattern,
  "custom-cabinets": CabinetPattern,
  "built-ins": BuiltInPattern,
  remodeling: RemodelPattern,
};

export function ProjectArt({
  service,
  size = "md",
  className,
}: {
  service: string;
  size?: ProjectArtSize;
  className?: string;
}) {
  const Pattern = PATTERNS[service] ?? DefaultPattern;
  return (
    <div className={`overflow-hidden rounded-lg ${SIZE_CLASSES[size]} ${className ?? ""}`}>
      <Pattern />
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add components/marketing/project-art.tsx
git commit -m "feat: add ProjectArt placeholder visual system"
```

---

### Task 6: Display Font, SiteHeader, SiteFooter, and Marketing Layout

**Files:**
- Modify: `app/layout.tsx`, `app/globals.css`
- Create: `components/marketing/site-header.tsx`, `components/marketing/site-footer.tsx`, `app/(marketing)/layout.tsx`

**Interfaces:**
- Consumes: `getBusinessSettings()` from `lib/settings.ts` (foundation phase).
- Produces: a `--font-serif` CSS variable and `font-serif` Tailwind utility backed by a real display typeface (the foundation phase only set up sans/mono), and the shared shell every marketing page (Tasks 7–11) renders inside.

- [ ] **Step 1: Load a display serif font**

The foundation phase wired up Geist Sans/Mono but no serif — `font-serif` currently
falls back to the browser's generic system serif, undermining the "strong
typography" requirement. Fix this before building any heading-heavy marketing
page.

Modify `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import { getBusinessSettings } from "@/lib/settings";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getBusinessSettings();
  return {
    title: settings.name,
    description: `Custom carpentry and remodeling by ${settings.name}.`,
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

In `app/globals.css`, in the `@theme inline` block, change the existing
`--font-heading` mapping so `font-serif` resolves to Fraunces instead of the
Tailwind default:

```css
  --font-sans: var(--font-sans);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-sans);
  --font-serif: var(--font-fraunces);
```

(add the `--font-serif` line — don't remove the existing three)

- [ ] **Step 2: Verify the font loads**

Run: `npm run build`
Expected: no errors; the "Recent Work"/heading test in Task 7's manual
verification will visually confirm Fraunces is rendering once that page
exists.

- [ ] **Step 3: Commit the font change on its own**

```bash
git add app/layout.tsx app/globals.css
git commit -m "feat: add Fraunces display serif for marketing headings"
```

- [ ] **Step 4: Build the header**

`components/marketing/site-header.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/about", label: "About" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader({ businessName }: { businessName: string }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-serif text-xl font-semibold tracking-tight">
          {businessName}
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-foreground/80 hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <Button nativeButton={false} render={<Link href="/quote" />}>Request a Quote</Button>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Build the footer**

`components/marketing/site-footer.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { BusinessSettings } from "@/lib/generated/prisma/client";

const QUICK_LINKS = [
  { href: "/services", label: "Services" },
  { href: "/about", label: "About" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/contact", label: "Contact" },
];

export function SiteFooter({ settings }: { settings: BusinessSettings }) {
  return (
    <footer className="border-t bg-secondary/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 md:grid-cols-3">
        <div>
          <p className="font-serif text-lg font-semibold">{settings.name}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {settings.addressStreet}
            <br />
            {settings.addressCity}, {settings.addressState} {settings.addressZip}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {settings.phone} &middot; {settings.email}
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold">Quick Links</p>
          <ul className="mt-3 space-y-2">
            {QUICK_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          {(settings.facebookUrl || settings.instagramUrl) && (
            <div className="mt-4 flex gap-4">
              {settings.facebookUrl && (
                <a href={settings.facebookUrl} className="text-sm text-muted-foreground hover:text-foreground">
                  Facebook
                </a>
              )}
              {settings.instagramUrl && (
                <a href={settings.instagramUrl} className="text-sm text-muted-foreground hover:text-foreground">
                  Instagram
                </a>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm font-semibold">Ready to start your project?</p>
          <Button variant="secondary" nativeButton={false} render={<Link href="/quote" />}>
            Book a Consultation
          </Button>
        </div>
      </div>
      <div className="border-t px-6 py-4 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} {settings.name}. All rights reserved.
      </div>
    </footer>
  );
}
```

- [ ] **Step 6: Build the layout**

`app/(marketing)/layout.tsx`:

```tsx
import { getBusinessSettings } from "@/lib/settings";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getBusinessSettings();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader businessName={settings.name} />
      <div className="flex-1">{children}</div>
      <SiteFooter settings={settings} />
    </div>
  );
}
```

- [ ] **Step 7: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no type errors (page content for `(marketing)` doesn't exist yet, so this only validates the layout/header/footer themselves — full route verification happens once pages exist in later tasks).

- [ ] **Step 8: Commit**

```bash
git add components/marketing/site-header.tsx components/marketing/site-footer.tsx "app/(marketing)/layout.tsx"
git commit -m "feat: add marketing site header, footer, and shared layout"
```

---

### Task 7: Home Page

**Files:**
- Create: `app/(marketing)/page.tsx`

**Interfaces:**
- Consumes: `prisma` (foundation `lib/db.ts`), `getBusinessSettings()`, `ProjectArt` (Task 5).

- [ ] **Step 1: Build the page**

`app/(marketing)/page.tsx`:

```tsx
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getBusinessSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { ProjectArt } from "@/components/marketing/project-art";

export default async function HomePage() {
  const [settings, featuredJobs] = await Promise.all([
    getBusinessSettings(),
    prisma.job.findMany({
      where: { status: "COMPLETED", featuredOnWebsite: true },
      include: {
        lead: { include: { service: true } },
        reviews: { where: { approved: true }, take: 1 },
      },
      take: 3,
    }),
  ]);

  return (
    <div>
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">
            Serving {settings.addressCity} and the surrounding area
          </p>
          <h1 className="mt-4 font-serif text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Custom carpentry, built to last generations.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            {settings.name} brings honest craftsmanship to every project, from a single
            built-in to a full remodel. Licensed, insured, and focused on getting the
            details right.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Button size="lg" nativeButton={false} render={<Link href="/quote" />}>
              Request a Quote
            </Button>
            <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/quote" />}>
              Book a Consultation
            </Button>
          </div>
        </div>
      </section>

      <section className="border-y bg-secondary/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-serif text-2xl font-semibold">Recent Work</h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {featuredJobs.map((job) => (
              <div key={job.id}>
                <ProjectArt service={job.lead.service.slug} size="md" />
                <p className="mt-4 text-sm font-semibold">{job.lead.service.name}</p>
                {job.reviews[0] && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    &ldquo;{job.reviews[0].body}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="mt-10">
            <Button variant="outline" nativeButton={false} render={<Link href="/portfolio" />}>
              View Full Portfolio
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h2 className="font-serif text-2xl font-semibold">Ready to get started?</h2>
        <p className="mt-3 text-muted-foreground">
          Tell us about your project and we&apos;ll follow up to schedule a consultation.
        </p>
        <div className="mt-6">
          <Button size="lg" nativeButton={false} render={<Link href="/quote" />}>
            Request a Quote
          </Button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run `npm run dev`, visit `/`, confirm the hero renders with live `BusinessSettings` values, the three featured jobs render with `ProjectArt` and a testimonial quote, and both CTAs link to `/quote`.

- [ ] **Step 3: Commit**

```bash
git add "app/(marketing)/page.tsx"
git commit -m "feat: add marketing home page"
```

---

### Task 8: Services Listing and Detail Pages

**Files:**
- Create: `app/(marketing)/services/page.tsx`, `app/(marketing)/services/[slug]/page.tsx`

**Interfaces:**
- Consumes: `prisma.service` (foundation schema), `ProjectArt`.

- [ ] **Step 1: Build the listing page**

`app/(marketing)/services/page.tsx`:

```tsx
import Link from "next/link";
import { prisma } from "@/lib/db";
import { ProjectArt } from "@/components/marketing/project-art";

export default async function ServicesPage() {
  const services = await prisma.service.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <h1 className="font-serif text-3xl font-semibold">Services</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        From a single repair to a full remodel, here&apos;s what we build.
      </p>
      <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => (
          <Link
            key={service.id}
            href={`/services/${service.slug}`}
            className="group block rounded-lg border p-4 transition-colors hover:border-accent"
          >
            <ProjectArt service={service.slug} size="sm" />
            <p className="mt-4 font-semibold group-hover:text-accent">{service.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{service.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build the detail page**

`app/(marketing)/services/[slug]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { ProjectArt } from "@/components/marketing/project-art";

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = await prisma.service.findUnique({ where: { slug } });

  if (!service || !service.active) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <Link href="/services" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; All Services
      </Link>
      <div className="mt-6 grid gap-10 md:grid-cols-2 md:items-center">
        <div>
          <h1 className="font-serif text-3xl font-semibold">{service.name}</h1>
          <p className="mt-4 text-muted-foreground">{service.description}</p>
          <div className="mt-8">
            <Button size="lg" nativeButton={false} render={<Link href="/quote" />}>
              Request a Quote for {service.name}
            </Button>
          </div>
        </div>
        <ProjectArt service={service.slug} size="lg" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification**

Run `npm run dev`, visit `/services`, confirm all 13 seeded services render with distinct `ProjectArt` per category (4 categories get their specific pattern, the rest fall back to the default). Click into a couple of detail pages, confirm the CTA text includes the service name. Visit `/services/does-not-exist`, confirm a 404.

- [ ] **Step 4: Commit**

```bash
git add "app/(marketing)/services"
git commit -m "feat: add services listing and detail pages"
```

---

### Task 9: About Page

**Files:**
- Create: `app/(marketing)/about/page.tsx`

- [ ] **Step 1: Build the page**

`app/(marketing)/about/page.tsx`:

```tsx
import { getBusinessSettings } from "@/lib/settings";

export default async function AboutPage() {
  const settings = await getBusinessSettings();

  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="font-serif text-3xl font-semibold">About {settings.name}</h1>
      <div className="mt-8 space-y-6 text-muted-foreground">
        <p>
          {settings.name} is a family-owned carpentry business built on a simple idea:
          do the work right, even the parts no one will ever see. Every project, from a
          small repair to a full remodel, gets the same attention to detail and honest
          communication from first estimate to final walkthrough.
        </p>
        <p>
          We&apos;re licensed and insured, and we stand behind every job we finish. Our
          crew works in {settings.addressCity} and the surrounding area, and we keep our
          project list intentionally manageable so every client gets real attention, not
          just a spot in a queue.
        </p>
        <p>
          Whether you need a single built-in or a structural remodel, we handle the
          project the same way: a clear scope, a fair price, and a finished result that
          holds up for years, not just until the next inspection.
        </p>
      </div>
      <div className="mt-12 grid gap-8 sm:grid-cols-3">
        <div>
          <p className="font-serif text-3xl font-semibold text-accent">Licensed</p>
          <p className="mt-1 text-sm text-muted-foreground">& fully insured</p>
        </div>
        <div>
          <p className="font-serif text-3xl font-semibold text-accent">Local</p>
          <p className="mt-1 text-sm text-muted-foreground">
            based in {settings.addressCity}, {settings.addressState}
          </p>
        </div>
        <div>
          <p className="font-serif text-3xl font-semibold text-accent">Hands-on</p>
          <p className="mt-1 text-sm text-muted-foreground">owner involved on every job</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run `npm run dev`, visit `/about`, confirm the city/state/name interpolate correctly from `BusinessSettings`.

- [ ] **Step 3: Commit**

```bash
git add "app/(marketing)/about"
git commit -m "feat: add about page"
```

---

### Task 10: Portfolio Page

**Files:**
- Create: `app/(marketing)/portfolio/page.tsx`

- [ ] **Step 1: Build the page**

`app/(marketing)/portfolio/page.tsx`:

```tsx
import { prisma } from "@/lib/db";
import { ProjectArt } from "@/components/marketing/project-art";

export default async function PortfolioPage() {
  const featuredJobs = await prisma.job.findMany({
    where: { status: "COMPLETED", featuredOnWebsite: true },
    include: {
      lead: { include: { service: true } },
      reviews: { where: { approved: true }, take: 1 },
    },
    orderBy: { completionDate: "desc" },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <h1 className="font-serif text-3xl font-semibold">Portfolio</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        A sample of recent projects across the services we offer.
      </p>
      <div className="mt-10 grid gap-10 md:grid-cols-2">
        {featuredJobs.map((job) => (
          <article key={job.id} className="rounded-lg border p-6">
            <ProjectArt service={job.lead.service.slug} size="lg" />
            <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-accent">
              {job.lead.service.name}
            </p>
            <p className="mt-2 text-muted-foreground">{job.scopeOfWork}</p>
            {job.reviews[0] && (
              <blockquote className="mt-4 border-l-2 border-accent pl-4 text-sm italic text-muted-foreground">
                &ldquo;{job.reviews[0].body}&rdquo;
              </blockquote>
            )}
          </article>
        ))}
      </div>
      {featuredJobs.length === 0 && (
        <p className="mt-10 text-muted-foreground">
          New project photos coming soon — check back shortly.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run `npm run dev`, visit `/portfolio`, confirm the 4 seeded featured jobs render with their scope, service-specific `ProjectArt`, and review quote.

- [ ] **Step 3: Commit**

```bash
git add "app/(marketing)/portfolio"
git commit -m "feat: add portfolio page"
```

---

### Task 11: Contact Page and Server Action

**Files:**
- Create: `app/(marketing)/contact/page.tsx`, `app/(marketing)/contact/actions.ts`, `tests/unit/contact-validation.test.ts`, `tests/integration/contact-actions.test.ts`

**Interfaces:**
- Consumes: `generateBookingRef` (Task 2), `queueNotification` (Task 3), `prisma` (foundation), `getBusinessSettings` (foundation).
- Produces: `contactFormSchema`, `submitContactInquiry(formData: FormData): Promise<{ error: Record<string, string[]> | null }>`.

- [ ] **Step 1: Write the failing validation test**

`tests/unit/contact-validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { contactFormSchema } from "@/app/(marketing)/contact/actions";

describe("contactFormSchema", () => {
  it("accepts a valid submission", () => {
    const result = contactFormSchema.safeParse({
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "555-010-0100",
      message: "I'd like a quote for a new deck.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an omitted phone", () => {
    const result = contactFormSchema.safeParse({
      name: "Jane Doe",
      email: "jane@example.com",
      message: "I'd like a quote for a new deck.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing message", () => {
    const result = contactFormSchema.safeParse({
      name: "Jane Doe",
      email: "jane@example.com",
      message: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = contactFormSchema.safeParse({
      name: "Jane Doe",
      email: "not-an-email",
      message: "Hello",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- contact-validation`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the failing integration test**

`tests/integration/contact-actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { submitContactInquiry } = await import("@/app/(marketing)/contact/actions");

function formData(values: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) fd.set(key, value);
  return fd;
}

describe("submitContactInquiry", () => {
  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "contact-test@example.com" } });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.customer.deleteMany({ where: { email: "contact-test@example.com" } });
  });

  it("creates a Customer, a Lead sourced from the contact form, and a queued notification", async () => {
    const result = await submitContactInquiry(
      formData({
        name: "Contact Tester",
        email: "contact-test@example.com",
        phone: "555-010-0199",
        message: "I have a question about fence installation.",
      })
    );

    expect(result.error).toBeNull();

    const customer = await prisma.customer.findFirst({
      where: { email: "contact-test@example.com" },
    });
    expect(customer).not.toBeNull();

    const lead = await prisma.lead.findFirst({
      where: { customerId: customer!.id },
      include: { service: true },
    });
    expect(lead?.source).toBe("contact-form");
    expect(lead?.service.slug).toBe("other");
    expect(lead?.notes).toContain("fence installation");

    const notification = await prisma.notification.findFirst({
      where: { relatedEntityId: lead!.id },
    });
    expect(notification?.status).toBe("QUEUED");
  });

  it("rejects an invalid submission without creating any records", async () => {
    const result = await submitContactInquiry(
      formData({ name: "", email: "not-an-email", message: "" })
    );

    expect(result.error).not.toBeNull();
    const customer = await prisma.customer.findFirst({
      where: { email: "contact-test@example.com" },
    });
    expect(customer).toBeNull();
  });
});
```

- [ ] **Step 4: Run it and confirm it fails**

Run: `npm run test -- contact-actions`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement the server action**

`app/(marketing)/contact/actions.ts`:

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { generateBookingRef } from "@/lib/booking-ref";
import { queueNotification } from "@/lib/notifications";
import { getBusinessSettings } from "@/lib/settings";
import { NotificationType } from "@/lib/generated/prisma/client";

export const contactFormSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  message: z.string().min(1),
});

export async function submitContactInquiry(formData: FormData) {
  const parsed = contactFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }
  const { name, email, phone, message } = parsed.data;

  const otherService = await prisma.service.findUniqueOrThrow({
    where: { slug: "other" },
  });

  let customer = await prisma.customer.findFirst({ where: { email } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: { name, email, phone: phone ?? "" },
    });
  }

  const lead = await prisma.lead.create({
    data: {
      bookingRef: await generateBookingRef(),
      customerId: customer.id,
      serviceId: otherService.id,
      status: "NEW",
      source: "contact-form",
      notes: message,
    },
  });

  const settings = await getBusinessSettings();
  await queueNotification({
    type: NotificationType.NEW_BOOKING,
    recipientEmail: settings.email,
    subject: `New contact form inquiry from ${name}`,
    body: message,
    relatedEntityType: "Lead",
    relatedEntityId: lead.id,
  });

  revalidatePath("/contact");
  return { error: null };
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npm run test -- contact`
Expected: PASS (6/6 across both files).

- [ ] **Step 7: Build the contact page**

`app/(marketing)/contact/page.tsx`:

```tsx
import { getBusinessSettings } from "@/lib/settings";
import { ContactForm } from "@/components/marketing/contact-form";

export default async function ContactPage() {
  const settings = await getBusinessSettings();

  return (
    <div className="mx-auto grid max-w-5xl gap-12 px-6 py-20 md:grid-cols-2">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Contact Us</h1>
        <p className="mt-3 text-muted-foreground">
          Have a question before requesting a full quote? Send us a message and
          we&apos;ll get back to you.
        </p>
        <div className="mt-8 space-y-2 text-sm text-muted-foreground">
          <p>{settings.phone}</p>
          <p>{settings.email}</p>
          <p>
            {settings.addressStreet}, {settings.addressCity}, {settings.addressState}{" "}
            {settings.addressZip}
          </p>
        </div>
      </div>
      <ContactForm />
    </div>
  );
}
```

- [ ] **Step 8: Build the client form component**

`components/marketing/contact-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitContactInquiry } from "@/app/(marketing)/contact/actions";

export function ContactForm() {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await submitContactInquiry(formData);
          setStatus(result.error ? "error" : "sent");
        })
      }
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input id="phone" name="phone" type="tel" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">Message</Label>
        <Textarea id="message" name="message" rows={5} required />
      </div>
      {status === "error" && (
        <p className="text-sm text-red-600">Please check the form and try again.</p>
      )}
      {status === "sent" && (
        <p className="text-sm text-green-700">
          Thanks — we received your message and will be in touch soon.
        </p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Sending..." : "Send Message"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 9: Manual verification**

Run `npm run dev`, visit `/contact`, submit the form with valid data, confirm the success message appears and a new `Lead` (source `contact-form`) shows up via `npx prisma studio`. Submit again with an invalid email, confirm the error message appears and no new record is created.

- [ ] **Step 10: Commit**

```bash
git add "app/(marketing)/contact" components/marketing/contact-form.tsx tests/unit/contact-validation.test.ts tests/integration/contact-actions.test.ts
git commit -m "feat: add contact page with lead-creating server action"
```

---

### Task 12: `/quote` Stub Page

**Files:**
- Create: `app/quote/page.tsx`

- [ ] **Step 1: Build the stub**

`app/quote/page.tsx`:

```tsx
import Link from "next/link";
import { getBusinessSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";

export default async function QuoteStubPage() {
  const settings = await getBusinessSettings();

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="font-serif text-3xl font-semibold">Our online booking wizard is almost ready</h1>
      <p className="mt-4 text-muted-foreground">
        In the meantime, call or email us directly and we&apos;ll get your project scheduled.
      </p>
      <div className="mt-6 space-y-1 text-sm">
        <p className="font-medium">{settings.phone}</p>
        <p className="font-medium">{settings.email}</p>
      </div>
      <div className="mt-8">
        <Button variant="outline" nativeButton={false} render={<Link href="/contact" />}>
          Send a Message Instead
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run `npm run dev`, click "Request a Quote" and "Book a Consultation" from the header, footer, and Home page — confirm all land on this stub with live business phone/email.

- [ ] **Step 3: Commit**

```bash
git add app/quote
git commit -m "feat: add /quote stub page"
```

---

### Task 13: Full Verification Pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass, including the new booking-ref, notifications, and contact tests.

- [ ] **Step 2: Run a full production build**

Run: `npm run build`
Expected: no type errors, no build failures. Confirm `/`, `/services`, `/services/[slug]`, `/about`, `/portfolio`, `/contact`, and `/quote` all appear in the route list.

- [ ] **Step 3: End-to-end manual walkthrough**

Run `npm run dev` and confirm, in a browser:
1. Every marketing page loads with the shared header/footer and live `BusinessSettings` data (no hardcoded business name/address anywhere).
2. Services listing shows all 13 seeded services; at least one detail page for each of the 4 categories with custom `ProjectArt` renders its specific pattern, and an "Other"-type service falls back to the default pattern.
3. Portfolio and Home both show the 4 seeded featured jobs with reviews.
4. Contact form: valid submission creates a Lead and a queued Notification (verify via `npx prisma studio`); invalid submission shows inline errors and creates nothing.
5. Both "Request a Quote" and "Book a Consultation" CTAs across the site land on the `/quote` stub.
6. Confirm the existing `/admin/*` routes and login flow from the foundation phase still work unaffected.

- [ ] **Step 4: Tag the milestone**

```bash
git add -A
git commit -m "chore: complete public marketing site phase" --allow-empty
git tag phase-2-marketing-site
```
