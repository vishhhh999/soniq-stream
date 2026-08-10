import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sendContactEmail } from "@/lib/email";
import { db } from "@/lib/db";
import { contactRateLimits } from "@/lib/db/schema";
import { and, gt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

export const dynamic = "force-dynamic";

const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX = 5;

// Public — no auth. Deliberately not stored in the DB anywhere; this is a
// pure forward-to-inbox endpoint, not a support-ticket system.
export async function POST(req: NextRequest) {
  try {
    // Same class of rate limit the OTP route already has — this route had
    // none at all before, despite sending a real email on every valid
    // request. IP hashed (never stored raw) purely to throttle, not to
    // identify anyone.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
    const ipHash = crypto.createHash("sha256").update(ip).digest("hex");
    const windowStart = new Date(Date.now() - RATE_WINDOW_MS);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contactRateLimits)
      .where(and(sql`${contactRateLimits.ipHash} = ${ipHash}`, gt(contactRateLimits.createdAt, windowStart)));

    if (Number(count) >= RATE_MAX) {
      return NextResponse.json({ error: "Too many messages sent. Try again in a bit." }, { status: 429 });
    }

    const { name, email, message } = await req.json();

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== "string" || !emailRe.test(email)) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }
    if (!message || typeof message !== "string" || message.trim().length < 5) {
      return NextResponse.json({ error: "Message is too short." }, { status: 400 });
    }
    if (message.length > 5000) {
      return NextResponse.json({ error: "Message is too long." }, { status: 400 });
    }

    await sendContactEmail({ name: name.trim(), email: email.trim(), message: message.trim() });
    await db.insert(contactRateLimits).values({ id: nanoid(), ipHash, createdAt: new Date() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Contact form send failed:", err);
    return NextResponse.json({ error: "Couldn't send your message. Try again in a moment." }, { status: 500 });
  }
}
