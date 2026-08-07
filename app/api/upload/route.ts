import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";
import { parseBuffer } from "music-metadata";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";
import { and, eq, isNull, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const normalizeTitle = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const albumId = (formData.get("albumId") as string) || null;
    const folderId = (formData.get("folderId") as string) || null;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.match(/\.[^.]+$/)?.[0]) || ".mp3";
    const id = nanoid();

    let blobUrl: string;
    const key = `tracks/${id}${ext}`;
    try {
      if (!R2_BUCKET || !R2_PUBLIC_URL) throw new Error("R2_BUCKET_NAME or R2_PUBLIC_URL not set");
      await r2.send(
        new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: file.type || "application/octet-stream" })
      );
      blobUrl = `${R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
    } catch (err) {
      console.error("Upload to R2 failed:", err);
      return NextResponse.json(
        { error: "File storage isn't configured. Check R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL." },
        { status: 503 }
      );
    }

    let durationSec: number | null = null;
    let sampleRate: number | null = null;
    let bitrate: number | null = null;
    let channels: number | null = null;
    const format = ext.replace(".", "");
    let title = file.name.replace(/\.[^.]+$/, "");
    let artist: string | null = null;

    try {
      const meta = await parseBuffer(buffer, file.type || undefined);
      durationSec = meta.format.duration ?? null;
      sampleRate = meta.format.sampleRate ?? null;
      bitrate = meta.format.bitrate ? Math.round(meta.format.bitrate / 1000) : null;
      channels = meta.format.numberOfChannels ?? null;
      if (meta.common.title) title = meta.common.title;
      if (meta.common.artist) artist = meta.common.artist;
    } catch {
      // header parse failed — track still gets created without metadata
    }

    // Duplicate/version detection, scoped to the same album (or same loose
    // folder, or same "unsorted" bucket if neither) — a track named "Demo"
    // in one album shouldn't collide with an unrelated "Demo" elsewhere.
    const scopeCondition = albumId
      ? eq(tracks.albumId, albumId)
      : folderId
      ? and(isNull(tracks.albumId), eq(tracks.folderId, folderId))
      : and(isNull(tracks.albumId), isNull(tracks.folderId));

    const siblings = await db
      .select()
      .from(tracks)
      .where(and(scopeCondition, sql`lower(trim(${tracks.title})) = ${normalizeTitle(title)}`));

    let versionGroupId: string;
    let versionNumber: number;

    if (siblings.length > 0) {
      // Group under the earliest sibling's group id — if that sibling predates
      // version tracking and has no group id of its own yet, promote it to be
      // the group anchor now (it becomes its own group's id).
      const anchor = siblings.find((s) => s.versionGroupId) ?? siblings[0];
      versionGroupId = anchor.versionGroupId ?? anchor.id;
      if (!anchor.versionGroupId) {
        await db.update(tracks).set({ versionGroupId }).where(eq(tracks.id, anchor.id));
      }
      const maxVersion = Math.max(1, ...siblings.map((s) => s.versionNumber ?? 1));
      versionNumber = maxVersion + 1;
    } else {
      versionGroupId = id; // first of its name — it anchors its own group
      versionNumber = 1;
    }

    const row = {
      id,
      albumId,
      folderId,
      title,
      artist,
      fileUrl: blobUrl,
      fileSize: buffer.length,
      format,
      durationSec,
      sampleRate,
      bitrate,
      channels,
      bpm: null,
      bpmConfidence: null,
      key: null,
      notes: null,
      trimStart: null,
      trimEnd: null,
      pitchShift: 0,
      versionGroupId,
      versionNumber,
      createdAt: new Date(),
    };

    await db.insert(tracks).values(row);

    return NextResponse.json(row);
  } catch (err) {
    console.error("Upload route failed:", err);
    return NextResponse.json({ error: "Upload failed. Check server logs." }, { status: 500 });
  }
}
