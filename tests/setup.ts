import { config } from "dotenv";

config({ path: ".env.test" });

import fs from "node:fs";
import path from "node:path";
import { vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "@/lib/generated/prisma/client";

const client = new PGlite();
const adapter = new PrismaPGlite(client);
const prisma = new PrismaClient({
  adapter,
  transactionOptions: { timeout: 10000, maxWait: 10000 },
});

const migrationsDir = path.join(process.cwd(), "prisma/migrations");
const migrationDirs = fs
  .readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const dir of migrationDirs) {
  const sql = fs.readFileSync(path.join(migrationsDir, dir, "migration.sql"), "utf8");
  await client.exec(sql);
}

vi.mock("@/lib/db", () => ({ prisma }));
