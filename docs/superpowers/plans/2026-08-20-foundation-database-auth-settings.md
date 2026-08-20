# Foundation, Database, Auth & Business Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js/Prisma/Auth.js foundation for the carpentry booking system: full database schema, admin authentication, and a working Business Settings screen — the first independently testable slice (phases 1-4 of the overall roadmap).

**Architecture:** Single Next.js 15 App Router app. Business logic lives in `lib/`, never inline in components. Auth.js v5 Credentials provider with JWT sessions (no OAuth, so no adapter-backed Session/Account tables needed) protects everything under `/admin`. Prisma owns the full relational schema for all future phases, migrated now so later phases build features against existing tables rather than repeatedly altering the schema.

**Tech Stack:** Next.js 15 (App Router, TypeScript), Tailwind CSS, shadcn/ui, Prisma + PostgreSQL, Auth.js v5 (Credentials, JWT sessions), Zod, bcryptjs, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-20-carpentry-booking-system-design.md`

## Global Constraints

- Single business, no tenant/organization tables — confirmed in spec section 1.
- No card data touches the server; Stripe is out of scope for this plan (later phase).
- Local-disk file storage behind a `Storage` interface (spec section 2) — swappable later, not cloud-backed now.
- Server-side Zod validation on every mutation (spec section 7).
- Passwords hashed with bcrypt; no adapter/OAuth complexity (spec section 3, confirmed in brainstorming: Credentials + JWT, not database sessions).
- Business identity is placeholder content for now, fully data-driven through `BusinessSettings` (spec section 1) — nothing about "Heritage Fine Carpentry" or its seeded values may be hardcoded into UI copy; the UI must render whatever is in the database.

---

### Task 1: Project Scaffold & Git Init

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `.env.example`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

**Interfaces:**
- Produces: a runnable Next.js 15 + TypeScript + Tailwind project at the repo root, with git initialized.

- [ ] **Step 1: Scaffold the Next.js app**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm --yes
```

- [ ] **Step 2: Verify the build works**

Run: `npm run build`
Expected: build completes with no errors, `.next/` output produced.

- [ ] **Step 3: Add environment variable template**

Create `.env.example`:

```
DATABASE_URL="postgresql://user:password@localhost:5432/carpentry_dev"
AUTH_SECRET="replace-with-output-of: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
RESEND_API_KEY=""
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
```

