"use server";

import { getBusinessSettings } from "@/lib/settings";
import { isWithinServiceArea } from "@/lib/service-area";
import { getAvailableSlots } from "@/lib/availability";

export async function checkServiceAreaAction(zip: string): Promise<boolean> {
  const settings = await getBusinessSettings();
  return isWithinServiceArea(zip, settings.serviceAreaZips);
}

export async function getAvailableSlotsAction(): Promise<
  { start: string; end: string }[]
> {
  const rangeStart = new Date();
  const rangeEnd = new Date(rangeStart.getTime() + 14 * 24 * 60 * 60 * 1000);
  const slots = await getAvailableSlots(rangeStart, rangeEnd);
  return slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() }));
}
