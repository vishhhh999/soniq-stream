import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const existing = await db.select().from(users).limit(1);
  return NextResponse.json({ needsSetup: existing.length === 0 });
}

// Signup is now open at any time, not just once — reuses the same
// ALLOWED_EMAILS allowlist already used for Google sign-in if it's set, so
// this doesn't become fully public registration on a private file library.
// If ALLOWED_EMAILS isn't configured at all, signup is unrestricted — set
// it if you want this locked down to specific people.
export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password || password.length < 8) {
      return NextResponse.json({ error: "Email and a password of at least 8 characters are required." }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const allowed = (process.env.ALLOWED_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (allowed.length > 0 && !allowed.includes(normalizedEmail)) {
      return NextResponse.json({ error: "This email isn't on the allowed list for this library." }, { status: 403 });
    }

    const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail));
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await db.insert(users).values({
      id: nanoid(),
      email: normalizedEmail,
      passwordHash,
      createdAt: new Date(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Setup failed:", err);
    return NextResponse.json({ error: "Setup failed. Check server logs." }, { status: 500 });
  }
}
