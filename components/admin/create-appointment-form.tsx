"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAppointment } from "@/app/admin/(protected)/calendar/actions";

interface LeadOption {
  id: string;
  label: string;
}

const APPOINTMENT_TYPES = ["CONSULTATION", "FOLLOW_UP", "JOB_VISIT"] as const;

export function CreateAppointmentForm({ leads }: { leads: LeadOption[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-sm font-semibold">
        {open ? "Close" : "+ New Appointment"}
      </button>
      {open && (
        <form
          action={(formData) =>
            startTransition(async () => {
              setError(null);
              const result = await createAppointment({
                leadId: String(formData.get("leadId")),
                type: String(formData.get("type")) as (typeof APPOINTMENT_TYPES)[number],
                start: new Date(String(formData.get("start"))).toISOString(),
                end: new Date(String(formData.get("end"))).toISOString(),
              });
              if (result.error) {
                setError("Could not create the appointment. Check the time isn't already booked.");
              } else {
                setOpen(false);
              }
            })
          }
          className="mt-3 grid gap-3 sm:grid-cols-2"
        >
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="leadId">Lead</Label>
            <select
              id="leadId"
              name="leadId"
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <select
              id="type"
              name="type"
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {APPOINTMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div />
          <div className="space-y-2">
            <Label htmlFor="start">Start</Label>
            <Input id="start" name="start" type="datetime-local" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end">End</Label>
            <Input id="end" name="end" type="datetime-local" required />
          </div>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={isPending || leads.length === 0}>
              {isPending ? "Saving..." : "Create Appointment"}
            </Button>
            {leads.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">No open leads to schedule.</p>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
