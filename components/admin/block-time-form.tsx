"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addBlockedTime } from "@/app/admin/(protected)/settings/actions";

export function BlockTimeForm() {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-sm font-semibold">
        {open ? "Close" : "+ Block Time"}
      </button>
      {open && (
        <form
          action={(formData) =>
            startTransition(async () => {
              await addBlockedTime(formData);
              setOpen(false);
            })
          }
          className="mt-3 grid gap-3 sm:grid-cols-3"
        >
          <div className="space-y-2">
            <Label htmlFor="block-start">Start</Label>
            <Input id="block-start" name="start" type="datetime-local" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="block-end">End</Label>
            <Input id="block-end" name="end" type="datetime-local" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="block-reason">Reason</Label>
            <Input id="block-reason" name="reason" placeholder="Optional" />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Block Time"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
