import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const existing = await db.select().from(users).limit(1);
  return NextResponse.json({ needsSetup: existing.length === 0 });
}

// Creates exactly one account — this isn't open signup. Once a user exists,
// this route refuses to create another, so it can stay unauthenticated
// (no chicken-and-egg problem on first run) without becoming a way for
// anyone else to register later.
export async function POST(req: NextRequest) {
  try {
    const existing = await db.select().from(users).limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: "An account already exists." }, { status: 403 });
    }

    const { email, password } = await req.json();
    if (!email || !password || password.length < 8) {
      return NextResponse.json({ error: "Email and a password of at least 8 characters are required." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await db.insert(users).values({
      id: nanoid(),
      email: email.toLowerCase().trim(),
      passwordHash,
      createdAt: new Date(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Setup failed:", err);
    return NextResponse.json({ error: "Setup failed. Check server logs." }, { status: 500 });
  }
}
