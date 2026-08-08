import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { playEvents, tracks } from "@/lib/db/schema";
import { and, count, desc, eq, gt } from "drizzle-orm";
import { nanoid } from "nanoid";

export const dynamic = "force-dynamic";

async function getUserId() {
  const session = await auth();
  return session?.user && (session.user as any).id;
}

// GET — returns total play count for this track (all users who played it,
// but only if the requesting user actually owns the track).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [track] = await db
    .select({ id: tracks.id })
    .from(tracks)
    .where(and(eq(tracks.id, params.id), eq(tracks.userId, userId)));
  if (!track) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [row] = await db
    .select({ count: count() })
    .from(playEvents)
    .where(eq(playEvents.trackId, params.id));

  return NextResponse.json({ count: row?.count ?? 0 });
}

// POST — records a play event, debounced: skip if same user played same
// track within the last 60 seconds (prevents scrubbing inflation).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  // Ownership/existence check.
  const [track] = await db
    .select({ id: tracks.id })
    .from(tracks)
    .where(and(eq(tracks.id, params.id), eq(tracks.userId, userId)));

  if (!track) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Debounce: check for a recent play event within the last 60s.
  const DEBOUNCE_MS = 60_000;
  const cutoff = new Date(Date.now() - DEBOUNCE_MS);

  const [recent] = await db
    .select({ id: playEvents.id })
    .from(playEvents)
    .where(
      and(
        eq(playEvents.trackId, params.id),
        eq(playEvents.userId, userId),
        gt(playEvents.playedAt, cutoff)
      )
    )
    .orderBy(desc(playEvents.playedAt))
    .limit(1);

  if (recent) return NextResponse.json({ ok: true, counted: false });

  await db.insert(playEvents).values({
    id: nanoid(),
    trackId: params.id,
    userId,
    playedAt: new Date(),
  });

  return NextResponse.json({ ok: true, counted: true });
}
