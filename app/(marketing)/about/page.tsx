import { getBusinessSettings } from "@/lib/settings";

export default async function AboutPage() {
  const settings = await getBusinessSettings();

  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="font-serif text-3xl font-semibold">About {settings.name}</h1>
      <div className="mt-8 space-y-6 text-muted-foreground">
        <p>
          {settings.name} provides services for all phases of home improvement,
          including additions, kitchens, bathrooms, decks, finished basements, and
          millwork. We&apos;ve served homeowners in {settings.addressCity} County and
          the surrounding area with fairness, honesty, and integrity for over 15 years.
        </p>
        <p>
          We keep our project list intentionally manageable so every client gets real,
          hands-on attention rather than a spot in a queue. Big or small, your project
          is customized to fit your style and budget, from first consultation to final
          walkthrough.
        </p>
        <p>
          Whether you need a single addition or a full kitchen remodel, we handle the
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
