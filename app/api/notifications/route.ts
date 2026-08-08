import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const items = await db
    .select()
    .from(notifications)
    .where(eq(notifications.recipientUserId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  const unseenCount = items.filter((n) => !n.seen).length;
  return NextResponse.json({ items, unseenCount });
}

// Mark all notifications as seen for the current user.
export async function PATCH() {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  await db
    .update(notifications)
    .set({ seen: true })
    .where(and(eq(notifications.recipientUserId, userId), eq(notifications.seen, false)));

  return NextResponse.json({ ok: true });
}
