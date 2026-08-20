"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitReview } from "@/app/review/submit/[jobId]/actions";

export function ReviewForm({ jobId, defaultProjectType }: { jobId: string; defaultProjectType: string }) {
  const [isPending, startTransition] = useTransition();
  const [rating, setRating] = useState(5);
  const [projectType, setProjectType] = useState(defaultProjectType);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await submitReview(jobId, { rating, projectType, body });
      if (result.error) {
        setError("Please check your review — a rating and a few words are required.");
      } else {
        setSubmitted(true);
      }
    });
  }

  if (submitted) {
    return <p className="text-sm text-green-700">Thanks for sharing your experience!</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <span className="block text-sm text-muted-foreground">Rating</span>
        <div className="mt-1 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              className={`text-2xl ${n <= rating ? "text-accent" : "text-muted-foreground"}`}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <span className="block text-sm text-muted-foreground">Project type</span>
        <Input value={projectType} onChange={(e) => setProjectType(e.target.value)} />
      </div>
      <div className="space-y-2">
        <span className="block text-sm text-muted-foreground">Your review</span>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="button" onClick={handleSubmit} disabled={isPending}>
        {isPending ? "Submitting..." : "Submit Review"}
      </Button>
    </div>
  );
}
