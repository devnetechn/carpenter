"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { respondToQuote } from "@/app/quote/view/[token]/actions";

export function QuoteResponseForm({ token }: { token: string }) {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function respond(action: "ACCEPT" | "DECLINE" | "REQUEST_CHANGES") {
    setError(null);
    startTransition(async () => {
      const res = await respondToQuote(token, action, message || undefined);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (action === "ACCEPT") {
        setResult("Thanks! We've received your acceptance and will be in touch to schedule your project.");
      } else if (action === "DECLINE") {
        setResult("Thanks for letting us know.");
      } else {
        setResult("Thanks — we've received your requested changes and will follow up.");
      }
    });
  }

  if (result) {
    return <p className="mt-6 text-sm text-green-700">{result}</p>;
  }

  return (
    <div className="mt-8 space-y-3">
      {mode === "idle" ? (
        <div className="flex flex-wrap gap-3">
          <Button type="button" disabled={isPending} onClick={() => respond("ACCEPT")}>
            Accept Estimate
          </Button>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => setMode("changes")}>
            Request Changes
          </Button>
          <Button type="button" variant="ghost" disabled={isPending} onClick={() => respond("DECLINE")}>
            Decline
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What would you like changed?"
            rows={4}
          />
          <div className="flex gap-2">
            <Button type="button" disabled={isPending} onClick={() => respond("REQUEST_CHANGES")}>
              Send Request
            </Button>
            <Button type="button" variant="outline" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
