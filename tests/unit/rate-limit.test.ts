import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first 5 attempts for a key, then blocks the 6th", () => {
    const key = "login:1.2.3.4";
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key).allowed).toBe(true);
    }
    expect(checkRateLimit(key).allowed).toBe(false);
  });

  it("tracks separate keys independently", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("login:1.1.1.1");
    expect(checkRateLimit("login:1.1.1.1").allowed).toBe(false);
    expect(checkRateLimit("login:2.2.2.2").allowed).toBe(true);
  });

  it("resets after the window elapses", () => {
    const key = "login:9.9.9.9";
    for (let i = 0; i < 5; i++) checkRateLimit(key);
    expect(checkRateLimit(key).allowed).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T00:16:00.000Z"));
    expect(checkRateLimit(key).allowed).toBe(true);
  });
});
