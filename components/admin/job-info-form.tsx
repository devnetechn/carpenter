"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveJobInfo } from "@/app/admin/(protected)/jobs/[id]/actions";

export interface JobInfoView {
  scopeOfWork: string;
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
  startDate: string;
}

export function JobInfoForm({ jobId, job }: { jobId: string; job: JobInfoView }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      key={`${job.scopeOfWork}-${job.startDate}`}
      action={(formData) =>
        startTransition(async () => {
          const result = await saveJobInfo(jobId, formData);
          setError(result.error ? "Please check the highlighted fields." : null);
          setMessage(result.error ? null : "Saved.");
        })
      }
      className="grid grid-cols-2 gap-4"
    >
      <div className="col-span-2 space-y-2">
        <Label htmlFor="scopeOfWork">Scope of work</Label>
        <Textarea id="scopeOfWork" name="scopeOfWork" defaultValue={job.scopeOfWork} required rows={3} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="addressStreet">Street</Label>
        <Input id="addressStreet" name="addressStreet" defaultValue={job.addressStreet} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="addressCity">City</Label>
        <Input id="addressCity" name="addressCity" defaultValue={job.addressCity} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="addressState">State</Label>
        <Input id="addressState" name="addressState" defaultValue={job.addressState} maxLength={2} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="addressZip">ZIP</Label>
        <Input id="addressZip" name="addressZip" defaultValue={job.addressZip} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="startDate">Start date</Label>
        <Input id="startDate" name="startDate" type="date" defaultValue={job.startDate} />
      </div>
      {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
      {message && <p className="col-span-2 text-sm text-green-700">{message}</p>}
      <div className="col-span-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save job info"}
        </Button>
      </div>
    </form>
  );
}
