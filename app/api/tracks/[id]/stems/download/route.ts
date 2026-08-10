import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { tracks, stemJobs } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [track] = await db.select().from(tracks).where(and(eq(tracks.id, params.id), eq(tracks.userId, userId)));
  if (!track) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [job] = await db
    .select()
    .from(stemJobs)
    .where(and(eq(stemJobs.trackId, params.id), eq(stemJobs.status, "completed")))
    .orderBy(desc(stemJobs.createdAt))
    .limit(1);

  if (!job || !job.vocalsUrl || !job.drumsUrl || !job.bassUrl || !job.otherUrl) {
    return NextResponse.json({ error: "No completed stems for this track." }, { status: 404 });
  }

  const { zipSync } = await import("fflate");
  const stemUrls: Record<string, string> = {
    vocals: job.vocalsUrl, drums: job.drumsUrl, bass: job.bassUrl, other: job.otherUrl,
  };

  const files: { [name: string]: [Uint8Array, { level: 0 }] } = {};
  const safeTitle = track.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "track";

  await Promise.all(
    Object.entries(stemUrls).map(async ([name, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`R2 returned ${res.status}`);
        const buf = await res.arrayBuffer();
        files[`${safeTitle} - ${name}.mp3`] = [new Uint8Array(buf), { level: 0 }];
      } catch (err) {
        console.error(`Skipping ${name} stem in zip:`, err);
      }
    })
  );

  if (Object.keys(files).length === 0) {
    return NextResponse.json({ error: "All stem downloads failed." }, { status: 502 });
  }

  const zipData = zipSync(files);
  return new NextResponse(zipData, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeTitle} - stems.zip"`,
      "Content-Length": String(zipData.byteLength),
    },
  });
}
