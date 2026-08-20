import { describe, it, expect, afterEach } from "vitest";
import { existsSync } from "fs";
import path from "path";
import { storage } from "@/lib/storage";

const saved: string[] = [];

describe("LocalDiskStorage", () => {
  afterEach(async () => {
    for (const url of saved.splice(0)) {
      await storage.delete(url);
    }
  });

  it("saves a file and returns a /uploads URL", async () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const url = await storage.save(buffer, "photo.png");
    saved.push(url);

    expect(url).toMatch(/^\/uploads\/[\w-]+\.png$/);
    expect(existsSync(path.join(process.cwd(), "public", url))).toBe(true);
  });

  it("deletes a previously saved file", async () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff]);
    const url = await storage.save(buffer, "photo.jpg");

    await storage.delete(url);

    expect(existsSync(path.join(process.cwd(), "public", url))).toBe(false);
  });
});
