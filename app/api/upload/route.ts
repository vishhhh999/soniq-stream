import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";
import { parseBuffer } from "music-metadata";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";

export const dynamic = "force-dynamic";

// Files go to Cloudflare R2 — survives serverless/ephemeral filesystem, and
// has zero egress fees, which matters here since every play streams the file
// back out of storage.
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
    if (!R2_BUCKET || !R2_PUBLIC_URL) {
      throw new Error("R2_BUCKET_NAME or R2_PUBLIC_URL not set");
    }
    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type || "application/octet-stream",
      })
    );
    blobUrl = `${R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  } catch (err) {
    // Catch explicitly — an unhandled rejection here otherwise takes down the
    // whole server process, not just this request. Most common cause: R2
    // env vars aren't set yet, or the bucket doesn't have public access
    // (r2.dev subdomain or custom domain) enabled.
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
    createdAt: new Date(),
  };

  await db.insert(tracks).values(row);

  return NextResponse.json(row);
  } catch (err) {
    // Last line of defense: no request to this route should ever be able to
    // crash the server process. Anything not already caught above lands here.
    console.error("Upload route failed:", err);
    return NextResponse.json({ error: "Upload failed. Check server logs." }, { status: 500 });
  }
}
