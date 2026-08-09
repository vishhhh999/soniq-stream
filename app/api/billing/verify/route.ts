import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Called from the frontend's checkout success handler (see SettingsModal's
// startUpgrade), right after Razorpay's modal closes successfully. This
// exists purely to flip the UI to "Pro" instantly instead of waiting on
// the webhook, which can lag by a few seconds — the WEBHOOK remains the
// authoritative source of truth for subscriptionStatus (see
// app/api/billing/webhook/route.ts), this just gets there faster when it
// can be verified as genuine.
//
// Signature formula for Subscriptions is DIFFERENT from Orders — Orders
// use order_id|payment_id, Subscriptions use payment_id|subscription_id.
// Mixing these up is a common integration mistake and silently produces a
// signature that never matches.
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = await req.json().catch(() => ({}));
  if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return NextResponse.json({ error: "Billing is not configured yet." }, { status: 500 });

  // Confirm this subscription id actually belongs to the requesting user
  // — without this, a signature that's valid but for a DIFFERENT user's
  // subscription would still pass the HMAC check below.
  const [user] = await db.select({ razorpaySubscriptionId: users.razorpaySubscriptionId }).from(users).where(eq(users.id, userId));
  if (!user || user.razorpaySubscriptionId !== razorpay_subscription_id) {
    return NextResponse.json({ error: "Subscription does not belong to this account." }, { status: 403 });
  }

  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
    .digest("hex");

  const signaturesMatch =
    razorpay_signature.length === expectedSignature.length &&
    crypto.timingSafeEqual(Buffer.from(razorpay_signature), Buffer.from(expectedSignature));

  if (!signaturesMatch) {
    return NextResponse.json({ error: "Signature mismatch." }, { status: 400 });
  }

  // Optimistic — the webhook will independently confirm (or correct) this
  // moments later via subscription.activated. Not marking 'comped', this
  // is a real paid activation.
  await db.update(users).set({ subscriptionStatus: "active" }).where(eq(users.id, userId));

  return NextResponse.json({ ok: true });
}
