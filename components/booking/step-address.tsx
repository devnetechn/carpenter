"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkServiceAreaAction } from "@/app/quote/actions";
import { addressSchema } from "@/lib/booking";
import type { WizardData } from "@/components/booking/types";

export function StepAddress({
  data,
  updateData,
  goNext,
  goBack,
}: {
  data: WizardData;
  updateData: (patch: Partial<WizardData>) => void;
  goNext: () => void;
  goBack: () => void;
}) {
  const [checking, setChecking] = useState(false);

  const isValid = addressSchema.safeParse(data).success;

  async function handleContinue() {
    setChecking(true);
    const within = await checkServiceAreaAction(data.addressZip);
    updateData({ withinServiceArea: within });
    setChecking(false);
    goNext();
  }

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">Where is the project?</h1>
      <div className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="addressStreet">Street</Label>
          <Input
            id="addressStreet"
            value={data.addressStreet}
            onChange={(e) => updateData({ addressStreet: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1 space-y-2">
            <Label htmlFor="addressCity">City</Label>
            <Input
              id="addressCity"
              value={data.addressCity}
              onChange={(e) => updateData({ addressCity: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="addressState">State</Label>
            <Input
              id="addressState"
              maxLength={2}
              value={data.addressState}
              onChange={(e) => updateData({ addressState: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="addressZip">ZIP</Label>
            <Input
              id="addressZip"
              value={data.addressZip}
              onChange={(e) => updateData({ addressZip: e.target.value })}
            />
          </div>
        </div>
      </div>
      <div className="mt-8 flex gap-3">
        <Button variant="outline" onClick={goBack}>
          Back
        </Button>
        <Button disabled={!isValid || checking} onClick={handleContinue}>
          {checking ? "Checking..." : "Continue"}
        </Button>
      </div>
    </div>
  );
}
