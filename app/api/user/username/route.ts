import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";

export const dynamic = "force-dynamic";

// 3-20 chars, alphanumeric + underscore only, no leading/trailing underscores.
const USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_]{1,18}[a-zA-Z0-9]$|^[a-zA-Z0-9]{3}$/;

export async function PATCH(req: NextRequest) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { username } = await req.json();
  if (!username || typeof username !== "string") {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }

  const normalized = username.trim().toLowerCase();

  if (!USERNAME_RE.test(normalized)) {
    return NextResponse.json(
      { error: "3–20 characters, letters, numbers, and underscores only." },
      { status: 400 }
    );
  }

  // Check uniqueness (exclude current user so they can re-save their own name).
  const [conflict] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, normalized), ne(users.id, userId)));

  if (conflict) {
    return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
  }

  await db.update(users).set({ username: normalized }).where(eq(users.id, userId));

  return NextResponse.json({ ok: true, username: normalized });
}
