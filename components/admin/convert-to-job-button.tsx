"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { convertQuoteToJob } from "@/app/admin/(protected)/leads/[id]/job-actions";

export function ConvertToJobButton({ quoteId }: { quoteId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await convertQuoteToJob(quoteId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/admin/jobs/${result.jobId}`);
    });
  }

  return (
    <div>
      <Button type="button" onClick={handleClick} disabled={isPending}>
        {isPending ? "Converting..." : "Convert to Job"}
      </Button>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
