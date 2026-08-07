import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { parseBuffer } from "music-metadata";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { tracks, albums } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const normalizeTitle = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user && (session.user as any).id;
    if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { publicUrl, filename, contentType, fileSize, albumId, folderId } = await req.json();
    if (!publicUrl || !filename) {
      return NextResponse.json({ error: "publicUrl and filename are required" }, { status: 400 });
    }

    // Without this check, anyone authenticated could upload a track into
    // an albumId they found/guessed, even one they don't own.
    if (albumId) {
      const [album] = await db.select().from(albums).where(and(eq(albums.id, albumId), eq(albums.userId, userId)));
      if (!album) return NextResponse.json({ error: "Album not found." }, { status: 404 });
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
      const meta = await withTimeout(parseBuffer(buffer, contentType || undefined), 20000, "Metadata parsing");
      const finite = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : null);
      durationSec = finite(meta.format.duration);
      sampleRate = finite(meta.format.sampleRate);
      bitrate = meta.format.bitrate ? finite(Math.round(meta.format.bitrate / 1000)) : null;
      channels = finite(meta.format.numberOfChannels);
      if (meta.common.title) title = meta.common.title;
      if (meta.common.artist) artist = meta.common.artist;
    } catch (err) {
      console.warn("Metadata parse failed/timed out, continuing without it:", err);
    }

    // Duplicate/version detection scoped to this user's own tracks —
    // previously scoped only by album/folder, meaning (before the ownership
    // fix) one user's track could get grouped as a "version" of a
    // different user's identically-named track.
    const scopeCondition = albumId
      ? and(eq(tracks.albumId, albumId), eq(tracks.userId, userId))
      : folderId
      ? and(isNull(tracks.albumId), eq(tracks.folderId, folderId), eq(tracks.userId, userId))
      : and(isNull(tracks.albumId), isNull(tracks.folderId), eq(tracks.userId, userId));

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
      userId,
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
