import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getRazorpay } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

// Razorpay doesn't offer a hosted self-serve billing portal the way
// Stripe does for standard accounts, so cancellation is a direct API call
// triggered from our own Settings UI instead of a redirect. Cancels at
// the end of the current billing cycle by default — the user already
// paid for it, they keep access through it (mirrors how the old Stripe
// cancel_at_period_end behavior worked).
export async function POST(_req: NextRequest) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [user] = await db.select({ razorpaySubscriptionId: users.razorpaySubscriptionId }).from(users).where(eq(users.id, userId));
  if (!user?.razorpaySubscriptionId) {
    return NextResponse.json({ error: "No active subscription found." }, { status: 404 });
  }

  const razorpay = getRazorpay();

  try {
    // cancelAtCycleEnd = true — access continues until the period they
    // already paid for ends. The webhook's subscription.cancelled event
    // (fired once that happens) is what actually flips subscriptionStatus.
    await razorpay.subscriptions.cancel(user.razorpaySubscriptionId, true);
    return NextResponse.json({ ok: true, cancelsAtPeriodEnd: true });
  } catch (err) {
    console.error("Razorpay subscription cancellation failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Could not cancel: ${message}` }, { status: 502 });
  }
}
