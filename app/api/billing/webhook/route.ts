import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { mapRazorpayStatus } from "@/lib/billing";

export const dynamic = "force-dynamic";

// Requires RAZORPAY_WEBHOOK_SECRET — this is a value YOU make up yourself
// when setting up the webhook in the Razorpay dashboard (Settings ->
// Webhooks), unlike Stripe which generates one for you. Point the webhook
// at https://www.soniq.lol/api/billing/webhook, subscribed to at least:
// subscription.activated, subscription.charged, subscription.halted,
// subscription.cancelled.
//
// This route reads the RAW request body for signature verification — do
// not add body-parsing middleware in front of it, and read the body as
// text before doing anything else with the request.
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("RAZORPAY_WEBHOOK_SECRET is not set — rejecting webhook.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const signature = req.headers.get("x-razorpay-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  const rawBody = await req.text();

  const expectedSignature = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  // timingSafeEqual requires equal-length buffers — a plain !== compare
  // here would leak timing information about how much of the signature
  // matched, which is exactly what HMAC verification is meant to prevent.
  const signaturesMatch =
    signature.length === expectedSignature.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

  if (!signaturesMatch) {
    console.error("Razorpay webhook signature verification failed.");
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    const sub = event.payload?.subscription?.entity;
    if (!sub) {
      // Some event types (payment.captured etc, if ever subscribed to)
      // don't carry a subscription payload — nothing to do with those here.
      return NextResponse.json({ received: true });
    }

    const userId = await resolveUserId(sub);
    if (!userId) {
      console.error(`Could not resolve a user for Razorpay subscription ${sub.id}`);
      return NextResponse.json({ received: true });
    }

    switch (event.event) {
      // Fires once, right when the first payment succeeds.
      case "subscription.activated":
      // Fires on every successful renewal charge.
      case "subscription.charged": {
        await db
          .update(users)
          .set({
            subscriptionStatus: mapRazorpayStatus(sub.status),
            subscriptionPeriodEnd: sub.current_end ? new Date(sub.current_end * 1000) : null,
          })
          .where(eq(users.id, userId));
        break;
      }

      // Fires after repeated failed charge attempts — Razorpay has already
      // retried by this point, this is closer to Stripe's terminal
      // past_due state than a first-attempt failure.
      case "subscription.halted": {
        await db
          .update(users)
          .set({ subscriptionStatus: "past_due" })
          .where(eq(users.id, userId));
        break;
      }

      // Fires when a subscription is actually gone — either cancelled
      // immediately, or (since our cancel route uses cancelAtCycleEnd)
      // once the period the user already paid for actually ends.
      case "subscription.cancelled": {
        await db
          .update(users)
          .set({
            subscriptionStatus: "canceled",
            razorpaySubscriptionId: null,
            subscriptionPeriodEnd: null,
          })
          .where(eq(users.id, userId));
        break;
      }

      default:
        // Not every event type needs handling.
        break;
    }
  } catch (err) {
    console.error(`Error handling Razorpay webhook event ${event?.event}:`, err);
    // Still 200 — Razorpay retries on non-2xx, which only helps for
    // transient failures (DB blip). Log and move on rather than getting
    // stuck retrying a permanently-failing event.
  }

  return NextResponse.json({ received: true });
}

// Resolves which of our users a Razorpay subscription belongs to. Tries
// the notes payload stamped at creation first (see the checkout route),
// falls back to a DB lookup by the subscription id itself for
// subscriptions that predate that notes field or were modified directly
// in the Razorpay dashboard.
async function resolveUserId(sub: any): Promise<string | null> {
  const notesUserId = sub.notes?.userId;
  if (notesUserId) return notesUserId;

  if (!sub.id) return null;
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.razorpaySubscriptionId, sub.id));
  return user?.id ?? null;
}
