import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { albums, tracks } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getUserId() {
  const session = await auth();
  return session?.user && (session.user as any).id;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [existing] = await db.select().from(albums).where(and(eq(albums.id, params.id), eq(albums.userId, userId)));
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = await req.json();
  const allowed = ["name", "coverUrl"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];

  await db.update(albums).set(update).where(eq(albums.id, params.id));
  const [row] = await db.select().from(albums).where(eq(albums.id, params.id));
  return NextResponse.json(row);
}

// Deleting an album does NOT delete the tracks inside it — they move to
// "unsorted" instead. No undo exists in this app.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [existing] = await db.select().from(albums).where(and(eq(albums.id, params.id), eq(albums.userId, userId)));
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await db.update(tracks).set({ albumId: null }).where(and(eq(tracks.albumId, params.id), eq(tracks.userId, userId)));
  await db.delete(albums).where(eq(albums.id, params.id));
  return NextResponse.json({ ok: true });
}
