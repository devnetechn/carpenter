import { describe, it, expect } from "vitest";
import { isWithinServiceArea } from "@/lib/service-area";

describe("isWithinServiceArea", () => {
  it("returns true for a ZIP in the list", () => {
    expect(isWithinServiceArea("45501", ["45501", "45502"])).toBe(true);
  });

  it("returns false for a ZIP not in the list", () => {
    expect(isWithinServiceArea("99999", ["45501", "45502"])).toBe(false);
  });

  it("trims whitespace before comparing", () => {
    expect(isWithinServiceArea(" 45501 ", ["45501"])).toBe(true);
  });
});
