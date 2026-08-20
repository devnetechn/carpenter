import { describe, it, expect } from "vitest";
import { computeAvailableSlots } from "@/lib/availability";

const monday = new Date("2026-08-24T00:00:00.000Z"); // a Monday

const businessHours = [
  { dayOfWeek: 0, openTime: "00:00", closeTime: "00:00", isClosed: true },
  { dayOfWeek: 1, openTime: "09:00", closeTime: "11:00", isClosed: false },
  { dayOfWeek: 2, openTime: "09:00", closeTime: "11:00", isClosed: false },
  { dayOfWeek: 3, openTime: "09:00", closeTime: "11:00", isClosed: false },
  { dayOfWeek: 4, openTime: "09:00", closeTime: "11:00", isClosed: false },
  { dayOfWeek: 5, openTime: "09:00", closeTime: "11:00", isClosed: false },
  { dayOfWeek: 6, openTime: "00:00", closeTime: "00:00", isClosed: true },
];

describe("computeAvailableSlots", () => {
  it("generates duration-sized slots within business hours", () => {
    const rangeStart = new Date(monday);
    const rangeEnd = new Date(monday.getTime() + 24 * 60 * 60 * 1000);

    const slots = computeAvailableSlots(businessHours, [], 60, rangeStart, rangeEnd);

    expect(slots).toHaveLength(2);
    expect(slots[0].start.getUTCHours()).toBe(9);
    expect(slots[1].start.getUTCHours()).toBe(10);
  });

  it("produces no slots on a closed day", () => {
    const sunday = new Date("2026-08-23T00:00:00.000Z");
    const rangeEnd = new Date(sunday.getTime() + 24 * 60 * 60 * 1000);

    const slots = computeAvailableSlots(businessHours, [], 60, sunday, rangeEnd);

    expect(slots).toHaveLength(0);
  });

  it("excludes slots overlapping a busy window", () => {
    const rangeStart = new Date(monday);
    const rangeEnd = new Date(monday.getTime() + 24 * 60 * 60 * 1000);
    const busy = [
      {
        start: new Date("2026-08-24T09:00:00.000Z"),
        end: new Date("2026-08-24T10:00:00.000Z"),
      },
    ];

    const slots = computeAvailableSlots(businessHours, busy, 60, rangeStart, rangeEnd);

    expect(slots).toHaveLength(1);
    expect(slots[0].start.getUTCHours()).toBe(10);
  });

  it("excludes slots overlapping a blocked-time-style window spanning multiple slots", () => {
    const rangeStart = new Date(monday);
    const rangeEnd = new Date(monday.getTime() + 24 * 60 * 60 * 1000);
    const busy = [
      {
        start: new Date("2026-08-24T08:30:00.000Z"),
        end: new Date("2026-08-24T11:30:00.000Z"),
      },
    ];

    const slots = computeAvailableSlots(businessHours, busy, 60, rangeStart, rangeEnd);

    expect(slots).toHaveLength(0);
  });
});
