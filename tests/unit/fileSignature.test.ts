import { describe, it, expect } from "vitest";
import { detectImageType } from "@/lib/fileSignature";

describe("detectImageType", () => {
  it("detects PNG by magic bytes", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(detectImageType(png)).toBe("image/png");
  });

  it("detects JPEG by magic bytes", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectImageType(jpeg)).toBe("image/jpeg");
  });

  it("detects WEBP by RIFF/WEBP markers", () => {
    const webp = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from("WEBP", "ascii"),
    ]);
    expect(detectImageType(webp)).toBe("image/webp");
  });

  it("returns null for unrecognized content", () => {
    const bogus = Buffer.from("not an image");
    expect(detectImageType(bogus)).toBeNull();
  });
});
