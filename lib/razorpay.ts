import Razorpay from "razorpay";

// Requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the environment.
// Throws at first use, not at import time, so pages/routes that never
// touch billing don't crash if the env vars are briefly unset.
let _razorpay: Razorpay | null = null;

export function getRazorpay(): Razorpay {
  if (_razorpay) return _razorpay;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set.");
  _razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return _razorpay;
}