Copy it to `.env` (gitignored by create-next-app's default `.gitignore`) and leave `DATABASE_URL`/`AUTH_SECRET` to be filled in Task 3/7.

- [ ] **Step 4: Initialize git and commit**

```bash
git init
git add .
git commit -m "chore: scaffold Next.js project"
```

---

### Task 2: Design Tokens & shadcn/ui Base Components

**Files:**
- Create: `components.json`, `lib/utils.ts`, `components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/label.tsx`, `components/ui/card.tsx`, `components/ui/textarea.tsx`, `components/ui/select.tsx`, `components/ui/switch.tsx`, `components/ui/table.tsx`, `components/ui/badge.tsx`
- Modify: `app/globals.css`, `tailwind.config.ts`

**Interfaces:**
- Produces: `cn()` helper in `lib/utils.ts`, and the shadcn primitive components under `components/ui/`, used by every later UI task in this and future plans.

- [ ] **Step 1: Initialize shadcn/ui**

```bash
npx shadcn@latest init -d
```

(Accept the New York style, neutral base color, CSS variables enabled — these are shadcn's own defaults and are fine as a starting point since we restyle tokens next.)

- [ ] **Step 2: Add the base component set**

```bash
npx shadcn@latest add button input label card textarea select switch table badge
```

- [ ] **Step 3: Restyle CSS variable tokens for a contractor palette**

In `app/globals.css`, replace the generated `:root` and `.dark` color variables with a calmer, premium palette — deep charcoal/navy primary, warm amber accent, warm off-white background (edit the existing `--primary`, `--accent`, `--background`, `--foreground`, `--muted`, `--border` HSL values shadcn generated; do not add new variable names, keep the same variable contract shadcn's components already consume).

- [ ] **Step 4: Verify components render**

Replace `app/page.tsx` with a minimal placeholder using the new `Button`:

```tsx
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <Button>Request a Quote</Button>
    </main>
  )
}
```

Run: `npm run build`
Expected: builds successfully; visually confirm via `npm run dev` that the button renders with the restyled palette.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add shadcn/ui base components and design tokens"
```

---

### Task 3: Prisma Schema & Migration

**Files:**
- Create: `prisma/schema.prisma`

**Interfaces:**
- Produces: every model listed in spec section 4, migrated into the developer's local Postgres database. All later tasks/phases build against these exact model and field names.

- [ ] **Step 1: Install Prisma**

```bash
npm install -D prisma
npm install @prisma/client
npx prisma init --datasource-provider postgresql
```

- [ ] **Step 2: Set `DATABASE_URL`**

In `.env`, point `DATABASE_URL` at a local database named `carpentry_dev` (create it first if it doesn't exist, e.g. `psql -U postgres -c "CREATE DATABASE carpentry_dev"` or via whatever Postgres client is already installed).

- [ ] **Step 3: Write the full schema**

Replace `prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum LeadStatus {
  NEW
  CONTACTED
  CONSULTATION_SCHEDULED
  ESTIMATE_SENT
  FOLLOW_UP
  APPROVED
  SCHEDULED
  COMPLETED
  LOST
}

enum AppointmentType {
  CONSULTATION
  FOLLOW_UP
  JOB_VISIT
}

enum AppointmentStatus {
  SCHEDULED
  COMPLETED
  CANCELLED
  NO_SHOW
}

enum QuoteStatus {
  DRAFT
  SENT
  VIEWED
  ACCEPTED
  DECLINED
  EXPIRED
}

enum QuoteItemType {
  LABOR
  MATERIAL
  OPTIONAL
}

enum JobStatus {
  SCHEDULED
  IN_PROGRESS
  ON_HOLD
  COMPLETED
  CANCELLED
}

enum JobLineItemType {
  LABOR
  MATERIAL
}

enum JobPhotoPhase {
  BEFORE
  DURING
  AFTER
}

enum InvoiceType {
  DEPOSIT
  PARTIAL
  FINAL
}

enum InvoiceStatus {
  UNPAID
  PARTIALLY_PAID
  PAID
  VOID
}

enum PaymentStatus {
  PENDING
  SUCCEEDED
  FAILED
  REFUNDED
}

enum NotificationType {
  NEW_BOOKING
  BOOKING_CONFIRMATION
  APPOINTMENT_REMINDER
  APPOINTMENT_CANCELLATION
  QUOTE_SENT
  QUOTE_ACCEPTED
  PAYMENT_RECEIVED
  JOB_COMPLETED
  REVIEW_REQUEST
}

enum NotificationStatus {
  QUEUED
  SENT
  FAILED
}

enum ServiceQuestionFieldType {
  TEXT
  NUMBER
  SELECT
  BOOLEAN
  TEXTAREA
}

model AdminUser {
  id           String     @id @default(cuid())
  email        String     @unique
  passwordHash String
  name         String
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  leadNotes    LeadNote[]
  auditLogs    AuditLog[]
}

model BusinessSettings {
  id                             String   @id @default(cuid())
  name                           String
  logoUrl                        String?
  phone                          String
  email                          String
  addressStreet                  String
  addressCity                    String
  addressState                   String
  addressZip                     String
  taxRate                        Decimal  @default(0) @db.Decimal(5, 4)
  depositPercent                 Decimal  @default(0) @db.Decimal(5, 4)
  defaultAppointmentDurationMin  Int      @default(60)
  serviceAreaZips                String[]
  facebookUrl                    String?
  instagramUrl                   String?
  updatedAt                      DateTime @updatedAt
}

model BusinessHours {
  id        String  @id @default(cuid())
  dayOfWeek Int
  openTime  String
  closeTime String
  isClosed  Boolean @default(false)

  @@unique([dayOfWeek])
}

model BlockedTime {
  id        String   @id @default(cuid())
  start     DateTime
  end       DateTime
  reason    String?
  createdAt DateTime @default(now())
}

model Service {
  id          String            @id @default(cuid())
  name        String
  slug        String            @unique
  description String
  icon        String?
  active      Boolean           @default(true)
  sortOrder   Int               @default(0)
  questions   ServiceQuestion[]
  leads       Lead[]
}

model ServiceQuestion {
  id        String                    @id @default(cuid())
  serviceId String
  service   Service                   @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  label     String
  fieldType ServiceQuestionFieldType
  options   Json?
  required  Boolean                   @default(false)
  sortOrder Int                       @default(0)
}

model Customer {
  id            String   @id @default(cuid())
  name          String
  phone         String
  email         String
  addressStreet String?
  addressCity   String?
  addressState  String?
  addressZip    String?
  createdAt     DateTime @default(now())
  leads         Lead[]
  jobs          Job[]
  reviews       Review[]
}

model Lead {
  id           String        @id @default(cuid())
  bookingRef   String        @unique
  customerId   String
  customer     Customer      @relation(fields: [customerId], references: [id])
  serviceId    String
  service      Service       @relation(fields: [serviceId], references: [id])
  status       LeadStatus    @default(NEW)
  budgetMin    Decimal?      @db.Decimal(10, 2)
  budgetMax    Decimal?      @db.Decimal(10, 2)
  notes        String?
  source       String        @default("website")
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  project      Project?
  appointments Appointment[]
  quotes       Quote[]
  leadNotes    LeadNote[]
  jobs         Job[]
}

model Project {
  id                String   @id @default(cuid())
  leadId            String   @unique
  lead              Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)
  description       String?
  answers           Json     @default("{}")
  addressStreet     String?
  addressCity       String?
  addressState      String?
  addressZip        String?
  withinServiceArea Boolean?
  budgetMin         Decimal? @db.Decimal(10, 2)
  budgetMax         Decimal? @db.Decimal(10, 2)
  status            String   @default("draft")
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  photos            ProjectPhoto[]
}

model ProjectPhoto {
  id         String   @id @default(cuid())
  projectId  String
  project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  url        String
  caption    String?
  uploadedAt DateTime @default(now())
}

model LeadNote {
  id          String    @id @default(cuid())
  leadId      String
  lead        Lead      @relation(fields: [leadId], references: [id], onDelete: Cascade)
  adminUserId String
  adminUser   AdminUser @relation(fields: [adminUserId], references: [id])
  body        String
  createdAt   DateTime  @default(now())
}

model Appointment {
  id        String            @id @default(cuid())
  leadId    String
  lead      Lead              @relation(fields: [leadId], references: [id], onDelete: Cascade)
  type      AppointmentType
  start     DateTime
  end       DateTime
  status    AppointmentStatus @default(SCHEDULED)
  notes     String?
  createdAt DateTime          @default(now())
}

model Quote {
  id            String      @id @default(cuid())
  leadId        String
  lead          Lead        @relation(fields: [leadId], references: [id], onDelete: Cascade)
  status        QuoteStatus @default(DRAFT)
  subtotal      Decimal     @default(0) @db.Decimal(10, 2)
  discount      Decimal     @default(0) @db.Decimal(10, 2)
  tax           Decimal     @default(0) @db.Decimal(10, 2)
  depositAmount Decimal     @default(0) @db.Decimal(10, 2)
  total         Decimal     @default(0) @db.Decimal(10, 2)
  publicToken   String      @unique @default(cuid())
  sentAt        DateTime?
  viewedAt      DateTime?
  respondedAt   DateTime?
  expiresAt     DateTime?
  createdAt     DateTime    @default(now())
  items         QuoteItem[]
  jobs          Job[]
}

model QuoteItem {
  id          String        @id @default(cuid())
  quoteId     String
  quote       Quote         @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  type        QuoteItemType
  description String
  quantity    Decimal       @db.Decimal(10, 2)
  unitPrice   Decimal       @db.Decimal(10, 2)
  isOptional  Boolean       @default(false)
  isIncluded  Boolean       @default(true)
  sortOrder   Int           @default(0)
}

model Job {
  id             String        @id @default(cuid())
  quoteId        String?
  quote          Quote?        @relation(fields: [quoteId], references: [id])
  leadId         String
  lead           Lead          @relation(fields: [leadId], references: [id])
  customerId     String
  customer       Customer      @relation(fields: [customerId], references: [id])
  status         JobStatus     @default(SCHEDULED)
  scopeOfWork    String
  addressStreet  String
  addressCity    String
  addressState   String
  addressZip     String
  startDate      DateTime?
  completionDate DateTime?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  photos         JobPhoto[]
  lineItems      JobLineItem[]
  invoices       Invoice[]
  reviews        Review[]
}

model JobPhoto {
  id        String        @id @default(cuid())
  jobId     String
  job       Job           @relation(fields: [jobId], references: [id], onDelete: Cascade)
  url       String
  phase     JobPhotoPhase
  caption   String?
  createdAt DateTime      @default(now())
}

model JobLineItem {
  id          String          @id @default(cuid())
  jobId       String
  job         Job             @relation(fields: [jobId], references: [id], onDelete: Cascade)
  type        JobLineItemType
  description String
  quantity    Decimal         @db.Decimal(10, 2)
  unitPrice   Decimal         @db.Decimal(10, 2)
  total       Decimal         @db.Decimal(10, 2)
  createdAt   DateTime        @default(now())
}

model Invoice {
  id          String        @id @default(cuid())
  jobId       String
  job         Job           @relation(fields: [jobId], references: [id], onDelete: Cascade)
  type        InvoiceType
  amount      Decimal       @db.Decimal(10, 2)
  dueDate     DateTime?
  status      InvoiceStatus @default(UNPAID)
  publicToken String        @unique @default(cuid())
  createdAt   DateTime      @default(now())
  payments    Payment[]
}

model Payment {
  id                    String        @id @default(cuid())
  invoiceId             String
  invoice               Invoice       @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  amount                Decimal       @db.Decimal(10, 2)
  method                String        @default("card")
  stripePaymentIntentId String?       @unique
  status                PaymentStatus @default(PENDING)
  paidAt                DateTime?
  createdAt             DateTime      @default(now())
}

model Review {
  id          String   @id @default(cuid())
  jobId       String
  job         Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  customerId  String
  customer    Customer @relation(fields: [customerId], references: [id])
  rating      Int
  body        String
  projectType String
  approved    Boolean  @default(false)
  createdAt   DateTime @default(now())
}

model Notification {
  id                String             @id @default(cuid())
  type              NotificationType
  recipientEmail    String
  subject           String
  body              String
  relatedEntityType String?
  relatedEntityId   String?
  status            NotificationStatus @default(QUEUED)
  sentAt            DateTime?
  createdAt         DateTime           @default(now())
}

model AuditLog {
  id          String    @id @default(cuid())
  adminUserId String
  adminUser   AdminUser @relation(fields: [adminUserId], references: [id])
  action      String
  entityType  String
  entityId    String
  metadata    Json?
  createdAt   DateTime  @default(now())
}
```

- [ ] **Step 4: Run the migration**

```bash
npx prisma migrate dev --name init
```

Expected: migration created under `prisma/migrations/`, applied to `carpentry_dev` with no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma
git commit -m "feat: add full Prisma schema and initial migration"
```

---

### Task 4: Prisma Client Singleton & Vitest Integration Test Infra

**Files:**
- Create: `lib/db.ts`, `vitest.config.ts`, `.env.test`, `tests/setup.ts`, `tests/integration/db.test.ts`
- Modify: `package.json` (add `test` script and `tsx` dev dependency)

**Interfaces:**
- Produces: `prisma` singleton export from `lib/db.ts` (`import { prisma } from "@/lib/db"`), used by every task from here on. Establishes the pattern for integration tests: real queries against a dedicated `carpentry_test` database.

- [ ] **Step 1: Create the Prisma client singleton**

`lib/db.ts`:

```ts
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
```

- [ ] **Step 2: Install test dependencies**

```bash
npm install -D vitest tsx dotenv dotenv-cli
```

(`dotenv` is used programmatically in `tests/setup.ts`; `dotenv-cli` provides the `dotenv` command used from the shell in the next step.)

- [ ] **Step 3: Create the test database and `.env.test`**

Create a second local database, e.g. `psql -U postgres -c "CREATE DATABASE carpentry_test"`.

`.env.test`:

```
DATABASE_URL="postgresql://user:password@localhost:5432/carpentry_test"
```

- [ ] **Step 4: Apply the schema to the test database**

```bash
npx dotenv -e .env.test -- npx prisma migrate deploy
```

- [ ] **Step 5: Configure Vitest to load `.env.test`**

`tests/setup.ts`:

```ts
import { config } from "dotenv"
config({ path: ".env.test" })
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
})
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 6: Write the failing test**

`tests/integration/db.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest"
import { prisma } from "@/lib/db"

describe("prisma client", () => {
  afterEach(async () => {
    await prisma.businessSettings.deleteMany()
  })

  it("can write and read a BusinessSettings row", async () => {
    const created = await prisma.businessSettings.create({
      data: {
        name: "Test Co",
        phone: "555-0100",
        email: "test@example.com",
        addressStreet: "1 Main St",
        addressCity: "Springfield",
        addressState: "IL",
        addressZip: "62701",
        serviceAreaZips: ["62701"],
      },
    })

    const found = await prisma.businessSettings.findUnique({
      where: { id: created.id },
    })

    expect(found?.name).toBe("Test Co")
  })
})
```

- [ ] **Step 7: Run the test**

Run: `npm run test`
Expected: PASS (this confirms `lib/db.ts` and the test DB wiring both work; there's no "fails first" step here since the client itself has no logic to be wrong yet — the test is verifying infrastructure, not driving new behavior).

- [ ] **Step 8: Commit**

```bash
git add lib/db.ts vitest.config.ts tests package.json .env.example
git commit -m "feat: add Prisma client singleton and Vitest integration test setup"
```

(`.env.test` and `.env` stay gitignored; add `DATABASE_URL` for tests as a documented convention in `.env.example` via a comment if not already clear.)

---

### Task 5: Seed Script

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (add `prisma.seed` config)

**Interfaces:**
- Produces: a runnable `npm run db:seed` that populates `BusinessSettings`, `BusinessHours`, `Service`/`ServiceQuestion`, and one `AdminUser` — every later task (login, settings UI) depends on this seed data existing.

- [ ] **Step 1: Write the seed script**

`prisma/seed.ts`:

```ts
import { PrismaClient, ServiceQuestionFieldType } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  await prisma.businessSettings.deleteMany()
  await prisma.businessSettings.create({
    data: {
      name: "Heritage Fine Carpentry",
      phone: "(555) 019-2837",
      email: "info@heritagefinecarpentry.example",
      addressStreet: "412 Millwright Ave",
      addressCity: "Riverton",
      addressState: "OH",
      addressZip: "45501",
      taxRate: 0.0725,
      depositPercent: 0.3,
      defaultAppointmentDurationMin: 60,
      serviceAreaZips: ["45501", "45502", "45503", "45504", "45505"],
    },
  })

  await prisma.businessHours.deleteMany()
  const weekdayHours = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
    dayOfWeek,
    openTime: "08:00",
    closeTime: "17:00",
    isClosed: false,
  }))
  await prisma.businessHours.createMany({
    data: [
      { dayOfWeek: 0, openTime: "00:00", closeTime: "00:00", isClosed: true },
      ...weekdayHours,
      { dayOfWeek: 6, openTime: "09:00", closeTime: "13:00", isClosed: false },
    ],
  })

  await prisma.serviceQuestion.deleteMany()
  await prisma.service.deleteMany()

  const services = [
    { name: "Custom Carpentry", slug: "custom-carpentry", description: "Bespoke carpentry for any space." },
    { name: "Custom Cabinets", slug: "custom-cabinets", description: "Built-to-order cabinetry." },
    { name: "Built-ins", slug: "built-ins", description: "Bookcases, benches, and built-in storage." },
    { name: "Deck Construction", slug: "deck-construction", description: "New decks and replacements." },
    { name: "Fence Construction", slug: "fence-construction", description: "Residential fencing." },
    { name: "Door Installation", slug: "door-installation", description: "Interior and exterior doors." },
    { name: "Window Installation", slug: "window-installation", description: "Window replacement and install." },
    { name: "Trim & Molding", slug: "trim-molding", description: "Baseboards, crown molding, casing." },
    { name: "Framing", slug: "framing", description: "Structural framing work." },
    { name: "Furniture", slug: "furniture", description: "Custom furniture pieces." },
    { name: "Remodeling", slug: "remodeling", description: "Room and whole-space remodels." },
    { name: "Carpentry Repairs", slug: "carpentry-repairs", description: "Repairs and small fixes." },
    { name: "Other", slug: "other", description: "Something not listed above." },
  ]

  const created: Record<string, string> = {}
  for (const [index, s] of services.entries()) {
    const service = await prisma.service.create({
      data: { ...s, sortOrder: index },
    })
    created[s.slug] = service.id
  }

  await prisma.serviceQuestion.createMany({
    data: [
      { serviceId: created["deck-construction"], label: "Do you have an existing deck?", fieldType: ServiceQuestionFieldType.BOOLEAN, required: true, sortOrder: 0 },
      { serviceId: created["deck-construction"], label: "Approximate dimensions (ft x ft)", fieldType: ServiceQuestionFieldType.TEXT, required: true, sortOrder: 1 },
      { serviceId: created["deck-construction"], label: "New construction or replacement?", fieldType: ServiceQuestionFieldType.SELECT, options: ["New construction", "Replacement"], required: true, sortOrder: 2 },
      { serviceId: created["deck-construction"], label: "Preferred material", fieldType: ServiceQuestionFieldType.SELECT, options: ["Pressure-treated wood", "Cedar", "Composite", "Not sure"], required: false, sortOrder: 3 },
      { serviceId: created["deck-construction"], label: "Desired timeline", fieldType: ServiceQuestionFieldType.TEXT, required: false, sortOrder: 4 },

      { serviceId: created["custom-cabinets"], label: "Number of cabinets", fieldType: ServiceQuestionFieldType.NUMBER, required: true, sortOrder: 0 },
      { serviceId: created["custom-cabinets"], label: "Approximate dimensions", fieldType: ServiceQuestionFieldType.TEXT, required: false, sortOrder: 1 },
      { serviceId: created["custom-cabinets"], label: "Room type", fieldType: ServiceQuestionFieldType.SELECT, options: ["Kitchen", "Bathroom", "Laundry", "Garage", "Other"], required: true, sortOrder: 2 },
      { serviceId: created["custom-cabinets"], label: "Preferred style", fieldType: ServiceQuestionFieldType.TEXT, required: false, sortOrder: 3 },
      { serviceId: created["custom-cabinets"], label: "Do you have existing cabinets to remove?", fieldType: ServiceQuestionFieldType.BOOLEAN, required: true, sortOrder: 4 },
      { serviceId: created["custom-cabinets"], label: "Desired finish", fieldType: ServiceQuestionFieldType.TEXT, required: false, sortOrder: 5 },
    ],
  })

  await prisma.adminUser.deleteMany()
  await prisma.adminUser.create({
    data: {
      email: "admin@heritagefinecarpentry.example",
      name: "Business Owner",
      passwordHash: await bcrypt.hash("ChangeMe123!", 10),
    },
  })

  console.log("Seed complete. Admin login: admin@heritagefinecarpentry.example / ChangeMe123! (change this before real use)")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

