import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { albums, shareLinks } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// This is the PLAIN public share link (shareLinks table, consumed at
// /s/[token]) — a fundamentally different access model from the
// invite/membership system that /api/albums/[id]/share already owns.
// That route name was taken, hence "public-share": anyone with this link
// can listen without an account; saving/downloading requires login, and
// download specifically requires this link's allowDownload to be on.
// See handoff v6 section 5 / v7 for why this didn't exist until now.

async function getOwnedAlbum(userId: string, albumId: string) {
  const [a] = await db.select().from(albums).where(and(eq(albums.id, albumId), eq(albums.userId, userId)));
  return a ?? null;
}

async function getActiveLink(albumId: string) {
  const [link] = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.albumId, albumId), eq(shareLinks.active, true)))
    .orderBy(desc(shareLinks.createdAt));
  if (!link) return null;
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) return null;
  return link;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const album = await getOwnedAlbum(userId, params.id);
  if (!album) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const link = await getActiveLink(params.id);
  if (!link) return NextResponse.json({ link: null });

  return NextResponse.json({
    link: {
      token: link.token,
      allowDownload: link.allowDownload,
      expiresAt: link.expiresAt,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const album = await getOwnedAlbum(userId, params.id);
  if (!album) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const link = await getActiveLink(params.id);
  if (!link) return NextResponse.json({ error: "No active share link for this album." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if ("allowDownload" in body) update.allowDownload = !!body.allowDownload;

  if (Object.keys(update).length > 0) {
    await db.update(shareLinks).set(update).where(eq(shareLinks.id, link.id));
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const album = await getOwnedAlbum(userId, params.id);
  if (!album) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const link = await getActiveLink(params.id);
  if (!link) return NextResponse.json({ ok: true });

  await db.update(shareLinks).set({ active: false }).where(eq(shareLinks.id, link.id));
  return NextResponse.json({ ok: true });
}
