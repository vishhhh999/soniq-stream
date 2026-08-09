import Stripe from "stripe";

// Requires STRIPE_SECRET_KEY in the environment (Vercel + .env.local).
// Throws at first use, not at import time, so the app doesn't crash on
// pages/routes that never touch billing if the env var is briefly unset.
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  _stripe = new Stripe(key);
  return _stripe;
}
