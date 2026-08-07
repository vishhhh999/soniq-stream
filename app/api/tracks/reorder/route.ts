import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user && (session.user as any).id;
    if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { trackIds } = await req.json();
    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      return NextResponse.json({ error: "trackIds array is required" }, { status: 400 });
    }

    // Confirm every track in the reorder request actually belongs to this
    // user — without this, a request could reassign sort order on tracks
    // owned by someone else just by knowing their ids.
    const owned = await db.select({ id: tracks.id }).from(tracks).where(and(inArray(tracks.id, trackIds), eq(tracks.userId, userId)));
    const ownedIds = new Set(owned.map((t) => t.id));
    const validIds = trackIds.filter((id: string) => ownedIds.has(id));

    await Promise.all(
      validIds.map((id: string, index: number) =>
        db.update(tracks).set({ sortOrder: index }).where(eq(tracks.id, id))
      )
    );

    return NextResponse.json({ ok: true, reordered: validIds.length });
  } catch (err) {
    console.error("Reorder failed:", err);
    return NextResponse.json({ error: "Reorder failed." }, { status: 500 });
  }
}
