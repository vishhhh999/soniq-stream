import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";

export const dynamic = "force-dynamic";

// Was missing entirely — only PATCH and DELETE existed. LyricsView fetches
// this route to load a track's full lyrics/lyricsSynced fields (which
// aren't included in the list view's payload shape used elsewhere), so its
// requests were hitting an unhandled method and failing.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const [row] = await db.select().from(tracks).where(eq(tracks.id, params.id));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const allowed = ["bpm", "bpmConfidence", "key", "notes", "trimStart", "trimEnd", "pitchShift", "title", "artist", "lyrics", "lyricsSynced"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];

  await db.update(tracks).set(update).where(eq(tracks.id, params.id));
  const [row] = await db.select().from(tracks).where(eq(tracks.id, params.id));
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const [track] = await db.select().from(tracks).where(eq(tracks.id, params.id));

  await db.delete(tracks).where(eq(tracks.id, params.id));

  // Clean up the R2 object too — previously only the DB row was removed,
  // leaving the audio file orphaned in storage forever (costs nothing on
  // R2's free tier at small scale, but there's no reason to leave it).
  if (track?.fileUrl && R2_BUCKET && R2_PUBLIC_URL) {
    try {
      const key = track.fileUrl.replace(`${R2_PUBLIC_URL.replace(/\/$/, "")}/`, "");
      if (key && key !== track.fileUrl) {
        await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      }
    } catch (err) {
      // Track is already gone from the library either way — a failed R2
      // cleanup shouldn't block the delete from succeeding for the user.
      console.error("R2 cleanup failed (track still deleted from library):", err);
    }
  }

  return NextResponse.json({ ok: true });
}
