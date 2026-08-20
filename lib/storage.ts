import { writeFile, unlink, mkdir } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export interface Storage {
  save(file: Buffer, originalName: string): Promise<string>;
  delete(url: string): Promise<void>;
}

class LocalDiskStorage implements Storage {
  async save(file: Buffer, originalName: string): Promise<string> {
    await mkdir(UPLOAD_DIR, { recursive: true });
    const ext = path.extname(originalName).toLowerCase() || ".bin";
    const filename = `${randomUUID()}${ext}`;
    await writeFile(path.join(UPLOAD_DIR, filename), file);
    return `/uploads/${filename}`;
  }

  async delete(url: string): Promise<void> {
    const filename = path.basename(url);
    await unlink(path.join(UPLOAD_DIR, filename)).catch(() => undefined);
  }
}

export const storage: Storage = new LocalDiskStorage();
