"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { approveReview, deleteReview } from "@/app/admin/(protected)/reviews/actions";

export function ReviewActions({ reviewId, approved }: { reviewId: string; approved: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-2 flex gap-2">
      {!approved && (
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          onClick={() => startTransition(async () => { await approveReview(reviewId); })}
        >
          Approve
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() => startTransition(async () => { await deleteReview(reviewId); })}
      >
        Delete
      </Button>
    </div>
  );
}
