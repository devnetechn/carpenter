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
