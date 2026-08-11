"use client";

// Predefined price table -- no live exchange rates, updated manually if
// pricing ever changes. The guess is a coarse timezone heuristic, not a
// real geolocation lookup (no IP service, no permission prompt), good
// enough to pick a sensible display currency without adding a network
// dependency or privacy surface to the pricing section.
//
// IMPORTANT SCOPE NOTE: this only changes what price is *displayed*.
// Razorpay subscriptions are created server-side against a single
// Razorpay Plan (see app/api/billing/checkout/route.ts), which charges in
// whatever currency that Plan was configured with in the Razorpay
// dashboard (typically INR). Actually charging a different currency per
// region requires separate Razorpay Plans per currency and server-side
// selection logic -- that's a real backend change, not implemented here.
// If the displayed price and the actual charge need to match exactly,
// that's the next piece of work.

export type CurrencyCode = "USD" | "INR" | "GBP" | "EUR" | "CAD" | "AUD";

interface PriceInfo {
  code: CurrencyCode;
  symbol: string;
  monthly: number;
  yearly: number;
}

export const PRICING: Record<CurrencyCode, PriceInfo> = {
  USD: { code: "USD", symbol: "$", monthly: 5, yearly: 40 },
  INR: { code: "INR", symbol: "₹", monthly: 500, yearly: 4000 },
  GBP: { code: "GBP", symbol: "£", monthly: 4, yearly: 32 },
  EUR: { code: "EUR", symbol: "€", monthly: 5, yearly: 40 },
  CAD: { code: "CAD", symbol: "CA$", monthly: 7, yearly: 56 },
  AUD: { code: "AUD", symbol: "AU$", monthly: 8, yearly: 64 },
};

const CANADA_TIMEZONES = new Set([
  "America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg",
  "America/Halifax", "America/St_Johns", "America/Regina",
]);

export function guessCurrency(): CurrencyCode {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.startsWith("Asia/Kolkata") || tz.startsWith("Asia/Calcutta")) return "INR";
    if (tz.startsWith("Europe/London")) return "GBP";
    if (tz.startsWith("Australia/")) return "AUD";
    if (CANADA_TIMEZONES.has(tz)) return "CAD";
    if (tz.startsWith("America/")) return "USD";
    if (tz.startsWith("Europe/")) return "EUR";
  } catch {
    // Intl unsupported or blocked -- fall through to default.
  }
  return "USD";
}

export function isLikelyIndia(): boolean {
  return guessCurrency() === "INR";
}

export function formatPrice(amount: number, currency: CurrencyCode): string {
  const { symbol } = PRICING[currency];
  // INR conventionally has no decimal for round numbers like these; the
  // rest follow the same pattern since all these prices are whole numbers.
  return `${symbol}${amount}`;
}
