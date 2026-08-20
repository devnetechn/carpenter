"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getAvailableSlotsAction } from "@/app/quote/actions";
import type { WizardData } from "@/components/booking/types";

interface Slot {
  start: string;
  end: string;
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function StepSchedule({
  data,
  updateData,
  goNext,
  goBack,
}: {
  data: WizardData;
  updateData: (patch: Partial<WizardData>) => void;
  goNext: () => void;
  goBack: () => void;
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAvailableSlotsAction()
      .then(setSlots)
      .finally(() => setLoading(false));
  }, []);

  const slotsByDay = slots.reduce<Record<string, Slot[]>>((acc, slot) => {
    const day = formatDay(slot.start);
    acc[day] = acc[day] ?? [];
    acc[day].push(slot);
    return acc;
  }, {});

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">Choose a consultation time</h1>
      {loading && <p className="mt-6 text-sm text-muted-foreground">Loading availability...</p>}
      {!loading && slots.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          No upcoming availability found. Please continue and we&apos;ll follow up to schedule.
        </p>
      )}
      <div className="mt-6 space-y-6">
        {Object.entries(slotsByDay).map(([day, daySlots]) => (
          <div key={day}>
            <p className="text-sm font-semibold">{day}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {daySlots.map((slot) => (
                <button
                  key={slot.start}
                  type="button"
                  onClick={() => updateData({ slotStart: slot.start, slotEnd: slot.end })}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    data.slotStart === slot.start
                      ? "border-accent bg-accent/10"
                      : "hover:border-accent"
                  }`}
                >
                  {formatTime(slot.start)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 flex gap-3">
        <Button variant="outline" onClick={goBack}>
          Back
        </Button>
        <Button disabled={slots.length > 0 && !data.slotStart} onClick={goNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}
