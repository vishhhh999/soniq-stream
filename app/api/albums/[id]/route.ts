import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { albums, tracks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const allowed = ["name", "coverUrl"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];

  await db.update(albums).set(update).where(eq(albums.id, params.id));
  const [row] = await db.select().from(albums).where(eq(albums.id, params.id));
  return NextResponse.json(row);
}

// Deleting an album does NOT delete the tracks inside it — they move to
// "unsorted" instead. There's no undo in this app, and destroying every
// audio file in an album because you wanted to remove the album grouping
// is a much bigger footgun than a track ending up unsorted.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await db.update(tracks).set({ albumId: null }).where(eq(tracks.albumId, params.id));
  await db.delete(albums).where(eq(albums.id, params.id));
  return NextResponse.json({ ok: true });
}
