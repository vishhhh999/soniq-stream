import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { albums, inviteLinks } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function requireOwner(albumId: string, userId: string) {
  const [a] = await db.select().from(albums).where(and(eq(albums.id, albumId), eq(albums.userId, userId)));
  return a ?? null;
}

// GET — returns the active invite link for this album, or null.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!await requireOwner(params.id, userId)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [link] = await db
    .select()
    .from(inviteLinks)
    .where(and(eq(inviteLinks.albumId, params.id), eq(inviteLinks.active, true)))
    .limit(1);

  return NextResponse.json(link ?? null);
}

// POST — create a new invite link. Deactivates any existing active link first.
// Body: { maxUses?: number | null, expiresAt?: string | null }
// maxUses and expiresAt are mutually exclusive — client enforces, server accepts either.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!await requireOwner(params.id, userId)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const maxUses: number | null = body.maxUses ?? null;
  const expiresAt: string | null = body.expiresAt ?? null;

  // Deactivate existing active links.
  await db
    .update(inviteLinks)
    .set({ active: false })
    .where(and(eq(inviteLinks.albumId, params.id), eq(inviteLinks.active, true)));

  const row = {
    id: nanoid(),
    token: nanoid(16),
    albumId: params.id,
    ownerId: userId,
    maxUses,
    usedCount: 0,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    active: true,
    createdAt: new Date(),
  };
  await db.insert(inviteLinks).values(row);

  return NextResponse.json(row);
}

// DELETE — deactivate the active invite link (doesn't delete the row, just sets active=false).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!await requireOwner(params.id, userId)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await db
    .update(inviteLinks)
    .set({ active: false })
    .where(and(eq(inviteLinks.albumId, params.id), eq(inviteLinks.active, true)));

  return NextResponse.json({ ok: true });
}
