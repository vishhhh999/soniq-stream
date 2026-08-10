import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { tracks, stemJobs } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { createStemSeparationPrediction } from "@/lib/replicate";

export const dynamic = "force-dynamic";

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

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const track = await getOwnedTrack(userId, params.id);
  if (!track) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [job] = await db
    .select()
    .from(stemJobs)
    .where(eq(stemJobs.trackId, params.id))
    .orderBy(desc(stemJobs.createdAt))
    .limit(1);

  return NextResponse.json({ job: job ?? null });
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const track = await getOwnedTrack(userId, params.id);
  if (!track) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Don't let a double-click (or a stale open menu) fire two predictions —
  // real money per run. A already-processing job blocks a new one; a
  // completed or failed one doesn't (re-extracting is a deliberate choice
  // the person can make, not something to block).
  const [existing] = await db
    .select({ id: stemJobs.id, status: stemJobs.status })
    .from(stemJobs)
    .where(and(eq(stemJobs.trackId, params.id), eq(stemJobs.status, "processing")))
    .limit(1);
  if (existing) return NextResponse.json({ error: "Stem extraction is already in progress for this track." }, { status: 409 });

  const jobId = nanoid();

  try {
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
    console.error("Stem extraction request failed:", err);
    return NextResponse.json({ error: err?.message || "Couldn't start stem extraction." }, { status: 502 });
  }
}
