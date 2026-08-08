import { NextRequest, NextResponse } from "next/server";
import { CopyObjectCommand } from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [original] = await db.select().from(tracks).where(and(eq(tracks.id, params.id), eq(tracks.userId, userId)));
  if (!original) return NextResponse.json({ error: "Not found." }, { status: 404 });

  try {
    // A real copy in R2, not a second DB row pointing at the same file —
    // sharing one file across two rows would mean deleting either "copy"
    // deletes the underlying object out from under the other one.
    const sourceKey = original.fileUrl.replace(`${R2_PUBLIC_URL.replace(/\/$/, "")}/`, "");
    const ext = sourceKey.match(/\.[^.]+$/)?.[0] || "";
    const newKey = `tracks/${nanoid()}${ext}`;

    await r2.send(
      new CopyObjectCommand({
        Bucket: R2_BUCKET,
        CopySource: `${R2_BUCKET}/${sourceKey}`,
        Key: newKey,
      })
    );

    const newFileUrl = `${R2_PUBLIC_URL.replace(/\/$/, "")}/${newKey}`;
    const newId = nanoid();
    const row = {
      ...original,
      id: newId,
      title: `${original.title} (copy)`,
      fileUrl: newFileUrl,
      versionGroupId: newId, // independent, not grouped as a version of the original
      versionNumber: 1,
      sortOrder: -Date.now(),
      createdAt: new Date(),
    };

    await db.insert(tracks).values(row);
    return NextResponse.json(row);
  } catch (err) {
    console.error("Duplicate failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Could not duplicate track: ${message}` }, { status: 500 });
  }
}
