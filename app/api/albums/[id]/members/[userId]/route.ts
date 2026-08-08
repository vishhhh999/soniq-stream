import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { albums, albumMembers } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getOwnerAlbum(albumId: string, ownerId: string) {
  const [a] = await db.select().from(albums).where(and(eq(albums.id, albumId), eq(albums.userId, ownerId)));
  return a ?? null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  const session = await auth();
  const ownerId = session?.user && (session.user as any).id;
  if (!ownerId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  if (!await getOwnerAlbum(params.id, ownerId)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = await req.json();
  const update: Record<string, unknown> = {};
  if ("canEdit" in body) update.canEdit = body.canEdit;
  if ("canDownload" in body) update.canDownload = body.canDownload;

  await db
    .update(albumMembers)
    .set(update)
    .where(and(eq(albumMembers.albumId, params.id), eq(albumMembers.userId, params.userId)));

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  const session = await auth();
  const ownerId = session?.user && (session.user as any).id;
  if (!ownerId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  if (!await getOwnerAlbum(params.id, ownerId)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await db
    .delete(albumMembers)
    .where(and(eq(albumMembers.albumId, params.id), eq(albumMembers.userId, params.userId)));

  return NextResponse.json({ ok: true });
}
