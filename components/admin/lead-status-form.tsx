"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateLeadStatus } from "@/app/admin/(protected)/leads/actions";
import { LEAD_STATUSES } from "@/lib/lead-status";

export function LeadStatusForm({
  leadId,
  currentStatus,
}: {
  leadId: string;
  currentStatus: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(currentStatus);

  return (
    <form
      action={() =>
        startTransition(async () => {
          await updateLeadStatus(leadId, status);
        })
      }
      className="flex items-center gap-2"
    >
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="rounded-md border bg-background px-3 py-1.5 text-sm"
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={isPending || status === currentStatus}>
        {isPending ? "Saving..." : "Update Status"}
      </Button>
    </form>
  );
}
