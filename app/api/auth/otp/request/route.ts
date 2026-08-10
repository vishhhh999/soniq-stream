import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { otpCodes, users } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { sendOtpEmail } from "@/lib/email";
import { isEmailAllowed } from "@/lib/allowedEmails";

export const dynamic = "force-dynamic";

// Rate limit: max 3 OTP requests per email per 10 minutes.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 3;
const OTP_TTL_MS = 10 * 60 * 1000; // code expires in 10 min

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Documented (README/handoff) as a real, working restriction on who
    // can sign up — but the actual allowlist check didn't exist anywhere
    // in the codebase until now. If ALLOWED_EMAILS is unset, signup stays
    // fully open (matches documented "leave unset if you want it open").
    if (!isEmailAllowed(normalizedEmail)) {
      return NextResponse.json({ error: "Signup isn't open to this email address." }, { status: 403 });
    }

    // Block if an account already exists with this email.
    const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail));
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    // Rate limit: count recent OTP requests for this email.
    const windowStart = new Date(Date.now() - RATE_WINDOW_MS);
    const recent = await db
      .select()
      .from(otpCodes)
      .where(and(eq(otpCodes.email, normalizedEmail), gt(otpCodes.createdAt, windowStart)));

    if (recent.length >= RATE_MAX) {
      return NextResponse.json(
        { error: "Too many code requests. Wait a few minutes and try again." },
        { status: 429 }
      );
    }

    // Generate a 6-digit code, hash it for storage.
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 10);

    await db.insert(otpCodes).values({
      id: nanoid(),
      email: normalizedEmail,
      codeHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      attempts: 0,
      createdAt: new Date(),
    });

    await sendOtpEmail(normalizedEmail, code);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("OTP request failed:", err);
    return NextResponse.json({ error: "Failed to send verification code." }, { status: 500 });
  }
}
