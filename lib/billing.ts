import { db } from "@/lib/db";
import { tracks, users } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

// Free tier: storage cap only, no track-count or feature gating — per
// Vish's call. Paid tier removes the cap entirely. Chosen to sit below
// what a real work-in-progress producer's library needs quickly, since
// the whole point is that it nudges an upgrade, not that it's comfortable
// to live on indefinitely.
export const FREE_TIER_STORAGE_BYTES = 500 * 1024 * 1024; // 500MB
export const PAID_PRICE_USD = 5;

// Statuses that count as "paid" for enforcement purposes. 'past_due' still
// counts — Stripe keeps retrying the charge for a while before the
// subscription actually lapses to 'canceled'; cutting access off the
// instant a single charge attempt fails would be a harsh, premature
// downgrade for what's usually a transient card issue.
const PAID_STATUSES = new Set(["active", "past_due"]);

export function isPaidStatus(status: string | null | undefined): boolean {
  return !!status && PAID_STATUSES.has(status);
}

export async function getUserPlan(userId: string) {
  const [user] = await db
    .select({
      subscriptionStatus: users.subscriptionStatus,
      subscriptionPeriodEnd: users.subscriptionPeriodEnd,
      stripeCustomerId: users.stripeCustomerId,
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
// checked against the cap; paid users always pass. `incomingBytes` is the
// size of the file about to be added — checked against current usage
// BEFORE the expensive fetch-from-R2-and-parse-metadata work in finalize,
// so a free user well over the cap fails fast instead of waiting through
// a full upload pipeline for nothing.
export async function checkStorageAllowance(
  userId: string,
  incomingBytes: number
): Promise<{ allowed: boolean; usedBytes: number; capBytes: number | null }> {
  const plan = await getUserPlan(userId);
  if (isPaidStatus(plan?.subscriptionStatus)) {
    return { allowed: true, usedBytes: 0, capBytes: null };
  }
  const usedBytes = await getStorageUsedBytes(userId);
  return {
    allowed: usedBytes + incomingBytes <= FREE_TIER_STORAGE_BYTES,
    usedBytes,
    capBytes: FREE_TIER_STORAGE_BYTES,
  };
}
