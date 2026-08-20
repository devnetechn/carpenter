"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addBlockedTime, removeBlockedTime } from "@/app/admin/(protected)/settings/actions";
import type { BlockedTime } from "@/lib/generated/prisma/client";

export function BlockedTimeList({ blocks }: { blocks: BlockedTime[] }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <form
        action={(formData) => startTransition(() => addBlockedTime(formData))}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="space-y-2">
          <Label htmlFor="start">Start</Label>
          <Input id="start" name="start" type="datetime-local" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end">End</Label>
          <Input id="end" name="end" type="datetime-local" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reason">Reason</Label>
          <Input id="reason" name="reason" placeholder="Holiday, vacation, etc." />
        </div>
        <Button type="submit" disabled={isPending}>
          Add blocked time
        </Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {blocks.map((block) => (
            <TableRow key={block.id}>
              <TableCell>{block.start.toLocaleString()}</TableCell>
              <TableCell>{block.end.toLocaleString()}</TableCell>
              <TableCell>{block.reason ?? "—"}</TableCell>
              <TableCell>
                <form action={() => startTransition(() => removeBlockedTime(block.id))}>
                  <Button type="submit" size="sm" variant="ghost">
                    Remove
                  </Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
