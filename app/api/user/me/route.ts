import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [user] = await db
    .select({ id: users.id, email: users.email, username: users.username, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  // Never return the hash itself, just whether one exists — the client
  // uses this to show "Set password" vs "Change password" (Google-only
  // accounts have none).
  return NextResponse.json({ id: user.id, email: user.email, username: user.username, hasPassword: !!user.passwordHash });
}
