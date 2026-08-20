import Link from "next/link";

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
];

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
  );
}
