"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateJobStatus } from "@/app/admin/(protected)/jobs/[id]/actions";
import { JOB_STATUSES } from "@/lib/job-status";

export function JobStatusForm({ jobId, currentStatus }: { jobId: string; currentStatus: string }) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(currentStatus);

  return (
    <form
      action={() =>
        startTransition(async () => {
          await updateJobStatus(jobId, status);
        })
      }
      className="flex items-center gap-2"
    >
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="rounded-md border bg-background px-3 py-1.5 text-sm"
      >
        {JOB_STATUSES.map((s) => (
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
