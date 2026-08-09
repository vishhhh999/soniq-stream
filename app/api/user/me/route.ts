import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isPaidStatus, getStorageUsedBytes, FREE_TIER_STORAGE_BYTES } from "@/lib/billing";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      passwordHash: users.passwordHash,
      avatarUrl: users.avatarUrl,
      subscriptionStatus: users.subscriptionStatus,
      subscriptionPeriodEnd: users.subscriptionPeriodEnd,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const isPaid = isPaidStatus(user.subscriptionStatus, user.subscriptionPeriodEnd);
  const storageUsedBytes = await getStorageUsedBytes(userId);

  return NextResponse.json({
    id: user.id,
    email: user.email,
    username: user.username,
    avatarUrl: user.avatarUrl ?? null,
    hasPassword: !!user.passwordHash,
    plan: {
      isPaid,
      status: user.subscriptionStatus ?? "free",
      periodEnd: user.subscriptionPeriodEnd,
      storageUsedBytes,
      storageCapBytes: isPaid ? null : FREE_TIER_STORAGE_BYTES,
    },
  });
}
