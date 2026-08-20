"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancelAppointment, rescheduleAppointment } from "@/app/admin/(protected)/calendar/actions";

function toLocalDatetimeInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AppointmentActions({
  appointmentId,
  currentStart,
  currentEnd,
}: {
  appointmentId: string;
  currentStart: string;
  currentEnd: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [rescheduling, setRescheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (rescheduling) {
    return (
      <form
        action={(formData) =>
          startTransition(async () => {
            setError(null);
            const result = await rescheduleAppointment({
              appointmentId,
              start: new Date(String(formData.get("start"))).toISOString(),
              end: new Date(String(formData.get("end"))).toISOString(),
            });
            if (result.error) {
              setError("That time overlaps another appointment.");
            } else {
              setRescheduling(false);
            }
          })
        }
        className="mt-2 space-y-2"
      >
        <Input
          name="start"
          type="datetime-local"
          defaultValue={toLocalDatetimeInputValue(currentStart)}
          required
        />
        <Input
          name="end"
          type="datetime-local"
          defaultValue={toLocalDatetimeInputValue(currentEnd)}
          required
        />
        {error && <p className="text-red-600">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={isPending}>
            Save
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setRescheduling(false)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => setRescheduling(true)}>
        Reschedule
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await cancelAppointment(appointmentId);
          })
        }
      >
        Cancel
      </Button>
    </div>
  );
}
