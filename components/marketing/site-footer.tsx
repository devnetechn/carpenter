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
