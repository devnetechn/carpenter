import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/upload/route";
import { storage } from "@/lib/storage";

function requestWithFile(file: File): NextRequest {
  const formData = new FormData();
  formData.set("file", file);
  return new NextRequest("http://localhost/api/upload", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/upload", () => {
  it("accepts a valid PNG and returns a /uploads URL", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const file = new File([bytes], "photo.png", { type: "image/png" });

    const res = await POST(requestWithFile(file));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toMatch(/^\/uploads\/[\w-]+\.png$/);

    await storage.delete(body.url);
  });

  it("rejects content that isn't actually a recognized image format", async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], "fake.png", {
      type: "image/png",
    });

    const res = await POST(requestWithFile(file));
    expect(res.status).toBe(400);
  });

  it("rejects a request with no file", async () => {
    const formData = new FormData();
    const req = new NextRequest("http://localhost/api/upload", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
