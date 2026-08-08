import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";

export const dynamic = "force-dynamic";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const file = formData.get("avatar") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, WebP, and GIF are supported." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large. Max 5MB." }, { status: 413 });
  }

  const ext = file.type === "image/jpeg" ? ".jpg"
    : file.type === "image/png" ? ".png"
    : file.type === "image/webp" ? ".webp"
    : ".gif";

  // Keyed by userId so re-uploading overwrites the previous avatar in-place
  // (no orphaned files accumulate in R2).
  const key = `avatars/${userId}${ext}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    })
  );

  const avatarUrl = `${R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  await db.update(users).set({ avatarUrl }).where(eq(users.id, userId));

  return NextResponse.json({ ok: true, avatarUrl });
}

export async function DELETE() {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  await db.update(users).set({ avatarUrl: null }).where(eq(users.id, userId));
  return NextResponse.json({ ok: true });
}
