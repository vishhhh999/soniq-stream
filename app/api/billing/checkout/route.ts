import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getRazorpay } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

// Requires RAZORPAY_PLAN_ID — the Plan created in the Razorpay dashboard
// (Subscriptions -> Plans). Unlike Stripe there's no hosted checkout page:
// this creates a Subscription object server-side and returns its id, then
// the frontend opens Razorpay's own checkout.js modal against that id to
// actually collect payment.
export async function POST(_req: NextRequest) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const planId = process.env.RAZORPAY_PLAN_ID;
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!planId || !keyId) return NextResponse.json({ error: "Billing is not configured yet." }, { status: 500 });

  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  if (!user) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const razorpay = getRazorpay();

  try {
    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      // Razorpay requires a finite number of billing cycles up front —
      // there's no literal "until cancelled" option. 120 monthly cycles is
      // 10 years, which is effectively indefinite for a $5/mo product;
      // cancellation is still available at any time via the cancel route.
      total_count: 120,
      customer_notify: 1,
      // Stashed here so the webhook (which only receives the subscription
      // object, not our session) can resolve which of our users this
      // belongs to — same role Stripe's subscription_data.metadata played.
      notes: { userId },
    });

    // Recorded immediately, before payment is actually confirmed — status
    // stays 'free' internally (see mapRazorpayStatus: 'created' maps to
    // 'free') until the webhook's subscription.activated event fires, but
    // having the id on file now means the webhook can also find the user
    // via a DB lookup as a fallback if the notes payload is ever missing.
    await db.update(users).set({ razorpaySubscriptionId: subscription.id }).where(eq(users.id, userId));

    return NextResponse.json({ subscriptionId: subscription.id, keyId });
  } catch (err) {
    console.error("Razorpay subscription creation failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Could not start checkout: ${message}` }, { status: 502 });
  }
}
