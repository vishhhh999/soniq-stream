import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";

export const dynamic = "force-dynamic";

async function getUserId() {
  const session = await auth();
  return session?.user && (session.user as any).id;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  // Ownership check — without the userId condition here, any authenticated
  // user could PATCH any track by guessing/knowing its id, regardless of
  // who owns it.
  const [existing] = await db.select().from(tracks).where(and(eq(tracks.id, params.id), eq(tracks.userId, userId)));
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = await req.json();
  const allowed = ["bpm", "bpmConfidence", "key", "notes", "trimStart", "trimEnd", "pitchShift", "title", "artist", "lyrics", "lyricsSynced", "albumId"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];

  await db.update(tracks).set(update).where(eq(tracks.id, params.id));
  const [row] = await db.select().from(tracks).where(eq(tracks.id, params.id));
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [track] = await db.select().from(tracks).where(and(eq(tracks.id, params.id), eq(tracks.userId, userId)));
  if (!track) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await db.delete(tracks).where(eq(tracks.id, params.id));

  if (track.fileUrl && R2_BUCKET && R2_PUBLIC_URL) {
    try {
      const key = track.fileUrl.replace(`${R2_PUBLIC_URL.replace(/\/$/, "")}/`, "");
      if (key && key !== track.fileUrl) {
        await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      }
    } catch (err) {
      console.error("R2 cleanup failed (track still deleted from library):", err);
    }
  }

  return NextResponse.json({ ok: true });
}
