import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { currentPassword, newPassword } = await req.json();
  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  // If a password is already set, the current one must be verified before
  // it can be changed — the session alone isn't enough proof, same reason
  // most account settings pages ask for your current password again.
  // Google-only accounts (no password yet) skip this since there's
  // nothing to verify against; this is the account's own owner setting a
  // second sign-in method on their own already-authenticated account, not
  // the cross-account-linking scenario auth.ts guards against.
  if (user.passwordHash) {
    if (!currentPassword) {
      return NextResponse.json({ error: "Current password is required." }, { status: 400 });
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId));

  return NextResponse.json({ ok: true });
}
