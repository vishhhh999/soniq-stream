import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { stemJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { r2, R2_BUCKET } from "@/lib/r2";

// Deletes every stem file (R2) and stem_jobs row for a track. Shared
// between individual track deletion and full account deletion (see
// app/api/tracks/[id]/route.ts and app/api/user/route.ts) — previously
// neither cleaned these up at all, so deleting a track that had ever had
// stems extracted left those 4 files orphaned in R2 forever.
export async function deleteStemsForTrack(trackId: string) {
  const jobs = await db.select().from(stemJobs).where(eq(stemJobs.trackId, trackId));
  for (const job of jobs) {
    for (const url of [job.vocalsUrl, job.drumsUrl, job.bassUrl, job.otherUrl]) {
      if (!url || !R2_BUCKET) continue;
      try {
        const key = new URL(url).pathname.replace(/^\//, "");
        if (key) await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      } catch (err) {
        console.error(`Stem R2 cleanup failed for one file on track ${trackId} (non-fatal):`, err);
      }
    }
  }
  await db.delete(stemJobs).where(eq(stemJobs.trackId, trackId));
}
