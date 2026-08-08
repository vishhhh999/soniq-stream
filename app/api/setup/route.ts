import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const existing = await db.select().from(users).limit(1);
  return NextResponse.json({ needsSetup: existing.length === 0 });
}

// This route is now only used for the initial "does any user exist?" check (GET).
// Account creation is handled via OTP flow: /api/auth/otp/request + /api/auth/otp/verify.
// POST is kept as a stub so old clients don't 404, but it returns 410 Gone.
export async function POST() {
  return NextResponse.json(
    { error: "Direct signup is no longer supported. Use the email verification flow." },
    { status: 410 }
  );
}
