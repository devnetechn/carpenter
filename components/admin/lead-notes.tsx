"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addLeadNote } from "@/app/admin/(protected)/leads/actions";

export interface LeadNoteView {
  id: string;
  body: string;
  createdAt: Date;
  authorName: string;
}

export function LeadNotes({ leadId, notes }: { leadId: string; notes: LeadNoteView[] }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-2 space-y-4">
      <form
        action={(formData) =>
          startTransition(async () => {
            await addLeadNote(leadId, String(formData.get("body") ?? ""));
          })
        }
        className="space-y-2"
      >
        <Textarea name="body" rows={3} placeholder="Add an internal note..." required />
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving..." : "Add Note"}
        </Button>
      </form>
      <ul className="space-y-3 text-sm">
        {notes.map((note) => (
          <li key={note.id} className="rounded-md border p-3">
            <p>{note.body}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {note.authorName} &middot; {note.createdAt.toLocaleString()}
            </p>
          </li>
        ))}
      </ul>
      {notes.length === 0 && (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      )}
    </div>
  );
}
