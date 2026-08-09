import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// Requires STRIPE_PRICE_ID — the recurring $5/mo Price object's id from the
// Stripe dashboard (Products → your product → the monthly Price). Not the
// Product id, the Price id (starts with `price_`).
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) return NextResponse.json({ error: "Billing is not configured yet." }, { status: 500 });

  const [user] = await db.select({ email: users.email, stripeCustomerId: users.stripeCustomerId }).from(users).where(eq(users.id, userId));
  if (!user) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const stripe = getStripe();
  const origin = req.headers.get("origin") || "https://www.soniq.lol";

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // Reuse an existing Stripe customer if this user already has one
      // (e.g. a previously canceled subscription) instead of creating a
      // duplicate customer record on every checkout attempt.
      customer: user.stripeCustomerId || undefined,
      customer_email: user.stripeCustomerId ? undefined : user.email,
      client_reference_id: userId,
      // Also stamped in metadata so the webhook can resolve the user even
      // if it receives a subscription/invoice event that doesn't carry
      // client_reference_id directly (only checkout.session does).
      subscription_data: { metadata: { userId } },
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
    });
    if (!checkoutSession.url) throw new Error("Stripe did not return a checkout URL.");
    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("Stripe checkout session creation failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Could not start checkout: ${message}` }, { status: 502 });
  }
}
