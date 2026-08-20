import { describe, it, expect } from "vitest";
import { groupEntriesByDay, type CalendarEntry } from "@/lib/calendar-grid";

const monday = new Date("2026-08-24T00:00:00.000Z");

describe("groupEntriesByDay", () => {
  it("buckets an entry into the correct day within the range", () => {
    const entries: CalendarEntry[] = [
      {
        id: "1",
        kind: "appointment",
        title: "Consultation",
        start: new Date("2026-08-24T10:00:00.000Z"),
        end: new Date("2026-08-24T11:00:00.000Z"),
      },
    ];
    const days = groupEntriesByDay(entries, monday, 7);
    expect(days).toHaveLength(7);
    expect(days[0].entries).toHaveLength(1);
    expect(days[0].entries[0].id).toBe("1");
    for (let i = 1; i < 7; i++) expect(days[i].entries).toHaveLength(0);
  });

  it("assigns entries later in the week to the correct day index", () => {
    const entries: CalendarEntry[] = [
      {
        id: "2",
        kind: "appointment",
        title: "Follow-up",
        start: new Date("2026-08-26T09:00:00.000Z"),
        end: new Date("2026-08-26T10:00:00.000Z"),
      },
    ];
    const days = groupEntriesByDay(entries, monday, 7);
    expect(days[2].entries).toHaveLength(1);
  });

  it("excludes entries outside the visible range", () => {
    const entries: CalendarEntry[] = [
      {
        id: "3",
        kind: "appointment",
        title: "Next week",
        start: new Date("2026-09-02T09:00:00.000Z"),
        end: new Date("2026-09-02T10:00:00.000Z"),
      },
    ];
    const days = groupEntriesByDay(entries, monday, 7);
    expect(days.every((d) => d.entries.length === 0)).toBe(true);
  });

  it("sorts entries within a day by start time", () => {
    const entries: CalendarEntry[] = [
      { id: "late", kind: "appointment", title: "Late", start: new Date("2026-08-24T15:00:00.000Z"), end: new Date("2026-08-24T16:00:00.000Z") },
      { id: "early", kind: "blocked", title: "Early", start: new Date("2026-08-24T08:00:00.000Z"), end: new Date("2026-08-24T09:00:00.000Z") },
    ];
    const days = groupEntriesByDay(entries, monday, 7);
    expect(days[0].entries.map((e) => e.id)).toEqual(["early", "late"]);
  });

  it("returns daysInView groups even when there are no entries", () => {
    const days = groupEntriesByDay([], monday, 1);
    expect(days).toHaveLength(1);
    expect(days[0].entries).toEqual([]);
  });
});
