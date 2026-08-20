"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBusinessInfo } from "@/app/admin/(protected)/settings/actions";
import type { BusinessSettings } from "@/lib/generated/prisma/client";

type BusinessInfoFormSettings = Omit<BusinessSettings, "taxRate" | "depositPercent"> & {
  taxRate: string;
  depositPercent: string;
};

export function BusinessInfoForm({ settings }: { settings: BusinessInfoFormSettings }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await saveBusinessInfo(formData);
          setError(result.error ? "Please check the highlighted fields." : null);
        })
      }
      className="grid grid-cols-2 gap-4"
    >
      <div className="col-span-2 space-y-2">
        <Label htmlFor="name">Business name</Label>
        <Input id="name" name="name" defaultValue={settings.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" defaultValue={settings.phone} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" defaultValue={settings.email} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="addressStreet">Street</Label>
        <Input id="addressStreet" name="addressStreet" defaultValue={settings.addressStreet} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="addressCity">City</Label>
        <Input id="addressCity" name="addressCity" defaultValue={settings.addressCity} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="addressState">State</Label>
        <Input id="addressState" name="addressState" defaultValue={settings.addressState} maxLength={2} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="addressZip">ZIP</Label>
        <Input id="addressZip" name="addressZip" defaultValue={settings.addressZip} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="taxRate">Tax rate (e.g. 0.0725)</Label>
        <Input id="taxRate" name="taxRate" defaultValue={settings.taxRate} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="depositPercent">Deposit percent (e.g. 0.3)</Label>
        <Input id="depositPercent" name="depositPercent" defaultValue={settings.depositPercent} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="defaultAppointmentDurationMin">Appointment duration (min)</Label>
        <Input
          id="defaultAppointmentDurationMin"
          name="defaultAppointmentDurationMin"
          defaultValue={settings.defaultAppointmentDurationMin.toString()}
          required
        />
      </div>
      <div className="col-span-2 space-y-2">
        <Label htmlFor="serviceAreaZips">Service area ZIP codes (comma-separated)</Label>
        <Input
          id="serviceAreaZips"
          name="serviceAreaZips"
          defaultValue={settings.serviceAreaZips.join(", ")}
          required
        />
      </div>
      {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
      <div className="col-span-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save business info"}
        </Button>
      </div>
    </form>
  );
}
