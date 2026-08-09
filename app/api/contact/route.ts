import { NextRequest, NextResponse } from "next/server";
import { sendContactEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// Public — no auth. Deliberately not stored in the DB anywhere; this is a
// pure forward-to-inbox endpoint, not a support-ticket system.
export async function POST(req: NextRequest) {
  try {
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
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Contact form send failed:", err);
    return NextResponse.json({ error: "Couldn't send your message. Try again in a moment." }, { status: 500 });
  }
}
