import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { tracks, shareLinks } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getOwnedTrack(userId: string, trackId: string) {
  const [t] = await db.select().from(tracks).where(and(eq(tracks.id, trackId), eq(tracks.userId, userId)));
  return t ?? null;
}

async function getActiveLink(trackId: string) {
  const [link] = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.trackId, trackId), eq(shareLinks.active, true)))
    .orderBy(desc(shareLinks.createdAt));
  if (!link) return null;
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) return null;
  return link;
}

// Previously TrackDetail's share panel had no way to check whether a link
// already existed — every time you reopened it, it looked like nothing
// had ever been shared, even if a real active link was still live. This
// is what actually loads the current state.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const track = await getOwnedTrack(userId, params.id);
  if (!track) return NextResponse.json({ error: "Not found." }, { status: 404 });

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

// Toggling allowDownload after the link already exists — previously this
// could only be set once, at creation.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const track = await getOwnedTrack(userId, params.id);
  if (!track) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const link = await getActiveLink(params.id);
  if (!link) return NextResponse.json({ error: "No active share link for this track." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if ("allowDownload" in body) update.allowDownload = !!body.allowDownload;

  if (Object.keys(update).length > 0) {
    await db.update(shareLinks).set(update).where(eq(shareLinks.id, link.id));
  }
  return NextResponse.json({ ok: true });
}

// Revoking early — previously a share link, once created, lived until
// expiresAt with no way to kill it sooner.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const track = await getOwnedTrack(userId, params.id);
  if (!track) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const link = await getActiveLink(params.id);
  if (!link) return NextResponse.json({ ok: true }); // already gone, nothing to do

  await db.update(shareLinks).set({ active: false }).where(eq(shareLinks.id, link.id));
  return NextResponse.json({ ok: true });
}
