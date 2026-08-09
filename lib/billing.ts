import { db } from "@/lib/db";
import { tracks, users } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

// Free tier: storage cap only, no track-count or feature gating — per
// Vish's call. Paid tier removes the cap entirely. Chosen to sit below
// what a real work-in-progress producer's library needs quickly, since
// the whole point is that it nudges an upgrade, not that it's comfortable
// to live on indefinitely.
export const FREE_TIER_STORAGE_BYTES = 500 * 1024 * 1024; // 500MB
export const PRICE_MONTHLY_USD = 5;
export const PRICE_YEARLY_USD = 40; // ~33% off vs 12x monthly ($60)

// Statuses that count as "paid" for enforcement purposes. 'past_due' still
// counts — Razorpay retries a failed charge for a few days before actually
// halting the subscription; cutting access off the instant one charge
// attempt fails would be a harsh, premature downgrade for what's usually a
// transient card issue.
//
// 'comped' is separate from real Razorpay statuses — it's for manually
// granted access (see scripts/admin.js), and unlike 'active'/'past_due' it
// has no webhook keeping it honest, so it's checked against
// subscriptionPeriodEnd directly in isPaidStatus below rather than being
// unconditionally true.
const PAID_STATUSES = new Set(["active", "past_due"]);

// Razorpay's own subscription statuses ('created', 'authenticated',
// 'active', 'pending', 'halted', 'cancelled', 'completed', 'expired') get
// collapsed onto our smaller internal set here, so the rest of the app
// only ever deals with 'free' | 'active' | 'past_due' | 'canceled' | 'comped'.
export function mapRazorpayStatus(razorpayStatus: string): string {
  switch (razorpayStatus) {
    case "active":
      return "active";
    case "pending":
    case "halted":
      return "past_due";
    case "cancelled":
    case "completed":
    case "expired":
      return "canceled";
    default:
      // 'created', 'authenticated' — subscription exists but the first
      // payment hasn't gone through yet. Not paid yet.
      return "free";
  }
}

// periodEnd matters for 'comped' grants specifically — a real Razorpay
// subscription's status gets flipped by the webhook when it actually
// lapses, but a manually-granted comp has no external trigger for that,
// so this checks the expiry directly instead of trusting the status
// string alone. null periodEnd on a comped grant means permanent (no
// expiry — see scripts/admin.js's --forever flag).
export function isPaidStatus(
  status: string | null | undefined,
  periodEnd?: Date | string | null
): boolean {
  if (!status) return false;
  if (PAID_STATUSES.has(status)) return true;
  if (status === "comped") {
    if (!periodEnd) return true; // permanent grant
    return new Date(periodEnd).getTime() > Date.now();
  }
  return false;
}

export async function getUserPlan(userId: string) {
  const [user] = await db
    .select({
      subscriptionStatus: users.subscriptionStatus,
      subscriptionPeriodEnd: users.subscriptionPeriodEnd,
      razorpaySubscriptionId: users.razorpaySubscriptionId,
    })
    .from(users)
    .where(eq(users.id, userId));
  return user ?? null;
}

// Sums fileSize across every track a user owns, INCLUDING tracks that are
// synced copies inside a saved shared album (they physically occupy R2
// storage under this user's own key prefix — see the CopyObjectCommand
// sync in upload/finalize — so they count against their cap same as
// anything they uploaded themselves).
export async function getStorageUsedBytes(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${tracks.fileSize}), 0)` })
    .from(tracks)
    .where(and(eq(tracks.userId, userId)));
  return Number(row?.total ?? 0);
}

// The one function upload routes should actually call. Free-tier users get
// checked against the cap; paid (and un-expired comped) users always pass.
// `incomingBytes` is the size of the file about to be added — checked
// against current usage BEFORE the expensive fetch-from-R2-and-parse-
// metadata work in finalize, so a free user well over the cap fails fast
// instead of waiting through a full upload pipeline for nothing.
export async function checkStorageAllowance(
  userId: string,
  incomingBytes: number
): Promise<{ allowed: boolean; usedBytes: number; capBytes: number | null }> {
  const plan = await getUserPlan(userId);
  if (isPaidStatus(plan?.subscriptionStatus, plan?.subscriptionPeriodEnd)) {
    return { allowed: true, usedBytes: 0, capBytes: null };
  }
  const usedBytes = await getStorageUsedBytes(userId);
  return {
    allowed: usedBytes + incomingBytes <= FREE_TIER_STORAGE_BYTES,
    usedBytes,
    capBytes: FREE_TIER_STORAGE_BYTES,
  };
}
