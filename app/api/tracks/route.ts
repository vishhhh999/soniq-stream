import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { tracks, users } from "@/lib/db/schema";
import { asc, desc, eq, ne, isNull, and } from "drizzle-orm";
import { isAdminUsername } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const ownRows = await db.select().from(tracks).where(eq(tracks.userId, userId)).orderBy(asc(tracks.sortOrder), desc(tracks.createdAt));

  // Admin cross-user read access (see lib/adminAccess.ts) — every other
  // user's tracks are appended, tagged so the client can render them
  // read-only with an owner badge and never treat them as the admin's
  // own. Ownership itself is unchanged: PATCH/DELETE on these still
  // requires tracks.userId === the requester, so even if the client ever
  // got this wrong, editing/deleting someone else's track is still
  // rejected server-side.
  const [me] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId));
  if (isAdminUsername(me?.username)) {
    const otherRows = await db
      .select({ track: tracks, ownerUsername: users.username })
      .from(tracks)
      .innerJoin(users, eq(tracks.userId, users.id))
      // Same reasoning as the albums route — exclude other users' saved
      // COPIES of a track (originalTrackId set), not just their own
      // uploads. Without this, a track shared with N people would surface
      // N+1 times in admin search results (the real original plus every
      // receiver's synced copy of the same audio).
      .where(and(ne(tracks.userId, userId), isNull(tracks.originalTrackId)))
      .orderBy(desc(tracks.createdAt));

    const tagged = otherRows.map((r) => ({ ...r.track, ownerUsername: r.ownerUsername, isAdminView: true }));
    return NextResponse.json([...ownRows.map((t) => ({ ...t, isAdminView: false })), ...tagged]);
  }

  return NextResponse.json(ownRows);
}
