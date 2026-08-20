"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveBusinessHours } from "@/app/admin/(protected)/settings/actions";
import type { BusinessHours } from "@/lib/generated/prisma/client";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function BusinessHoursForm({ hours }: { hours: BusinessHours[] }) {
  const [isPending, startTransition] = useTransition();
  const byDay = new Map(hours.map((h) => [h.dayOfWeek, h]));

  return (
    <div className="space-y-3">
      {DAY_NAMES.map((dayName, dayOfWeek) => {
        const existing = byDay.get(dayOfWeek);
        return (
          <form
            key={dayOfWeek}
            action={(formData) => startTransition(() => saveBusinessHours(formData))}
            className="flex items-center gap-3"
          >
            <input type="hidden" name="dayOfWeek" value={dayOfWeek} />
            <span className="w-24 text-sm font-medium">{dayName}</span>
            <Label className="flex items-center gap-2 text-sm">
              <Switch name="isClosed" defaultChecked={existing?.isClosed} /> Closed
            </Label>
            <Input
              name="openTime"
              type="time"
              defaultValue={existing?.openTime ?? "08:00"}
              className="w-32"
            />
            <span>to</span>
            <Input
              name="closeTime"
              type="time"
              defaultValue={existing?.closeTime ?? "17:00"}
              className="w-32"
            />
            <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
              Save
            </Button>
          </form>
        );
      })}
    </div>
  );
}
