import { prisma } from "@/lib/db";

export default async function OverviewPage() {
  const [newLeadsCount, upcomingAppointmentsCount, totalLeadsCount] = await Promise.all([
    prisma.lead.count({ where: { status: "NEW" } }),
    prisma.appointment.count({ where: { status: "SCHEDULED", start: { gt: new Date() } } }),
    prisma.lead.count(),
  ]);

  return (
    <div>
      <h1 className="text-lg font-semibold">Overview</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">New Leads</p>
          <p className="mt-1 text-2xl font-semibold">{newLeadsCount}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Upcoming Appointments</p>
          <p className="mt-1 text-2xl font-semibold">{upcomingAppointmentsCount}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Total Leads</p>
          <p className="mt-1 text-2xl font-semibold">{totalLeadsCount}</p>
        </div>
      </div>
    </div>
  );
}
