import Link from "next/link";
import { prisma } from "@/lib/db";
import { groupEntriesByDay, type CalendarEntry } from "@/lib/calendar-grid";
import { CreateAppointmentForm } from "@/components/admin/create-appointment-form";
import { AppointmentActions } from "@/components/admin/appointment-actions";
import { BlockTimeForm } from "@/components/admin/block-time-form";

function startOfWeekUTC(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

function startOfDayUTC(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const { view: viewParam, date: dateParam } = await searchParams;
  const view = viewParam === "day" ? "day" : "week";
  const anchorDate = dateParam ? new Date(dateParam) : new Date();

  const rangeStart = view === "day" ? startOfDayUTC(anchorDate) : startOfWeekUTC(anchorDate);
  const daysInView = view === "day" ? 1 : 7;
  const rangeEnd = new Date(rangeStart.getTime() + daysInView * 24 * 60 * 60 * 1000);

  const [appointments, blockedTimes, openLeads] = await Promise.all([
    prisma.appointment.findMany({
      where: { start: { lt: rangeEnd }, end: { gt: rangeStart } },
      include: { lead: { include: { customer: true, service: true } } },
      orderBy: { start: "asc" },
    }),
    prisma.blockedTime.findMany({
      where: { start: { lt: rangeEnd }, end: { gt: rangeStart } },
    }),
    prisma.lead.findMany({
      where: { status: { notIn: ["COMPLETED", "LOST"] } },
      include: { customer: true, service: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const entries: CalendarEntry[] = [
    ...appointments.map((a) => ({
      id: a.id,
      kind: "appointment" as const,
      title: `${a.type} — ${a.lead.customer.name} (${a.lead.service.name})`,
      start: a.start,
      end: a.end,
      status: a.status,
    })),
    ...blockedTimes.map((b) => ({
      id: b.id,
      kind: "blocked" as const,
      title: b.reason ?? "Blocked",
      start: b.start,
      end: b.end,
    })),
  ];

  const days = groupEntriesByDay(entries, rangeStart, daysInView);

  const stepDays = view === "day" ? 1 : 7;
  const prevDate = new Date(rangeStart.getTime() - stepDays * 24 * 60 * 60 * 1000);
  const nextDate = new Date(rangeStart.getTime() + stepDays * 24 * 60 * 60 * 1000);

  const leadOptions = openLeads.map((l) => ({
    id: l.id,
    label: `${l.customer.name} — ${l.service.name} (${l.bookingRef})`,
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Calendar</h1>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/admin/calendar?view=${view}&date=${prevDate.toISOString().slice(0, 10)}`}
            className="rounded-md border px-3 py-1.5"
          >
            &larr; Prev
          </Link>
          <Link
            href={`/admin/calendar?view=${view}&date=${nextDate.toISOString().slice(0, 10)}`}
            className="rounded-md border px-3 py-1.5"
          >
            Next &rarr;
          </Link>
          <Link
            href={`/admin/calendar?view=week&date=${anchorDate.toISOString().slice(0, 10)}`}
            className={`rounded-md border px-3 py-1.5 ${view === "week" ? "border-accent bg-accent/10" : ""}`}
          >
            Week
          </Link>
          <Link
            href={`/admin/calendar?view=day&date=${anchorDate.toISOString().slice(0, 10)}`}
            className={`rounded-md border px-3 py-1.5 ${view === "day" ? "border-accent bg-accent/10" : ""}`}
          >
            Day
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <CreateAppointmentForm leads={leadOptions} />
        <BlockTimeForm />
      </div>

      <div
        className="mt-6 grid gap-4"
        style={{ gridTemplateColumns: `repeat(${daysInView}, minmax(0, 1fr))` }}
      >
        {days.map((day) => (
          <div key={day.dayIndex} className="min-w-0 rounded-lg border p-3">
            <p className="text-sm font-semibold">
              {DAY_NAMES[day.date.getUTCDay()]} {day.date.getUTCMonth() + 1}/{day.date.getUTCDate()}
            </p>
            <div className="mt-2 space-y-2">
              {day.entries.map((entry) => (
                <div
                  key={entry.id}
                  className={`rounded-md border p-2 text-xs ${
                    entry.kind === "blocked"
                      ? "border-dashed bg-muted"
                      : entry.status === "CANCELLED"
                        ? "opacity-50 line-through"
                        : "bg-accent/5"
                  }`}
                >
                  <p className="font-medium">{entry.title}</p>
                  <p className="text-muted-foreground">
                    {entry.start.toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    –{" "}
                    {entry.end.toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                  {entry.kind === "appointment" && entry.status !== "CANCELLED" && (
                    <AppointmentActions
                      appointmentId={entry.id}
                      currentStart={entry.start.toISOString()}
                      currentEnd={entry.end.toISOString()}
                    />
                  )}
                </div>
              ))}
              {day.entries.length === 0 && (
                <p className="text-xs text-muted-foreground">Nothing scheduled.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
