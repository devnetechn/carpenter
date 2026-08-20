import { NextRequest, NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { detectImageType } from "@/lib/fileSignature";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detectedType = detectImageType(buffer);
  if (!detectedType) {
    return NextResponse.json(
      { error: "Unsupported or invalid file type" },
      { status: 400 }
    );
  }

  const url = await storage.save(buffer, file.name);
  return NextResponse.json({ url });
}
