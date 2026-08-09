import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getStripe } from "@/lib/stripe";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

// Requires STRIPE_WEBHOOK_SECRET — from the Stripe dashboard's webhook
// endpoint config (Developers → Webhooks → your endpoint → Signing
// secret), NOT the same value as STRIPE_SECRET_KEY. Point the endpoint at
// https://www.soniq.lol/api/billing/webhook and subscribe it to at least:
// checkout.session.completed, customer.subscription.updated,
// customer.subscription.deleted.
//
// This route reads the RAW request body for signature verification — do
// not add any body-parsing middleware in front of it, and do not call
// req.json() before req.text() here.
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set — rejecting webhook.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      // Fires once, right when checkout succeeds. This is where we learn
      // the Stripe customer id for the first time and link it to our user.
      case "checkout.session.completed": {
        const checkoutSession = event.data.object as Stripe.Checkout.Session;
        const userId = checkoutSession.client_reference_id || (checkoutSession.subscription as any)?.metadata?.userId;
        const customerId = typeof checkoutSession.customer === "string" ? checkoutSession.customer : checkoutSession.customer?.id;
        const subscriptionId = typeof checkoutSession.subscription === "string" ? checkoutSession.subscription : checkoutSession.subscription?.id;
        if (!userId || !customerId) {
          console.error("checkout.session.completed missing userId or customerId", { userId, customerId });
          break;
        }

        let periodEnd: Date | null = null;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          // This Stripe API version moved current_period_end off the
          // top-level Subscription object onto its first item (billing
          // periods became per-item to support multi-price subscriptions).
          // We only ever create single-item subscriptions, so item 0 is it.
          periodEnd = subPeriodEnd(sub);
        }

        await db
          .update(users)
          .set({
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId ?? null,
            subscriptionStatus: "active",
            subscriptionPeriodEnd: periodEnd,
          })
          .where(eq(users.id, userId));
        break;
      }

      // Fires on renewals, plan changes, payment failures (past_due), and
      // when a cancellation is scheduled (cancel_at_period_end — status
      // stays 'active' until the period actually ends, which is correct:
      // they paid for that period, they keep access through it).
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveUserId(sub);
        if (!userId) break;

        await db
          .update(users)
          .set({
            subscriptionStatus: sub.status,
            subscriptionPeriodEnd: subPeriodEnd(sub),
          })
          .where(eq(users.id, userId));
        break;
      }

      // Fires when a subscription is actually gone (immediate cancel, or
      // the period-end arrives after a cancel_at_period_end). Downgrade to
      // free — isPaidStatus() only treats 'active'/'past_due' as paid, so
      // 'canceled' immediately loses the unlimited-storage allowance.
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveUserId(sub);
        if (!userId) break;

        await db
          .update(users)
          .set({
            subscriptionStatus: "canceled",
            stripeSubscriptionId: null,
            subscriptionPeriodEnd: null,
          })
          .where(eq(users.id, userId));
        break;
      }

      default:
        // Not every event type needs handling — Stripe sends many we
        // don't act on (invoice.created, payment_method.attached, etc).
        break;
    }
  } catch (err) {
    console.error(`Error handling Stripe webhook event ${event.type}:`, err);
    // Still 200 — returning an error here makes Stripe retry, which is
    // only useful if the failure was transient (DB blip). Log and move on
    // rather than getting stuck retrying a permanently-failing event.
  }

  return NextResponse.json({ received: true });
}

// This Stripe API version moved current_period_end off the top-level
// Subscription object onto each subscription item (billing periods became
// per-item, to support multi-price subscriptions with different renewal
// dates per item). We only ever create single-item subscriptions via the
// checkout route, so item 0's period end is always the right one to use.
function subPeriodEnd(sub: Stripe.Subscription): Date | null {
  const item = sub.items.data[0];
  if (!item) return null;
  return new Date(item.current_period_end * 1000);
}

// Resolves which of our users a Stripe subscription belongs to. Tries the
// metadata stamped at checkout first (subscription_data.metadata.userId in
// the checkout route), falls back to looking up by stripeCustomerId for
// subscriptions that predate that metadata or were modified directly in
// the Stripe dashboard.
async function resolveUserId(sub: Stripe.Subscription): Promise<string | null> {
  const metaUserId = (sub.metadata as any)?.userId;
  if (metaUserId) return metaUserId;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.stripeCustomerId, customerId));
  return user?.id ?? null;
}
