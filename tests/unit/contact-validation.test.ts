import { describe, it, expect } from "vitest";
import { contactFormSchema } from "@/lib/contact";

describe("contactFormSchema", () => {
  it("accepts a valid submission", () => {
    const result = contactFormSchema.safeParse({
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "555-010-0100",
      message: "I'd like a quote for a new deck.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an omitted phone", () => {
    const result = contactFormSchema.safeParse({
      name: "Jane Doe",
      email: "jane@example.com",
      message: "I'd like a quote for a new deck.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing message", () => {
    const result = contactFormSchema.safeParse({
      name: "Jane Doe",
      email: "jane@example.com",
      message: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = contactFormSchema.safeParse({
      name: "Jane Doe",
      email: "not-an-email",
      message: "Hello",
    });
    expect(result.success).toBe(false);
  });
});
