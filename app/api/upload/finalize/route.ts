import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { parseBuffer } from "music-metadata";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Vercel's default function timeout without this is ~10s — comfortably
// enough for a small test file, not for fetching + buffering + parsing a
// real several-MB audio file back from R2. 60s is the max available on
// Hobby without Fluid compute. Without this, a genuinely large file crashes
// the function at the platform level (empty response, "Unexpected end of
// JSON input" client-side) instead of failing with a real error.
export const maxDuration = 60;

const normalizeTitle = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");

// Wraps a promise with a hard timeout — a hang here (R2 fetch stalling,
// music-metadata choking on a malformed file) previously had no ceiling
// other than the platform's own timeout, which produces the confusing
// empty-response crash rather than a clear error. This fails fast instead.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

export async function POST(req: NextRequest) {
  try {
    const { publicUrl, filename, contentType, fileSize, albumId, folderId } = await req.json();
    if (!publicUrl || !filename) {
      return NextResponse.json({ error: "publicUrl and filename are required" }, { status: 400 });
    }

    let buffer: Buffer;
    try {
      const fileRes = await withTimeout(fetch(publicUrl), 30000, "Fetching file from storage");
      if (!fileRes.ok) {
        return NextResponse.json({ error: `Could not read the uploaded file back from storage (${fileRes.status}).` }, { status: 502 });
      }
      buffer = Buffer.from(await fileRes.arrayBuffer());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Fetching the file back from storage failed: ${message}` }, { status: 502 });
    }

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
      // 20s ceiling on metadata parsing — a malformed or unusually-encoded
      // file could otherwise hang this indefinitely with no error surfaced.
      const meta = await withTimeout(parseBuffer(buffer, contentType || undefined), 20000, "Metadata parsing");
      const finite = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : null);
      durationSec = finite(meta.format.duration);
      sampleRate = finite(meta.format.sampleRate);
      bitrate = meta.format.bitrate ? finite(Math.round(meta.format.bitrate / 1000)) : null;
      channels = finite(meta.format.numberOfChannels);
      if (meta.common.title) title = meta.common.title;
      if (meta.common.artist) artist = meta.common.artist;
    } catch (err) {
      // header parse failed or timed out — track still gets created without
      // metadata, this is not fatal to the upload itself
      console.warn("Metadata parse failed/timed out, continuing without it:", err);
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
      sortOrder: -Date.now(),
      createdAt: new Date(),
    };

    await db.insert(tracks).values(row);
    return NextResponse.json(row);
  } catch (err) {
    console.error("Finalize failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Could not process uploaded file: ${message}` }, { status: 500 });
  }
}
