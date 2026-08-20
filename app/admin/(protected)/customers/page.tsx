import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const customers = await prisma.customer.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: { _count: { select: { leads: true, jobs: true, reviews: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Customers</h1>
        <form className="flex items-center gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name, email, or phone"
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          />
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm">
            Search
          </button>
        </form>
      </div>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 pr-4">Name</th>
              <th className="pb-2 pr-4">Phone</th>
              <th className="pb-2 pr-4">Email</th>
              <th className="pb-2 pr-4">Leads</th>
              <th className="pb-2 pr-4">Jobs</th>
              <th className="pb-2">Customer Since</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  <Link href={`/admin/customers/${customer.id}`} className="text-accent hover:underline">
                    {customer.name}
                  </Link>
                </td>
                <td className="py-2 pr-4">{customer.phone}</td>
                <td className="py-2 pr-4">{customer.email}</td>
                <td className="py-2 pr-4">{customer._count.leads}</td>
                <td className="py-2 pr-4">{customer._count.jobs}</td>
                <td className="py-2">{customer.createdAt.toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {customers.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">No customers match this search.</p>
        )}
      </div>
    </div>
  );
}
