import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { stemJobs, tracks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";
import { verifyReplicateWebhook } from "@/lib/replicate";
import { nanoid } from "nanoid";
import { notifyStemsReady, getUsernameById } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STEM_NAMES = ["vocals", "drums", "bass", "other"] as const;
type StemName = (typeof STEM_NAMES)[number];

async function uploadStemToR2(url: string, userId: string, trackId: string, stem: StemName): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${stem} stem from Replicate (${res.status})`);
  const buf = await res.arrayBuffer();
  const key = `stems/${userId}/${trackId}/${nanoid()}-${stem}.mp3`;
  await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: new Uint8Array(buf), ContentType: "audio/mpeg" }));
  return `${R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
}

export async function POST(req: NextRequest) {
  // Signature verification needs the RAW body — parsing to JSON first and
  // re-stringifying to check it would break the signature, since it's
  // computed over the exact bytes Replicate sent.
  const rawBody = await req.text();

  const verified = await verifyReplicateWebhook({
    rawBody,
    svixId: req.headers.get("webhook-id") ?? req.headers.get("svix-id"),
    svixTimestamp: req.headers.get("webhook-timestamp") ?? req.headers.get("svix-timestamp"),
    svixSignature: req.headers.get("webhook-signature") ?? req.headers.get("svix-signature"),
  }).catch((err) => {
    console.error("Webhook signature verification errored:", err);
    return false;
  });

  if (!verified) {
    console.error("Rejected an unverified/invalid Replicate webhook.");
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "Missing jobId." }, { status: 400 });

  const [job] = await db.select().from(stemJobs).where(eq(stemJobs.id, jobId));
  if (!job) return NextResponse.json({ error: "Unknown job." }, { status: 404 });

  const prediction = JSON.parse(rawBody);

  if (prediction.status !== "succeeded") {
    await db.update(stemJobs).set({
      status: "failed",
      errorMessage: prediction.error ? String(prediction.error) : `Replicate reported status: ${prediction.status}`,
      completedAt: new Date(),
    }).where(eq(stemJobs.id, jobId));
    return NextResponse.json({ ok: true });
  }

  // Two different shapes turned up in research for this model's output —
  // scraped API docs showed `{ stems: [{ name, audio }, ...] }` (an array),
  // while the model's actual current predictor.py source
  // (github.com/Ryan5453/unblend) builds its response as a plain object
  // keyed directly by stem name ({ vocals, drums, bass, other }). Rather
  // than bet on either one being current, this accepts both and only
  // fails if NEITHER matches — with the raw output logged either way, so
  // if this guess is ever wrong it's fixable from the log instead of
  // silently mislabeling a stem.
  const output = prediction.output;
  let vocals: string | undefined, drums: string | undefined, bass: string | undefined, other: string | undefined;

  if (output && typeof output === "object" && !Array.isArray(output) && STEM_NAMES.every((name) => typeof output[name] === "string")) {
    ({ vocals, drums, bass, other } = output);
  } else if (output && Array.isArray(output.stems)) {
    for (const item of output.stems) {
      if (item?.name === "vocals") vocals = item.audio;
      if (item?.name === "drums") drums = item.audio;
      if (item?.name === "bass") bass = item.audio;
      if (item?.name === "other") other = item.audio;
    }
  }

  const isRecognizedShape = !!(vocals && drums && bass && other);

  if (!isRecognizedShape) {
    console.error("Unrecognized Replicate output shape for stem job", jobId, JSON.stringify(output));
    await db.update(stemJobs).set({
      status: "failed",
      errorMessage: "Replicate returned an unexpected output format — needs a code fix, not a retry. Check server logs for the raw output.",
      completedAt: new Date(),
    }).where(eq(stemJobs.id, jobId));
    return NextResponse.json({ ok: true });
  }

  try {
    const [vocalsUrl, drumsUrl, bassUrl, otherUrl] = await Promise.all([
      uploadStemToR2(vocals!, job.userId, job.trackId, "vocals"),
      uploadStemToR2(drums!, job.userId, job.trackId, "drums"),
      uploadStemToR2(bass!, job.userId, job.trackId, "bass"),
      uploadStemToR2(other!, job.userId, job.trackId, "other"),
    ]);

    await db.update(stemJobs).set({
      status: "completed",
      vocalsUrl, drumsUrl, bassUrl, otherUrl,
      completedAt: new Date(),
    }).where(eq(stemJobs.id, jobId));

    const [track] = await db.select({ title: tracks.title }).from(tracks).where(eq(tracks.id, job.trackId));
    const ownerUsername = await getUsernameById(job.userId);
    await notifyStemsReady({
      ownerId: job.userId,
      trackId: job.trackId,
      trackTitle: track?.title ?? "your track",
      ownerUsername,
    }).catch((err) => console.error("Stems-ready notification failed (non-fatal):", err));
  } catch (err: any) {
    console.error("Stem R2 upload failed for job", jobId, err);
    await db.update(stemJobs).set({
      status: "failed",
      errorMessage: err?.message || "Stems finished on Replicate but couldn't be saved.",
      completedAt: new Date(),
    }).where(eq(stemJobs.id, jobId));
  }

  return NextResponse.json({ ok: true });
}
