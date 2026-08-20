export interface AvailableSlot {
  start: Date;
  end: Date;
}

interface BusinessHoursLike {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

interface BusyWindow {
  start: Date;
  end: Date;
}

export function computeAvailableSlots(
  hours: BusinessHoursLike[],
  busy: BusyWindow[],
  durationMin: number,
  rangeStart: Date,
  rangeEnd: Date
): AvailableSlot[] {
  const slots: AvailableSlot[] = [];
  const hoursByDay = new Map(hours.map((h) => [h.dayOfWeek, h]));

  const cursor = new Date(rangeStart);
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor < rangeEnd) {
    const dayHours = hoursByDay.get(cursor.getUTCDay());
    if (dayHours && !dayHours.isClosed) {
      const [openH, openM] = dayHours.openTime.split(":").map(Number);
      const [closeH, closeM] = dayHours.closeTime.split(":").map(Number);

      const dayOpen = new Date(cursor);
      dayOpen.setUTCHours(openH, openM, 0, 0);
      const dayClose = new Date(cursor);
      dayClose.setUTCHours(closeH, closeM, 0, 0);

      let slotStart = new Date(dayOpen);
      while (slotStart.getTime() + durationMin * 60000 <= dayClose.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + durationMin * 60000);
        if (slotStart >= rangeStart && slotEnd <= rangeEnd) {
          const overlaps = busy.some((b) => slotStart < b.end && slotEnd > b.start);
          if (!overlaps) {
            slots.push({ start: new Date(slotStart), end: new Date(slotEnd) });
          }
        }
        slotStart = slotEnd;
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return slots;
}
