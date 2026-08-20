"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitContactInquiry } from "@/app/(marketing)/contact/actions";

export function ContactForm() {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await submitContactInquiry(formData);
          setStatus(result.error ? "error" : "sent");
        })
      }
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input id="phone" name="phone" type="tel" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">Message</Label>
        <Textarea id="message" name="message" rows={5} required />
      </div>
      {status === "error" && (
        <p className="text-sm text-red-600">Please check the form and try again.</p>
      )}
      {status === "sent" && (
        <p className="text-sm text-green-700">
          Thanks — we received your message and will be in touch soon.
        </p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Sending..." : "Send Message"}
      </Button>
    </form>
  );
}
