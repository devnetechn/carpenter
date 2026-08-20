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
