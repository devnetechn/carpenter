import { describe, it, expect, vi, afterEach } from "vitest";
import { ResendEmailProvider, NoopEmailProvider } from "@/lib/email-provider";

describe("NoopEmailProvider", () => {
  it("always returns skipped", async () => {
    const provider = new NoopEmailProvider();
    const result = await provider.send({ to: "a@example.com", subject: "s", body: "b" });
    expect(result.status).toBe("skipped");
  });
});

describe("ResendEmailProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns sent when the Resend API responds ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" })
    );
    const provider = new ResendEmailProvider("test-key", "from@example.com");
    const result = await provider.send({ to: "a@example.com", subject: "s", body: "b" });
    expect(result.status).toBe("sent");
  });

  it("returns failed when the Resend API responds with an error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => "invalid recipient" })
    );
    const provider = new ResendEmailProvider("test-key", "from@example.com");
    const result = await provider.send({ to: "bad", subject: "s", body: "b" });
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.error).toContain("422");
    }
  });

  it("returns failed when the fetch call throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    const provider = new ResendEmailProvider("test-key", "from@example.com");
    const result = await provider.send({ to: "a@example.com", subject: "s", body: "b" });
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.error).toContain("network down");
    }
  });
});
