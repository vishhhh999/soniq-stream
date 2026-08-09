import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { and, count, desc, eq } from "drizzle-orm";

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

  // Count unseen across ALL notifications, not just the last-50 page —
  // filtering `items` directly undercounted the badge for anyone with
  // more than 50 unread notifications.
  const [{ value: unseenCount }] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.recipientUserId, userId), eq(notifications.seen, false)));

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
