import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { parseBuffer } from "music-metadata";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const normalizeTitle = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");

// Called after the browser has already PUT the file directly to R2. Fetches
// it back server-to-server (Vercel function -> R2) to run metadata
// extraction and duplicate/version detection — this download is NOT subject
// to the 4.5MB client request-body limit that broke the old direct-upload
// route on real audio files, and R2 has zero egress fees so it costs nothing.
export async function POST(req: NextRequest) {
  try {
    const { publicUrl, filename, contentType, fileSize, albumId, folderId } = await req.json();
    if (!publicUrl || !filename) {
      return NextResponse.json({ error: "publicUrl and filename are required" }, { status: 400 });
    }

    const fileRes = await fetch(publicUrl);
    if (!fileRes.ok) {
      return NextResponse.json({ error: "Could not read the uploaded file back from storage." }, { status: 502 });
    }
    const buffer = Buffer.from(await fileRes.arrayBuffer());

    const ext = filename.match(/\.[^.]+$/)?.[0] || ".mp3";
    const id = nanoid();
    const format = ext.replace(".", "");
    let title = filename.replace(/\.[^.]+$/, "");
    let artist: string | null = null;
    let durationSec: number | null = null;
    let sampleRate: number | null = null;
    let bitrate: number | null = null;
    let channels: number | null = null;

    try {
      const meta = await parseBuffer(buffer, contentType || undefined);
      durationSec = meta.format.duration ?? null;
      sampleRate = meta.format.sampleRate ?? null;
      bitrate = meta.format.bitrate ? Math.round(meta.format.bitrate / 1000) : null;
      channels = meta.format.numberOfChannels ?? null;
      if (meta.common.title) title = meta.common.title;
      if (meta.common.artist) artist = meta.common.artist;
    } catch {
      // header parse failed — track still gets created without metadata
    }

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
      const anchor = siblings.find((s) => s.versionGroupId) ?? siblings[0];
      versionGroupId = anchor.versionGroupId ?? anchor.id;
      if (!anchor.versionGroupId) {
        await db.update(tracks).set({ versionGroupId }).where(eq(tracks.id, anchor.id));
      }
      versionNumber = Math.max(1, ...siblings.map((s) => s.versionNumber ?? 1)) + 1;
    } else {
      versionGroupId = id;
      versionNumber = 1;
    }

    const row = {
      id,
      albumId: albumId || null,
      folderId: folderId || null,
      title,
      artist,
      fileUrl: publicUrl,
      fileSize: fileSize ?? buffer.length,
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
      sortOrder: -Date.now(), // newest upload always sorts first, see schema comment
      createdAt: new Date(),
    };

    await db.insert(tracks).values(row);
    return NextResponse.json(row);
  } catch (err) {
    console.error("Finalize failed:", err);
    return NextResponse.json({ error: "Could not process uploaded file." }, { status: 500 });
  }
}
