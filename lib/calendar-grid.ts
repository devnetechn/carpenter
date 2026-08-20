export interface CalendarEntry {
  id: string;
  kind: "appointment" | "blocked";
  title: string;
  start: Date;
  end: Date;
  status?: string;
}

export interface DayGroup {
  dayIndex: number;
  date: Date;
  entries: CalendarEntry[];
}

export function groupEntriesByDay(
  entries: CalendarEntry[],
  rangeStart: Date,
  daysInView: number
): DayGroup[] {
  const rangeStartMidnight = new Date(rangeStart);
  rangeStartMidnight.setUTCHours(0, 0, 0, 0);

  const groups: DayGroup[] = Array.from({ length: daysInView }, (_, i) => ({
    dayIndex: i,
    date: new Date(rangeStartMidnight.getTime() + i * 24 * 60 * 60 * 1000),
    entries: [],
  }));

  for (const entry of entries) {
    const dayIndex = Math.floor(
      (entry.start.getTime() - rangeStartMidnight.getTime()) / (24 * 60 * 60 * 1000)
    );
    if (dayIndex >= 0 && dayIndex < daysInView) {
      groups[dayIndex].entries.push(entry);
    }
  }

  for (const group of groups) {
    group.entries.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  return groups;
}
