import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { albums, albumMembers, users, inviteLinks } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [album] = await db.select().from(albums).where(and(eq(albums.id, params.id), eq(albums.userId, userId)));
  if (!album) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Members
  const members = await db
    .select({
      id: albumMembers.id,
      userId: albumMembers.userId,
      canEdit: albumMembers.canEdit,
      canDownload: albumMembers.canDownload,
      createdAt: albumMembers.createdAt,
    })
    .from(albumMembers)
    .where(eq(albumMembers.albumId, params.id));

  // Enrich with usernames + avatars
  const memberUserIds = members.map((m) => m.userId);
  const memberUsers =
    memberUserIds.length > 0
      ? await db
          .select({ id: users.id, username: users.username, avatarUrl: users.avatarUrl })
          .from(users)
          .where(inArray(users.id, memberUserIds))
      : [];
  const userMap = new Map(memberUsers.map((u) => [u.id, u]));

  const enrichedMembers = members.map((m) => ({
    ...m,
    username: userMap.get(m.userId)?.username ?? null,
    avatarUrl: userMap.get(m.userId)?.avatarUrl ?? null,
  }));

  // Active invite link (most recent active one)
  const [inviteLink] = await db
    .select()
    .from(inviteLinks)
    .where(and(eq(inviteLinks.albumId, params.id), eq(inviteLinks.active, true)))
    .limit(1);

  return NextResponse.json({
    accessMode: album.accessMode ?? "private",
    allowEdit: album.allowEdit ?? false,
    allowDownload: album.allowDownload ?? false,
    members: enrichedMembers,
    inviteLink: inviteLink ?? null,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [album] = await db.select().from(albums).where(and(eq(albums.id, params.id), eq(albums.userId, userId)));
  if (!album) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = await req.json();
  const allowed = ["accessMode", "allowEdit", "allowDownload"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];

  await db.update(albums).set(update).where(eq(albums.id, params.id));
  return NextResponse.json({ ok: true });
}
