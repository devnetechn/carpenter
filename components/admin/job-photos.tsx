"use client";

import { useState, useTransition } from "react";
import { addJobPhoto, deleteJobPhoto } from "@/app/admin/(protected)/jobs/[id]/actions";

type Phase = "BEFORE" | "DURING" | "AFTER";
const PHASES: { value: Phase; label: string }[] = [
  { value: "BEFORE", label: "Before" },
  { value: "DURING", label: "During" },
  { value: "AFTER", label: "After" },
];

export interface JobPhotoView {
  id: string;
  url: string;
  phase: Phase;
  caption: string | null;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export function JobPhotos({ jobId, photos }: { jobId: string; photos: JobPhotoView[] }) {
  const [isPending, startTransition] = useTransition();
  const [phase, setPhase] = useState<Phase>("BEFORE");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(`${file.name} is not a supported image type.`);
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError(`${file.name} is larger than 10MB.`);
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.set("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const body = await res.json();
    setUploading(false);

    if (!res.ok) {
      setError(body.error ?? "Upload failed.");
      return;
    }

    startTransition(async () => {
      await addJobPhoto(jobId, phase, body.url, caption || undefined);
      setCaption("");
    });
  }

  function handleDelete(photoId: string) {
    startTransition(async () => {
      await deleteJobPhoto(photoId);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="space-y-1">
          <span className="block text-muted-foreground">Phase</span>
          <select
            value={phase}
            onChange={(e) => setPhase(e.target.value as Phase)}
            className="rounded-md border bg-background px-2 py-1.5"
          >
            {PHASES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-muted-foreground">Caption (optional)</span>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="rounded-md border bg-background px-2 py-1.5"
          />
        </label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading || isPending}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
      {uploading && <p className="text-sm text-muted-foreground">Uploading...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {PHASES.map((p) => {
        const phasePhotos = photos.filter((photo) => photo.phase === p.value);
        return (
          <div key={p.value}>
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">{p.label}</h3>
            {phasePhotos.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">No photos yet.</p>
            ) : (
              <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {phasePhotos.map((photo) => (
                  <div key={photo.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.caption ?? p.label}
                      className="h-24 w-full rounded-md object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleDelete(photo.id)}
                      disabled={isPending}
                      className="absolute right-1 top-1 rounded-full bg-background/90 px-2 text-xs"
                    >
                      &times;
                    </button>
                    {photo.caption && <p className="mt-1 text-xs text-muted-foreground">{photo.caption}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
