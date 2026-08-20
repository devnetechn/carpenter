"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { customerInfoSchema } from "@/lib/booking";
import { submitBookingAction } from "@/app/quote/actions";
import type { WizardData } from "@/components/booking/types";

export function StepCustomerInfo({
  data,
  updateData,
  goBack,
  onSubmitted,
}: {
  data: WizardData;
  updateData: (patch: Partial<WizardData>) => void;
  goBack: () => void;
  onSubmitted: (bookingRef: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isValid = customerInfoSchema.safeParse(data).success;

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await submitBookingAction({
        serviceId: data.serviceId,
        answers: data.answers,
        photoUrls: data.photoUrls,
        addressStreet: data.addressStreet,
        addressCity: data.addressCity,
        addressState: data.addressState,
        addressZip: data.addressZip,
        budgetMin: data.budgetMin ? Number(data.budgetMin) : undefined,
        budgetMax: data.budgetMax ? Number(data.budgetMax) : undefined,
        slotStart: data.slotStart,
        slotEnd: data.slotEnd,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail,
        preferredContact: data.preferredContact,
      });

      if (result.error || !result.bookingRef) {
        setError("Something went wrong. Please check your information and try again.");
        return;
      }
      onSubmitted(result.bookingRef);
    });
  }

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">Your contact information</h1>
      <div className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="customerName">Full name</Label>
          <Input
            id="customerName"
            value={data.customerName}
            onChange={(e) => updateData({ customerName: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customerPhone">Phone</Label>
          <Input
            id="customerPhone"
            type="tel"
            value={data.customerPhone}
            onChange={(e) => updateData({ customerPhone: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customerEmail">Email</Label>
          <Input
            id="customerEmail"
            type="email"
            value={data.customerEmail}
            onChange={(e) => updateData({ customerEmail: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="preferredContact">Preferred contact method</Label>
          <select
            id="preferredContact"
            value={data.preferredContact}
            onChange={(e) =>
              updateData({ preferredContact: e.target.value as WizardData["preferredContact"] })
            }
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="EMAIL">Email</option>
            <option value="PHONE">Phone</option>
            <option value="TEXT">Text</option>
          </select>
        </div>
      </div>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <div className="mt-8 flex gap-3">
        <Button variant="outline" onClick={goBack} disabled={isPending}>
          Back
        </Button>
        <Button disabled={!isValid || isPending} onClick={handleSubmit}>
          {isPending ? "Submitting..." : "Submit Request"}
        </Button>
      </div>
    </div>
  );
}
