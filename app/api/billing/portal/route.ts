import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [user] = await db.select({ stripeCustomerId: users.stripeCustomerId }).from(users).where(eq(users.id, userId));
  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account found for this user yet." }, { status: 404 });
  }

  const stripe = getStripe();
  const origin = req.headers.get("origin") || "https://www.soniq.lol";

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${origin}/`,
    });
    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    console.error("Stripe billing portal session creation failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Could not open billing portal: ${message}` }, { status: 502 });
  }
}
