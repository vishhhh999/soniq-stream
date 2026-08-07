import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { nanoid } from "nanoid";
import { parseBuffer } from "music-metadata";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";

// v1: local disk storage. Swap this block for R2/S3 putObject when deploying —
// everything downstream (DB row, fileUrl) stays the same shape.
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const albumId = (formData.get("albumId") as string) || null;
  const folderId = (formData.get("folderId") as string) || null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name) || ".mp3";
  const id = nanoid();
  const filename = `${id}${ext}`;
  const filePath = path.join(process.cwd(), "public", "uploads", filename);
  await writeFile(filePath, buffer);

  // Read real audio metadata straight from the file header — exact, not estimated.
  let durationSec: number | null = null;
  let sampleRate: number | null = null;
  let bitrate: number | null = null;
  let channels: number | null = null;
  let format: string | null = ext.replace(".", "");
  let title = path.basename(file.name, ext);
  let artist: string | null = null;

  try {
    const meta = await parseBuffer(buffer, file.type || undefined);
    durationSec = meta.format.duration ?? null;
    sampleRate = meta.format.sampleRate ?? null;
    bitrate = meta.format.bitrate ? Math.round(meta.format.bitrate / 1000) : null;
    channels = meta.format.numberOfChannels ?? null;
    if (meta.common.title) title = meta.common.title;
    if (meta.common.artist) artist = meta.common.artist;
  } catch (e) {
    // header parse failed — track still gets created, just without metadata.
    // BPM estimation runs separately, client-side, since it needs decoded PCM (see analyze route).
  }

  const row = {
    id,
    albumId,
    folderId,
    title,
    artist,
    fileUrl: `/uploads/${filename}`,
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

  db.insert(tracks).values(row).run();

  return NextResponse.json(row);
}
