import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { verifyCredentials } from "@/lib/auth-credentials";

describe("verifyCredentials", () => {
  beforeAll(async () => {
    await prisma.adminUser.deleteMany();
    await prisma.adminUser.create({
      data: {
        email: "owner@example.com",
        name: "Owner",
        passwordHash: await bcrypt.hash("correct-horse", 10),
      },
    });
  });

  afterAll(async () => {
    await prisma.adminUser.deleteMany();
  });

  it("returns the user for correct credentials", async () => {
    const result = await verifyCredentials({
      email: "owner@example.com",
      password: "correct-horse",
    });
    expect(result?.email).toBe("owner@example.com");
  });

  it("returns null for a wrong password", async () => {
    const result = await verifyCredentials({
      email: "owner@example.com",
      password: "wrong",
    });
    expect(result).toBeNull();
  });

  it("returns null for an unknown email", async () => {
    const result = await verifyCredentials({
      email: "nobody@example.com",
      password: "correct-horse",
    });
    expect(result).toBeNull();
  });

  it("returns null for malformed input", async () => {
    const result = await verifyCredentials({ email: "not-an-email" });
    expect(result).toBeNull();
  });
});
