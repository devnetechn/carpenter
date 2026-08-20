import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function verifyCredentials(
  raw: Record<string, unknown> | undefined
): Promise<{ id: string; email: string; name: string } | null> {
  const parsed = credentialsSchema.safeParse(raw);
  if (!parsed.success) return null;

  const user = await prisma.adminUser.findUnique({
    where: { email: parsed.data.email },
  });
  if (!user) return null;

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) return null;

  return { id: user.id, email: user.email, name: user.name };
}
