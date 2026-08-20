"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { sendReviewRequest } from "@/app/admin/(protected)/jobs/[id]/review-actions";

export function SendReviewRequestButton({ jobId }: { jobId: string }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await sendReviewRequest(jobId);
      setMessage(result.error ?? "Review request sent.");
    });
  }

  return (
    <div>
      <Button type="button" size="sm" variant="outline" onClick={handleClick} disabled={isPending}>
        {isPending ? "Sending..." : "Send Review Request"}
      </Button>
      {message && <p className="mt-1 text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