- [ ] **Step 2: Wire up the seed command**

In `package.json`, add:

```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  },
  "scripts": {
    "db:seed": "prisma db seed"
  }
}
```

- [ ] **Step 3: Run it against the dev database**

Run: `npm run db:seed`
Expected: console log confirming seed completion; spot-check with `npx prisma studio` that `BusinessSettings`, `BusinessHours` (7 rows), `Service` (13 rows), `ServiceQuestion` (11 rows), and `AdminUser` (1 row) are populated.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts package.json
git commit -m "feat: add database seed script with placeholder business data"
```

---

### Task 6: Local Storage Interface + Magic-Byte File Validation

**Files:**
- Create: `lib/storage.ts`, `lib/fileSignature.ts`, `tests/unit/storage.test.ts`, `tests/unit/fileSignature.test.ts`
- Modify: `.gitignore` (ignore `public/uploads/*` except a `.gitkeep`)

**Interfaces:**
- Produces: `storage: Storage` (methods `save(file: Buffer, originalName: string): Promise<string>`, `delete(url: string): Promise<void>`) and `detectImageType(buffer: Buffer): "image/png" | "image/jpeg" | "image/webp" | null`. Not wired to a route or UI in this plan — the `api/upload` route and logo/photo upload UI are built in the Customer Booking and Jobs phases, which is where actual file uploads first happen; this task just establishes the interface and its test coverage ahead of that need.

- [ ] **Step 1: Write the failing test for file signature detection**

`tests/unit/fileSignature.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { detectImageType } from "@/lib/fileSignature"

describe("detectImageType", () => {
  it("detects PNG by magic bytes", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
    expect(detectImageType(png)).toBe("image/png")
  })

  it("detects JPEG by magic bytes", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    expect(detectImageType(jpeg)).toBe("image/jpeg")
  })

  it("detects WEBP by RIFF/WEBP markers", () => {
    const webp = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from("WEBP", "ascii"),
    ])
    expect(detectImageType(webp)).toBe("image/webp")
  })

  it("returns null for unrecognized content", () => {
    const bogus = Buffer.from("not an image")
    expect(detectImageType(bogus)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- fileSignature`
Expected: FAIL with "detectImageType is not a function" or module-not-found.

- [ ] **Step 3: Implement `detectImageType`**

`lib/fileSignature.ts`:

```ts
export function detectImageType(
  buffer: Buffer
): "image/png" | "image/jpeg" | "image/webp" | null {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  ) {
    return "image/png"
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg"
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp"
  }

  return null
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm run test -- fileSignature`
Expected: PASS (4/4).

- [ ] **Step 5: Write the failing test for storage**

`tests/unit/storage.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest"
import { existsSync } from "fs"
import path from "path"
import { storage } from "@/lib/storage"

const saved: string[] = []

describe("LocalDiskStorage", () => {
  afterEach(async () => {
    for (const url of saved.splice(0)) {
      await storage.delete(url)
    }
  })

  it("saves a file and returns a /uploads URL", async () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const url = await storage.save(buffer, "photo.png")
    saved.push(url)

    expect(url).toMatch(/^\/uploads\/[\w-]+\.png$/)
    expect(existsSync(path.join(process.cwd(), "public", url))).toBe(true)
  })

  it("deletes a previously saved file", async () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff])
    const url = await storage.save(buffer, "photo.jpg")

    await storage.delete(url)

    expect(existsSync(path.join(process.cwd(), "public", url))).toBe(false)
  })
})
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npm run test -- storage`
Expected: FAIL — module `@/lib/storage` not found.

- [ ] **Step 7: Implement the storage interface**

`lib/storage.ts`:

```ts
import { writeFile, unlink, mkdir } from "fs/promises"
import { randomUUID } from "crypto"
import path from "path"

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads")

export interface Storage {
  save(file: Buffer, originalName: string): Promise<string>
  delete(url: string): Promise<void>
}

class LocalDiskStorage implements Storage {
  async save(file: Buffer, originalName: string): Promise<string> {
    await mkdir(UPLOAD_DIR, { recursive: true })
    const ext = path.extname(originalName).toLowerCase() || ".bin"
    const filename = `${randomUUID()}${ext}`
    await writeFile(path.join(UPLOAD_DIR, filename), file)
    return `/uploads/${filename}`
  }

  async delete(url: string): Promise<void> {
    const filename = path.basename(url)
    await unlink(path.join(UPLOAD_DIR, filename)).catch(() => undefined)
  }
}

export const storage: Storage = new LocalDiskStorage()
```

- [ ] **Step 8: Run the tests and confirm they pass**

Run: `npm run test -- storage`
Expected: PASS (2/2).

- [ ] **Step 9: Ignore uploaded files in git**

Add to `.gitignore`:

```
/public/uploads/*
!/public/uploads/.gitkeep
```

Create an empty `public/uploads/.gitkeep`.

- [ ] **Step 10: Commit**

```bash
git add lib/storage.ts lib/fileSignature.ts tests/unit .gitignore public/uploads/.gitkeep
git commit -m "feat: add local-disk storage interface with magic-byte file validation"
```

---

### Task 7: Auth.js Credentials Setup

**Files:**
- Create: `lib/auth-credentials.ts`, `auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `middleware.ts`, `types/next-auth.d.ts`, `tests/integration/auth-credentials.test.ts`

**Interfaces:**
- Consumes: `prisma` from `lib/db.ts` (Task 4).
- Produces: `verifyCredentials(raw): Promise<{id, email, name} | null>` from `lib/auth-credentials.ts`; `auth`, `signIn`, `signOut`, `handlers` exported from `auth.ts`, used by the login page (Task 8) and any later server action needing the current session.

- [ ] **Step 1: Install Auth.js and bcryptjs**

```bash
npm install next-auth@beta bcryptjs
npm install -D @types/bcryptjs
```

- [ ] **Step 2: Generate and set `AUTH_SECRET`**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Paste the output into `.env` as `AUTH_SECRET`.

- [ ] **Step 3: Write the failing test for credential verification**

`tests/integration/auth-credentials.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { verifyCredentials } from "@/lib/auth-credentials"

describe("verifyCredentials", () => {
  beforeAll(async () => {
    await prisma.adminUser.deleteMany()
    await prisma.adminUser.create({
      data: {
        email: "owner@example.com",
        name: "Owner",
        passwordHash: await bcrypt.hash("correct-horse", 10),
      },
    })
  })

  afterAll(async () => {
    await prisma.adminUser.deleteMany()
  })

  it("returns the user for correct credentials", async () => {
    const result = await verifyCredentials({
      email: "owner@example.com",
      password: "correct-horse",
    })
    expect(result?.email).toBe("owner@example.com")
  })

  it("returns null for a wrong password", async () => {
    const result = await verifyCredentials({
      email: "owner@example.com",
      password: "wrong",
    })
    expect(result).toBeNull()
  })

  it("returns null for an unknown email", async () => {
    const result = await verifyCredentials({
      email: "nobody@example.com",
      password: "correct-horse",
    })
    expect(result).toBeNull()
  })

  it("returns null for malformed input", async () => {
    const result = await verifyCredentials({ email: "not-an-email" })
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 4: Run it and confirm it fails**

Run: `npm run test -- auth-credentials`
Expected: FAIL — module `@/lib/auth-credentials` not found.

- [ ] **Step 5: Implement `verifyCredentials`**

`lib/auth-credentials.ts`:

```ts
import bcrypt from "bcryptjs"
import { z } from "zod"
import { prisma } from "@/lib/db"

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function verifyCredentials(
  raw: Record<string, unknown> | undefined
): Promise<{ id: string; email: string; name: string } | null> {
  const parsed = credentialsSchema.safeParse(raw)
  if (!parsed.success) return null

  const user = await prisma.adminUser.findUnique({
    where: { email: parsed.data.email },
  })
  if (!user) return null

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash)
  if (!valid) return null

  return { id: user.id, email: user.email, name: user.name }
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npm run test -- auth-credentials`
Expected: PASS (4/4).

- [ ] **Step 7: Configure Auth.js**

`auth.ts` (project root):

```ts
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { verifyCredentials } from "@/lib/auth-credentials"

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/admin/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: (credentials) =>
        verifyCredentials(credentials as Record<string, unknown>),
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
})
```

`types/next-auth.d.ts`:

```ts
import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"]
  }
}
```

`app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/auth"

export const { GET, POST } = handlers
```

- [ ] **Step 8: Add route-protection middleware**

`middleware.ts` (project root):

```ts
import { NextResponse } from "next/server"
import { auth } from "@/auth"

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoginPage = pathname === "/admin/login"
  const isAdminRoute = pathname.startsWith("/admin")

  if (isAdminRoute && !isLoginPage && !req.auth) {
    return NextResponse.redirect(new URL("/admin/login", req.nextUrl.origin))
  }
})

export const config = {
  matcher: ["/admin/:path*"],
}
```

- [ ] **Step 9: Verify the build**

Run: `npm run build`
Expected: builds with no type errors (confirms the `session.user.id` augmentation is picked up).

- [ ] **Step 10: Commit**

```bash
git add lib/auth-credentials.ts auth.ts middleware.ts types app/api/auth tests/integration/auth-credentials.test.ts .env.example
git commit -m "feat: add Auth.js credentials provider and admin route protection"
```

---

### Task 8: Admin Login Page & Protected Shell Layout

**Files:**
- Create: `app/admin/login/page.tsx`, `app/admin/layout.tsx`, `app/admin/page.tsx`, `app/admin/leads/page.tsx`, `app/admin/customers/page.tsx`, `app/admin/calendar/page.tsx`, `app/admin/quotes/page.tsx`, `app/admin/jobs/page.tsx`, `app/admin/payments/page.tsx`, `app/admin/reviews/page.tsx`, `components/admin/admin-nav.tsx`, `components/admin/logout-button.tsx`

**Interfaces:**
- Consumes: `signIn`/`signOut`/`auth` from `auth.ts` (Task 7), `Button`/`Input`/`Label`/`Card` from `components/ui/*` (Task 2).
- Produces: a working `/admin/login` → `/admin` flow; the nav shell every later admin page (leads, calendar, quotes, jobs, payments, reviews, settings) renders inside.

- [ ] **Step 1: Build the login page**

`app/admin/login/page.tsx`:

```tsx
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import { signIn } from "@/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"

async function login(formData: FormData) {
  "use server"
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/admin",
    })
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/admin/login?error=1")
    }
    throw error
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm p-8">
        <h1 className="mb-6 text-xl font-semibold">Admin Sign In</h1>
        <form action={login} className="space-y-4">
          {error && (
            <p className="text-sm text-red-600">Invalid email or password.</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          <Button type="submit" className="w-full">
            Sign In
          </Button>
        </form>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Build the logout button**

`components/admin/logout-button.tsx`:

```tsx
import { signOut } from "@/auth"
import { Button } from "@/components/ui/button"

export function LogoutButton() {
  return (
    <form
      action={async () => {
        "use server"
        await signOut({ redirectTo: "/admin/login" })
      }}
    >
      <Button type="submit" variant="ghost">
        Log out
      </Button>
    </form>
  )
}
```

- [ ] **Step 3: Build the admin nav**

`components/admin/admin-nav.tsx`:

```tsx
import Link from "next/link"

const links = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/calendar", label: "Calendar" },
  { href: "/admin/quotes", label: "Quotes" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/settings", label: "Settings" },
]

export function AdminNav() {
  return (
    <nav className="flex flex-col gap-1 p-4">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-muted"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
```

- [ ] **Step 4: Build the protected layout**

`app/admin/layout.tsx`:

```tsx
import { AdminNav } from "@/components/admin/admin-nav"
import { LogoutButton } from "@/components/admin/logout-button"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="grid min-h-screen grid-cols-[220px_1fr]">
      <aside className="border-r bg-muted/20">
        <AdminNav />
      </aside>
      <div className="flex flex-col">
        <header className="flex items-center justify-end border-b px-6 py-3">
          <LogoutButton />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
```

Note: `app/admin/login/page.tsx` sits under the same `app/admin/` folder, so it would inherit this layout, adding a nav/logout header to an unauthenticated login screen. Move the login route out to avoid that: keep `app/admin/login/page.tsx` where it is, but give it its own layout override — create `app/admin/login/layout.tsx` that simply renders `children` with no nav:

```tsx
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
```

Next.js layouts are additive by nesting, so a nested layout replacing the parent's chrome isn't how App Router works — instead, restructure so `login/` is a sibling of the protected tree, not nested under it. Move the protected pages into a route group: rename `app/admin/*` (except `login/`) to live under `app/admin/(protected)/*`, and keep `app/admin/layout.tsx` (the nav/header shell) at `app/admin/(protected)/layout.tsx` instead of `app/admin/layout.tsx`. `app/admin/login/page.tsx` then has no ancestor layout beyond the root, and the middleware matcher `/admin/:path*` still protects `/admin/(protected)/...` URLs — since route groups don't affect the URL, those pages are still served at `/admin/leads`, `/admin/calendar`, etc.

- [ ] **Step 5: Placeholder pages for each nav section**

Each of the following is the same minimal pattern — create:
`app/admin/(protected)/page.tsx`, `app/admin/(protected)/leads/page.tsx`, `app/admin/(protected)/customers/page.tsx`, `app/admin/(protected)/calendar/page.tsx`, `app/admin/(protected)/quotes/page.tsx`, `app/admin/(protected)/jobs/page.tsx`, `app/admin/(protected)/payments/page.tsx`, `app/admin/(protected)/reviews/page.tsx`:

```tsx
export default function ComingSoonPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold">Coming soon</h1>
      <p className="text-sm text-muted-foreground">
        This section is built in a later implementation phase.
      </p>
    </div>
  )
}
```

(Give the Overview page at `app/admin/(protected)/page.tsx` the heading "Overview" and the others their matching section name instead of a generic component, so each route is visually distinguishable during manual testing.)

- [ ] **Step 6: Move the layout file and delete the now-unneeded login layout override**

Move `app/admin/layout.tsx` to `app/admin/(protected)/layout.tsx` (same content as Step 4). Delete the `app/admin/login/layout.tsx` created mid-Step-4 — it's no longer needed once the protected pages live under `(protected)` instead of directly under `admin/`.

- [ ] **Step 7: Manual verification**

Run: `npm run dev`
- Visit `/admin` while logged out → expect redirect to `/admin/login`.
- Log in with the seeded credentials (`admin@heritagefinecarpentry.example` / `ChangeMe123!`) → expect redirect to `/admin` showing "Overview" inside the nav shell.
- Click each nav link → expect the matching placeholder page, still inside the nav shell.
- Click "Log out" → expect redirect to `/admin/login`, and visiting `/admin` again redirects back to login.

- [ ] **Step 8: Commit**

```bash
git add app/admin components/admin
git commit -m "feat: add admin login page and protected dashboard shell"
```

---

### Task 9: Login Rate Limiting

**Files:**
- Create: `lib/rate-limit.ts`, `tests/unit/rate-limit.test.ts`
- Modify: `app/admin/login/page.tsx`

**Interfaces:**
- Produces: `checkRateLimit(key: string): { allowed: boolean; retryAfterMs: number }` from `lib/rate-limit.ts`, consumed by the login server action (and available to any later public endpoint — quote submission, upload — that needs the same protection).

- [ ] **Step 1: Write the failing test**

`tests/unit/rate-limit.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { checkRateLimit } from "@/lib/rate-limit"

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("allows the first 5 attempts for a key, then blocks the 6th", () => {
    const key = "login:1.2.3.4"
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key).allowed).toBe(true)
    }
    expect(checkRateLimit(key).allowed).toBe(false)
  })

  it("tracks separate keys independently", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("login:1.1.1.1")
    expect(checkRateLimit("login:1.1.1.1").allowed).toBe(false)
    expect(checkRateLimit("login:2.2.2.2").allowed).toBe(true)
  })

  it("resets after the window elapses", () => {
    const key = "login:9.9.9.9"
    for (let i = 0; i < 5; i++) checkRateLimit(key)
    expect(checkRateLimit(key).allowed).toBe(false)

    vi.setSystemTime(new Date("2026-01-01T00:16:00.000Z"))
    expect(checkRateLimit(key).allowed).toBe(true)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- rate-limit`
Expected: FAIL — module `@/lib/rate-limit` not found.

- [ ] **Step 3: Implement the rate limiter**

`lib/rate-limit.ts`:

```ts
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

const attempts = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(key: string): {
  allowed: boolean
  retryAfterMs: number
} {
  const now = Date.now()
  const entry = attempts.get(key)

  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, retryAfterMs: 0 }
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterMs: entry.resetAt - now }
  }

  entry.count += 1
  return { allowed: true, retryAfterMs: 0 }
}
```

(In-memory is sufficient here — spec section 7 calls for "basic in-memory or DB-backed token bucket," and a single-process admin login endpoint doesn't need cross-instance coordination.)

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm run test -- rate-limit`
Expected: PASS (3/3).

- [ ] **Step 5: Wire it into the login action**

Modify `app/admin/login/page.tsx`: add the rate-limit check before attempting `signIn`, keyed by client IP.

```tsx
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { signIn } from "@/auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"

async function login(formData: FormData) {
  "use server"
  const headersList = await headers()
  const ip = headersList.get("x-forwarded-for") ?? "unknown"
  const { allowed } = checkRateLimit(`login:${ip}`)
  if (!allowed) {
    redirect("/admin/login?error=rate-limited")
  }

  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/admin",
    })
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/admin/login?error=1")
    }
    throw error
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm p-8">
        <h1 className="mb-6 text-xl font-semibold">Admin Sign In</h1>
        <form action={login} className="space-y-4">
          {error === "rate-limited" && (
            <p className="text-sm text-red-600">
              Too many attempts. Please try again in a few minutes.
            </p>
          )}
          {error === "1" && (
            <p className="text-sm text-red-600">Invalid email or password.</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          <Button type="submit" className="w-full">
            Sign In
          </Button>
        </form>
      </Card>
    </div>
  )
}
```

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, submit the login form with a wrong password 6 times in a row → expect the 6th attempt to show "Too many attempts."

- [ ] **Step 7: Commit**

```bash
git add lib/rate-limit.ts tests/unit/rate-limit.test.ts app/admin/login/page.tsx
git commit -m "feat: add rate limiting to admin login"
```

---

### Task 10: Business Settings — Data Layer & Server Actions

**Files:**
- Create: `lib/settings.ts`, `tests/unit/settings-validation.test.ts`, `tests/integration/settings-actions.test.ts`, `app/admin/(protected)/settings/actions.ts`

**Interfaces:**
- Consumes: `prisma` from `lib/db.ts`.
- Produces: `businessInfoSchema`, `getBusinessSettings()`, `updateBusinessSettings(input)` from `lib/settings.ts`; `saveBusinessInfo`, `saveBusinessHours`, `addBlockedTime`, `removeBlockedTime` server actions, consumed by the Settings page UI in Task 10.

- [ ] **Step 1: Write the failing validation test**

`tests/unit/settings-validation.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { businessInfoSchema } from "@/lib/settings"

describe("businessInfoSchema", () => {
  const valid = {
    name: "Heritage Fine Carpentry",
    phone: "555-019-2837",
    email: "info@example.com",
    addressStreet: "412 Millwright Ave",
    addressCity: "Riverton",
    addressState: "OH",
    addressZip: "45501",
    taxRate: "0.0725",
    depositPercent: "0.3",
    defaultAppointmentDurationMin: "60",
    serviceAreaZips: "45501, 45502,45503",
  }

  it("accepts valid input and coerces numeric/list fields", () => {
    const result = businessInfoSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.taxRate).toBe(0.0725)
      expect(result.data.serviceAreaZips).toEqual(["45501", "45502", "45503"])
    }
  })

  it("rejects an invalid email", () => {
    const result = businessInfoSchema.safeParse({ ...valid, email: "not-an-email" })
    expect(result.success).toBe(false)
  })

  it("rejects a tax rate above 1", () => {
    const result = businessInfoSchema.safeParse({ ...valid, taxRate: "1.5" })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- settings-validation`
Expected: FAIL — module `@/lib/settings` not found.

- [ ] **Step 3: Implement `lib/settings.ts`**

```ts
import { z } from "zod"
import { prisma } from "@/lib/db"

export const businessInfoSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(7),
  email: z.string().email(),
  addressStreet: z.string().min(1),
  addressCity: z.string().min(1),
  addressState: z.string().length(2),
  addressZip: z.string().min(5),
  taxRate: z.coerce.number().min(0).max(1),
  depositPercent: z.coerce.number().min(0).max(1),
  defaultAppointmentDurationMin: z.coerce.number().int().min(15),
  serviceAreaZips: z.string().transform((value) =>
    value
      .split(",")
      .map((zip) => zip.trim())
      .filter(Boolean)
  ),
})

export type BusinessInfoInput = z.infer<typeof businessInfoSchema>

export async function getBusinessSettings() {
  const settings = await prisma.businessSettings.findFirst()
  if (!settings) {
    throw new Error("BusinessSettings has not been seeded")
  }
  return settings
}

export async function updateBusinessSettings(input: BusinessInfoInput) {
  const existing = await prisma.businessSettings.findFirst()
  if (!existing) {
    throw new Error("BusinessSettings has not been seeded")
  }
  return prisma.businessSettings.update({
    where: { id: existing.id },
    data: input,
  })
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm run test -- settings-validation`
Expected: PASS (3/3).

- [ ] **Step 5: Write the failing integration test for the server actions**

`tests/integration/settings-actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/db"
import {
  saveBusinessInfo,
  saveBusinessHours,
  addBlockedTime,
  removeBlockedTime,
} from "@/app/admin/(protected)/settings/actions"

function formData(values: Record<string, string>) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(values)) fd.set(key, value)
  return fd
}

describe("settings server actions", () => {
  beforeEach(async () => {
    await prisma.businessSettings.deleteMany()
    await prisma.businessSettings.create({
      data: {
        name: "Placeholder",
        phone: "000",
        email: "a@example.com",
        addressStreet: "1 St",
        addressCity: "City",
        addressState: "OH",
        addressZip: "00000",
        serviceAreaZips: [],
      },
    })
    await prisma.businessHours.deleteMany()
    await prisma.blockedTime.deleteMany()
  })

  afterAll(async () => {
    await prisma.businessSettings.deleteMany()
    await prisma.businessHours.deleteMany()
    await prisma.blockedTime.deleteMany()
  })

  it("rejects invalid business info without writing to the DB", async () => {
    const result = await saveBusinessInfo(
      formData({
        name: "",
        phone: "555",
        email: "bad-email",
        addressStreet: "1 St",
        addressCity: "City",
        addressState: "OH",
        addressZip: "45501",
        taxRate: "0.07",
        depositPercent: "0.3",
        defaultAppointmentDurationMin: "60",
        serviceAreaZips: "45501",
      })
    )
    expect(result.error).not.toBeNull()
  })

  it("saves valid business info", async () => {
    const result = await saveBusinessInfo(
      formData({
        name: "Heritage Fine Carpentry",
        phone: "555-019-2837",
        email: "info@example.com",
        addressStreet: "412 Millwright Ave",
        addressCity: "Riverton",
        addressState: "OH",
        addressZip: "45501",
        taxRate: "0.0725",
        depositPercent: "0.3",
        defaultAppointmentDurationMin: "60",
        serviceAreaZips: "45501,45502",
      })
    )
    expect(result.error).toBeNull()

    const updated = await prisma.businessSettings.findFirst()
    expect(updated?.name).toBe("Heritage Fine Carpentry")
    expect(updated?.serviceAreaZips).toEqual(["45501", "45502"])
  })

  it("upserts business hours for a given day", async () => {
    await saveBusinessHours(
      formData({ dayOfWeek: "1", openTime: "08:00", closeTime: "17:00" })
    )
    const hours = await prisma.businessHours.findUnique({
      where: { dayOfWeek: 1 },
    })
    expect(hours?.openTime).toBe("08:00")

    await saveBusinessHours(
      formData({ dayOfWeek: "1", openTime: "09:00", closeTime: "16:00" })
    )
    const updatedHours = await prisma.businessHours.findUnique({
      where: { dayOfWeek: 1 },
    })
    expect(updatedHours?.openTime).toBe("09:00")
  })

  it("adds and removes blocked time", async () => {
    await addBlockedTime(
      formData({
        start: "2026-12-24T00:00:00.000Z",
        end: "2026-12-26T00:00:00.000Z",
        reason: "Holiday",
      })
    )
    const blocks = await prisma.blockedTime.findMany()
    expect(blocks).toHaveLength(1)

    await removeBlockedTime(blocks[0].id)
    const remaining = await prisma.blockedTime.findMany()
    expect(remaining).toHaveLength(0)
  })
})
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npm run test -- settings-actions`
Expected: FAIL — module `@/app/admin/(protected)/settings/actions` not found.

- [ ] **Step 7: Implement the server actions**

`app/admin/(protected)/settings/actions.ts`:

```ts
"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { businessInfoSchema, updateBusinessSettings } from "@/lib/settings"

export async function saveBusinessInfo(formData: FormData) {
  const parsed = businessInfoSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  await updateBusinessSettings(parsed.data)
  revalidatePath("/admin/settings")
  return { error: null }
}

export async function saveBusinessHours(formData: FormData) {
  const dayOfWeek = Number(formData.get("dayOfWeek"))
  const isClosed = formData.get("isClosed") === "on"
  const openTime = String(formData.get("openTime"))
  const closeTime = String(formData.get("closeTime"))

  await prisma.businessHours.upsert({
    where: { dayOfWeek },
    update: { openTime, closeTime, isClosed },
    create: { dayOfWeek, openTime, closeTime, isClosed },
  })
  revalidatePath("/admin/settings")
}

export async function addBlockedTime(formData: FormData) {
  const start = new Date(String(formData.get("start")))
  const end = new Date(String(formData.get("end")))
  const reasonRaw = formData.get("reason")
  const reason = reasonRaw ? String(reasonRaw) : null

  await prisma.blockedTime.create({ data: { start, end, reason } })
  revalidatePath("/admin/settings")
}

export async function removeBlockedTime(id: string) {
  await prisma.blockedTime.delete({ where: { id } })
  revalidatePath("/admin/settings")
}
```

- [ ] **Step 8: Run the tests and confirm they pass**

Run: `npm run test -- settings-actions`
Expected: PASS (4/4).

- [ ] **Step 9: Commit**

```bash
git add lib/settings.ts "app/admin/(protected)/settings/actions.ts" tests
git commit -m "feat: add business settings data layer and server actions"
```

---

### Task 11: Business Settings — Page UI

**Files:**
- Create: `app/admin/(protected)/settings/page.tsx`, `components/admin/business-info-form.tsx`, `components/admin/business-hours-form.tsx`, `components/admin/blocked-time-list.tsx`

**Interfaces:**
- Consumes: `getBusinessSettings` from `lib/settings.ts`, `saveBusinessInfo`/`saveBusinessHours`/`addBlockedTime`/`removeBlockedTime` from Task 10's `actions.ts`, `prisma` from `lib/db.ts` for reading hours/blocked-time lists, shadcn `Card`/`Input`/`Label`/`Button`/`Switch`/`Table` components.

- [ ] **Step 1: Build the business info form**

`components/admin/business-info-form.tsx`:

```tsx
"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { saveBusinessInfo } from "@/app/admin/(protected)/settings/actions"
import type { BusinessSettings } from "@prisma/client"

export function BusinessInfoForm({ settings }: { settings: BusinessSettings }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await saveBusinessInfo(formData)
          setError(result.error ? "Please check the highlighted fields." : null)
        })
      }
      className="grid grid-cols-2 gap-4"
    >
      <div className="col-span-2 space-y-2">
        <Label htmlFor="name">Business name</Label>
        <Input id="name" name="name" defaultValue={settings.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" defaultValue={settings.phone} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" defaultValue={settings.email} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="addressStreet">Street</Label>
        <Input id="addressStreet" name="addressStreet" defaultValue={settings.addressStreet} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="addressCity">City</Label>
        <Input id="addressCity" name="addressCity" defaultValue={settings.addressCity} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="addressState">State</Label>
        <Input id="addressState" name="addressState" defaultValue={settings.addressState} maxLength={2} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="addressZip">ZIP</Label>
        <Input id="addressZip" name="addressZip" defaultValue={settings.addressZip} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="taxRate">Tax rate (e.g. 0.0725)</Label>
        <Input id="taxRate" name="taxRate" defaultValue={settings.taxRate.toString()} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="depositPercent">Deposit percent (e.g. 0.3)</Label>
        <Input id="depositPercent" name="depositPercent" defaultValue={settings.depositPercent.toString()} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="defaultAppointmentDurationMin">Appointment duration (min)</Label>
        <Input
          id="defaultAppointmentDurationMin"
          name="defaultAppointmentDurationMin"
          defaultValue={settings.defaultAppointmentDurationMin.toString()}
          required
        />
      </div>
      <div className="col-span-2 space-y-2">
        <Label htmlFor="serviceAreaZips">Service area ZIP codes (comma-separated)</Label>
        <Input
          id="serviceAreaZips"
          name="serviceAreaZips"
          defaultValue={settings.serviceAreaZips.join(", ")}
          required
        />
      </div>
      {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
      <div className="col-span-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save business info"}
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Build the business hours form**

`components/admin/business-hours-form.tsx`:

```tsx
"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { saveBusinessHours } from "@/app/admin/(protected)/settings/actions"
import type { BusinessHours } from "@prisma/client"

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export function BusinessHoursForm({ hours }: { hours: BusinessHours[] }) {
  const [isPending, startTransition] = useTransition()
  const byDay = new Map(hours.map((h) => [h.dayOfWeek, h]))

  return (
    <div className="space-y-3">
      {DAY_NAMES.map((dayName, dayOfWeek) => {
        const existing = byDay.get(dayOfWeek)
        return (
          <form
            key={dayOfWeek}
            action={(formData) => startTransition(() => saveBusinessHours(formData))}
            className="flex items-center gap-3"
          >
            <input type="hidden" name="dayOfWeek" value={dayOfWeek} />
            <span className="w-24 text-sm font-medium">{dayName}</span>
            <Label className="flex items-center gap-2 text-sm">
              <Switch name="isClosed" defaultChecked={existing?.isClosed} /> Closed
            </Label>
            <Input
              name="openTime"
              type="time"
              defaultValue={existing?.openTime ?? "08:00"}
              className="w-32"
            />
            <span>to</span>
            <Input
              name="closeTime"
              type="time"
              defaultValue={existing?.closeTime ?? "17:00"}
              className="w-32"
            />
            <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
              Save
            </Button>
          </form>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Build the blocked time list**

`components/admin/blocked-time-list.tsx`:

```tsx
"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { addBlockedTime, removeBlockedTime } from "@/app/admin/(protected)/settings/actions"
import type { BlockedTime } from "@prisma/client"

export function BlockedTimeList({ blocks }: { blocks: BlockedTime[] }) {
  const [isPending, startTransition] = useTransition()

  return (
    <div className="space-y-4">
      <form
        action={(formData) => startTransition(() => addBlockedTime(formData))}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="space-y-2">
          <Label htmlFor="start">Start</Label>
          <Input id="start" name="start" type="datetime-local" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end">End</Label>
          <Input id="end" name="end" type="datetime-local" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reason">Reason</Label>
          <Input id="reason" name="reason" placeholder="Holiday, vacation, etc." />
        </div>
        <Button type="submit" disabled={isPending}>
          Add blocked time
        </Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {blocks.map((block) => (
            <TableRow key={block.id}>
              <TableCell>{block.start.toLocaleString()}</TableCell>
              <TableCell>{block.end.toLocaleString()}</TableCell>
              <TableCell>{block.reason ?? "—"}</TableCell>
              <TableCell>
                <form action={() => startTransition(() => removeBlockedTime(block.id))}>
                  <Button type="submit" size="sm" variant="ghost">
                    Remove
                  </Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 4: Assemble the Settings page**

`app/admin/(protected)/settings/page.tsx`:

```tsx
import { prisma } from "@/lib/db"
import { getBusinessSettings } from "@/lib/settings"
import { BusinessInfoForm } from "@/components/admin/business-info-form"
import { BusinessHoursForm } from "@/components/admin/business-hours-form"
import { BlockedTimeList } from "@/components/admin/blocked-time-list"

export default async function SettingsPage() {
  const [settings, hours, blocks] = await Promise.all([
    getBusinessSettings(),
    prisma.businessHours.findMany({ orderBy: { dayOfWeek: "asc" } }),
    prisma.blockedTime.findMany({ orderBy: { start: "asc" } }),
  ])

  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-4 text-lg font-semibold">Business Information</h1>
        <BusinessInfoForm settings={settings} />
      </section>
      <section>
        <h2 className="mb-4 text-lg font-semibold">Business Hours</h2>
        <BusinessHoursForm hours={hours} />
      </section>
      <section>
        <h2 className="mb-4 text-lg font-semibold">Blocked Time</h2>
        <BlockedTimeList blocks={blocks} />
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, log in, visit `/admin/settings`:
- Confirm the seeded business info, hours, and (empty) blocked-time list render.
- Edit the business name and save → confirm it persists after reload.
- Toggle a day closed and save → confirm it persists.
- Add a blocked time entry → confirm it appears in the table; remove it → confirm it disappears.

- [ ] **Step 6: Commit**

```bash
git add "app/admin/(protected)/settings/page.tsx" components/admin
git commit -m "feat: add business settings admin page"
```

---

### Task 12: Full Verification Pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests across `tests/unit` and `tests/integration` pass.

- [ ] **Step 2: Run a full production build**

Run: `npm run build`
Expected: no type errors, no build failures.

- [ ] **Step 3: End-to-end manual walkthrough**

Run: `npm run dev` and confirm, in a browser:
1. `/` loads (placeholder home page).
2. `/admin` redirects to `/admin/login` when logged out.
3. Logging in with the seeded admin credentials redirects to `/admin` and shows the nav shell.
4. Every nav link (Leads, Customers, Calendar, Quotes, Jobs, Payments, Reviews, Settings) loads without error.
5. `/admin/settings` reflects live edits as verified in Task 10.
6. Logging out redirects to `/admin/login` and re-protects `/admin`.

- [ ] **Step 4: Tag the milestone**

```bash
git add -A
git commit -m "chore: complete foundation, database, auth, and business settings phase" --allow-empty
git tag phase-1-foundation
```
