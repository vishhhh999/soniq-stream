import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { otpCodes, users } from "@/lib/db/schema";
import { eq, and, gt, desc } from "drizzle-orm";
import { signIn } from "@/auth";
import { isEmailAllowed } from "@/lib/allowedEmails";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  try {
    const { email, code, password } = await req.json();

    if (!email || !code || !password) {
      return NextResponse.json({ error: "Email, code, and password are required." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const now = new Date();

    // Defense-in-depth: the request step already checked this, but re-check
    // here too in case ALLOWED_EMAILS changed between request and verify.
    if (!isEmailAllowed(normalizedEmail)) {
      return NextResponse.json({ error: "Signup isn't open to this email address." }, { status: 403 });
    }

    // Find the most recent unexpired OTP for this email.
    const [otp] = await db
      .select()
      .from(otpCodes)
      .where(and(eq(otpCodes.email, normalizedEmail), gt(otpCodes.expiresAt, now)))
      .orderBy(desc(otpCodes.createdAt))
      // Most recent first — take the last one issued.
      .limit(1);

    if (!otp) {
      return NextResponse.json(
        { error: "No valid code found. Request a new one." },
        { status: 400 }
      );
    }

    if (otp.attempts >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: "Too many incorrect attempts. Request a new code." },
        { status: 400 }
      );
    }

    const valid = await bcrypt.compare(code.trim(), otp.codeHash);

    if (!valid) {
      // Increment attempt counter.
      await db
        .update(otpCodes)
        .set({ attempts: otp.attempts + 1 })
        .where(eq(otpCodes.id, otp.id));

      const remaining = MAX_ATTEMPTS - (otp.attempts + 1);
      return NextResponse.json(
        { error: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` },
        { status: 400 }
      );
    }

    // Code is valid — check no account was created in the meantime.
    const [existingUser] = await db.select().from(users).where(eq(users.email, normalizedEmail));
    if (existingUser) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    // Create the user.
    const passwordHash = await bcrypt.hash(password, 10);
    await db.insert(users).values({
      id: nanoid(),
      email: normalizedEmail,
      passwordHash,
      createdAt: new Date(),
    });

    // Clean up all OTP rows for this email (success path).
    await db.delete(otpCodes).where(eq(otpCodes.email, normalizedEmail));

    // Sign them in immediately via credentials so they land on the app,
    // not on another login prompt. redirect: false so we can handle response.
    // NOTE: signIn from auth.ts in a server route returns a redirect Response
    // when redirect is not suppressed. We return a success signal and let the
    // client call signIn("credentials") itself — cleaner than intercepting the
    // NextAuth redirect here.
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("OTP verify failed:", err);
    return NextResponse.json({ error: "Verification failed. Try again." }, { status: 500 });
  }
}
