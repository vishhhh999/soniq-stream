import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";

export const dynamic = "force-dynamic";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Best-effort delete of whatever the user's current avatar object is,
// regardless of its extension. Previously the upload key was always
// `avatars/{userId}{ext}`, and re-uploading in a DIFFERENT format (say
// .png then later .jpg) produced a different key than the one just
// overwritten — so the old file was never actually replaced, just
// orphaned, contradicting this route's own "no orphaned files" comment.
async function deleteExistingAvatar(userId: string, currentAvatarUrl: string | null) {
  if (!currentAvatarUrl || !R2_BUCKET) return;
  try {
    const key = new URL(currentAvatarUrl).pathname.replace(/^\//, "");
    if (key) await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch (err) {
    console.error(`Avatar cleanup failed for user ${userId} (non-fatal):`, err);
  }
}

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

  const [existingUser] = await db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId));

  const ext = file.type === "image/jpeg" ? ".jpg"
    : file.type === "image/png" ? ".png"
    : file.type === "image/webp" ? ".webp"
    : ".gif";

  const key = `avatars/${userId}${ext}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    })
  );

  // Clean up the previous avatar object if it had a different key (i.e.
  // a different file extension) than the one just written above.
  const newPublicUrl = `${R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  if (existingUser?.avatarUrl && existingUser.avatarUrl !== newPublicUrl) {
    await deleteExistingAvatar(userId, existingUser.avatarUrl);
  }

  const avatarUrl = newPublicUrl;
  await db.update(users).set({ avatarUrl }).where(eq(users.id, userId));

  return NextResponse.json({ ok: true, avatarUrl });
}

export async function DELETE() {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [existingUser] = await db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId));
  await deleteExistingAvatar(userId, existingUser?.avatarUrl ?? null);

  await db.update(users).set({ avatarUrl: null }).where(eq(users.id, userId));
  return NextResponse.json({ ok: true });
}
