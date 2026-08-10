import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { stemJobs } from "@/lib/db/schema";
import { and, eq, lt } from "drizzle-orm";
import { r2, R2_BUCKET } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STEM_RETENTION_MS = 48 * 60 * 60 * 1000;

// Triggered on a schedule (see vercel.json) — Vercel Cron calls this with
// an Authorization: Bearer <CRON_SECRET> header, which is how this stays
// safe despite being reachable without a session (it HAS to be reachable
// without a session — Vercel Cron has no browser, no login, same reason
// the Replicate webhook needed its own public-path + signature-check
// setup rather than NextAuth's session gate). No CRON_SECRET configured
// = this route refuses to run at all rather than silently trusting
// anyone who finds the URL.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("Stem cleanup cron: CRON_SECRET is not set, refusing to run.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - STEM_RETENTION_MS);
  const stale = await db
    .select()
    .from(stemJobs)
    .where(and(eq(stemJobs.status, "completed"), lt(stemJobs.completedAt, cutoff)));

  let cleaned = 0;
  for (const job of stale) {
    for (const url of [job.vocalsUrl, job.drumsUrl, job.bassUrl, job.otherUrl]) {
      if (!url || !R2_BUCKET) continue;
      try {
        const key = new URL(url).pathname.replace(/^\//, "");
        if (key) await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      } catch (err) {
        console.error(`Stem cleanup: R2 delete failed for job ${job.id} (non-fatal):`, err);
      }
    }
    // Keep the row (for history/debugging) but clear the URLs and mark it
    // expired — distinct from "failed" so the UI can show an accurate
    // "these expired, re-extract if you need them again" message rather
    // than implying something went wrong.
    await db.update(stemJobs).set({
      status: "expired",
      vocalsUrl: null, drumsUrl: null, bassUrl: null, otherUrl: null,
    }).where(eq(stemJobs.id, job.id));
    cleaned++;
  }

  return NextResponse.json({ ok: true, cleaned });
}
