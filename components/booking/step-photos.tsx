"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { WizardData } from "@/components/booking/types";

const MAX_PHOTOS = 10;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export function StepPhotos({
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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    setError(null);

    const remaining = MAX_PHOTOS - data.photoUrls.length;
    const toUpload = Array.from(files).slice(0, remaining);

    for (const file of toUpload) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`${file.name} is not a supported image type.`);
        continue;
      }
      if (file.size > MAX_SIZE_BYTES) {
        setError(`${file.name} is larger than 10MB.`);
        continue;
      }

      setUploading(true);
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const body = await res.json();
      setUploading(false);

      if (!res.ok) {
        setError(body.error ?? "Upload failed.");
        continue;
      }
      updateData({ photoUrls: [...data.photoUrls, body.url] });
    }
  }

  function removePhoto(url: string) {
    updateData({ photoUrls: data.photoUrls.filter((u) => u !== url) });
  }

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold">Add project photos</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Optional, but photos help us prepare a more accurate estimate.
      </p>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        disabled={data.photoUrls.length >= MAX_PHOTOS}
        onChange={(e) => handleFiles(e.target.files)}
        className="mt-6 text-sm"
      />
      {uploading && <p className="mt-2 text-sm text-muted-foreground">Uploading...</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
        {data.photoUrls.map((url) => (
          <div key={url} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Project" className="h-24 w-full rounded-md object-cover" />
            <button
              type="button"
              onClick={() => removePhoto(url)}
              className="absolute right-1 top-1 rounded-full bg-background/90 px-2 text-xs"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
      <div className="mt-8 flex gap-3">
        <Button variant="outline" onClick={goBack}>
          Back
        </Button>
        <Button onClick={goNext}>Continue</Button>
      </div>
    </div>
  );
}
