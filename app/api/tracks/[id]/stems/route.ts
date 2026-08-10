import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { tracks, stemJobs } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { createStemSeparationPrediction, cancelPrediction } from "@/lib/replicate";

export const dynamic = "force-dynamic";

// Real separation on this model typically finishes in well under a
// minute; 15 minutes is generously past even a bad-case run. Past this,
// a "processing" job is almost certainly not actually processing —
// most likely the completion webhook never landed (network blip,
// misconfigured APP_URL, Replicate outage) — and treating it as
// permanently stuck with no way out was a real gap: nothing before this
// let a person escape a job that silently died mid-flight.
const STALE_THRESHOLD_MS = 15 * 60 * 1000;

// Owner-only, deliberately not extended to isReadOnly/admin cross-user
// viewers or album collaborators — this triggers real spend on Replicate
// per click, so it stays restricted to the actual track owner regardless
// of who else can view or download the track.
async function getOwnedTrack(userId: string, trackId: string) {
  const [track] = await db.select().from(tracks).where(and(eq(tracks.id, trackId), eq(tracks.userId, userId)));
  return track ?? null;
}

function webhookUrl(): string {
  const base = process.env.APP_URL;
  if (!base) throw new Error("APP_URL is not set — required so Replicate knows where to send the completion webhook.");
  return `${base.replace(/\/$/, "")}/api/webhooks/replicate`;
}

function isStale(job: { status: string; createdAt: Date | string }): boolean {
  if (job.status !== "processing") return false;
  return Date.now() - new Date(job.createdAt).getTime() > STALE_THRESHOLD_MS;
}

// Marks a stuck job failed (best-effort cancels it on Replicate's side
// too, in case it's genuinely still running there and this saves the
// rest of the run cost). Shared between the auto-stale check in GET and
// the explicit user-triggered DELETE below — same outcome either way,
// just a different trigger.
async function markJobFailed(job: { id: string; replicatePredictionId: string | null }, reason: string) {
  if (job.replicatePredictionId) await cancelPrediction(job.replicatePredictionId);
  await db.update(stemJobs).set({
    status: "failed",
    errorMessage: reason,
    completedAt: new Date(),
  }).where(eq(stemJobs.id, job.id));
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    const userId = session?.user && (session.user as any).id;
    if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const track = await getOwnedTrack(userId, params.id);
    if (!track) return NextResponse.json({ error: "Not found." }, { status: 404 });

    let [job] = await db
      .select()
      .from(stemJobs)
      .where(eq(stemJobs.trackId, params.id))
      .orderBy(desc(stemJobs.createdAt))
      .limit(1);

    if (job && isStale(job)) {
      await markJobFailed(job, "Timed out waiting for a result — the completion webhook likely never arrived. Safe to try again.");
      job = { ...job, status: "failed", errorMessage: "Timed out waiting for a result — the completion webhook likely never arrived. Safe to try again." };
    }

    return NextResponse.json({ job: job ?? null });
  } catch (err: any) {
    // Any unhandled throw here (a DB error from a table that doesn't
    // exist yet because db:push hasn't been run against production is
    // the classic one) would otherwise crash the whole function and
    // Vercel serves its own HTML error page instead of JSON — which is
    // exactly what "Unexpected token '<'... is not valid JSON" on the
    // client means. Wrapping the entire body guarantees JSON comes back
    // either way.
    console.error("GET /api/tracks/[id]/stems failed:", err);
    return NextResponse.json({ error: err?.message || "Something went wrong loading stem status." }, { status: 500 });
  }
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    const userId = session?.user && (session.user as any).id;
    if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const track = await getOwnedTrack(userId, params.id);
    if (!track) return NextResponse.json({ error: "Not found." }, { status: 404 });

    // Don't let a double-click (or a stale open menu) fire two predictions
    // — real money per run. A genuinely active "processing" job blocks a
    // new one; a stale one (see isStale above) is auto-failed and doesn't
    // block; a completed or failed one never blocked to begin with
    // (re-extracting is a deliberate choice, not something to prevent).
    const [existing] = await db
      .select()
      .from(stemJobs)
      .where(and(eq(stemJobs.trackId, params.id), eq(stemJobs.status, "processing")))
      .limit(1);
    if (existing) {
      if (isStale(existing)) {
        await markJobFailed(existing, "Timed out waiting for a result — the completion webhook likely never arrived.");
      } else {
        return NextResponse.json({ error: "Stem extraction is already in progress for this track." }, { status: 409 });
      }
    }

    const jobId = nanoid();
    const { predictionId } = await createStemSeparationPrediction({
      audioUrl: track.fileUrl,
      webhookUrl: `${webhookUrl()}?jobId=${jobId}`,
    });

    await db.insert(stemJobs).values({
      id: jobId,
      trackId: params.id,
      userId,
      status: "processing",
      replicatePredictionId: predictionId,
      createdAt: new Date(),
    });

    return NextResponse.json({ job: { id: jobId, status: "processing" } });
  } catch (err: any) {
    console.error("POST /api/tracks/[id]/stems failed:", err);
    return NextResponse.json({ error: err?.message || "Couldn't start stem extraction." }, { status: 500 });
  }
}

// Explicit user-triggered cancel — the manual escape hatch, same
// underlying action as the automatic staleness check above but available
// immediately rather than only after 15 minutes, for whenever someone
// already knows a job is stuck (e.g. from checking Replicate's own
// dashboard) and doesn't want to wait out the timeout.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    const userId = session?.user && (session.user as any).id;
    if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const track = await getOwnedTrack(userId, params.id);
    if (!track) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const [job] = await db
      .select()
      .from(stemJobs)
      .where(and(eq(stemJobs.trackId, params.id), eq(stemJobs.status, "processing")))
      .limit(1);

    if (!job) return NextResponse.json({ error: "No in-progress extraction to cancel." }, { status: 404 });

    await markJobFailed(job, "Cancelled.");
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /api/tracks/[id]/stems failed:", err);
    return NextResponse.json({ error: err?.message || "Couldn't cancel." }, { status: 500 });
  }
}
