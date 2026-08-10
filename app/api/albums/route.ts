import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { albums, users } from "@/lib/db/schema";
import { desc, eq, ne } from "drizzle-orm";
import { isAdminUsername } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const ownRows = await db.select().from(albums).where(eq(albums.userId, userId)).orderBy(desc(albums.createdAt));

  // Admin cross-user read access — see the matching comment in
  // app/api/tracks/route.ts, same reasoning applies here.
  const [me] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId));
  if (isAdminUsername(me?.username)) {
    const otherRows = await db
      .select({ album: albums, ownerUsername: users.username, ownerAvatarUrl: users.avatarUrl })
      .from(albums)
      .innerJoin(users, eq(albums.userId, users.id))
      .where(ne(albums.userId, userId))
      .orderBy(desc(albums.createdAt));

    const tagged = otherRows.map((r) => ({
      ...r.album,
      ownerUsername: r.ownerUsername,
      ownerAvatarUrl: r.ownerAvatarUrl,
      isAdminView: true,
    }));
    return NextResponse.json([...ownRows.map((a) => ({ ...a, isAdminView: false })), ...tagged]);
  }

  return NextResponse.json(ownRows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { name, folderId } = await req.json();
  const row = { id: nanoid(), userId, name, folderId: folderId || null, coverUrl: null, createdAt: new Date() };
  await db.insert(albums).values(row);
  return NextResponse.json(row);
}
