import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { parseBuffer } from "music-metadata";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { tracks, albums } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { CopyObjectCommand } from "@aws-sdk/client-s3";
import { albumMembers, contentFollows } from "@/lib/db/schema";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";
import { notifyAlbumFollowers, getUsernameById } from "@/lib/notifications";
import { checkStorageAllowance } from "@/lib/billing";

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

    const { publicUrl, filename, contentType, fileSize, albumId, folderId, independent } = await req.json();
    if (!publicUrl || !filename) {
      return NextResponse.json({ error: "publicUrl and filename are required" }, { status: 400 });
    }

    // Free-tier storage cap. Checked with the client-supplied fileSize
    // before the expensive fetch-from-R2 + metadata-parse work below, so a
    // free user who's already over the cap fails fast instead of waiting
    // through a full upload pipeline for a request that was always going
    // to be rejected. This is a soft/UX gate on a client-reported number,
    // not an adversarial security boundary — fine for a solo/small-team
    // product where the worst case is someone lying to their own account.
    const allowance = await checkStorageAllowance(userId, Number(fileSize) || 0);
    if (!allowance.allowed) {
      return NextResponse.json(
        {
          error: "You've reached the free plan's 500MB storage limit. Upgrade to SONIQ Pro for unlimited storage.",
          code: "STORAGE_LIMIT_REACHED",
          usedBytes: allowance.usedBytes,
          capBytes: allowance.capBytes,
        },
        { status: 402 }
      );
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
  const meta = await withTimeout(
    parseBuffer(buffer, contentType || undefined),
    20000,
    "Metadata parsing"
  );

  const finite = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) ? n : null;

  durationSec = finite(meta.format.duration);
  sampleRate = finite(meta.format.sampleRate);
  bitrate = meta.format.bitrate
    ? finite(Math.round(meta.format.bitrate / 1000))
    : null;
  channels = finite(meta.format.numberOfChannels);

  if (meta.common.title) title = meta.common.title;
  if (meta.common.artist) artist = meta.common.artist;
} catch (err) {
  // Metadata parsing failed (corrupt tags, unsupported container, etc).
  // Non-fatal — the track still uploads, just without duration/format
  // fields until the backfill script or a re-upload fills them in.
  console.error("Metadata parsing failed for", filename, err instanceof Error ? err.message : err);
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

    const siblings = independent
      ? []
      : await db
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

    // Notify album followers about the addition (non-fatal if it fails).
    // NOTE: this was previously imported but never actually called here —
    // that's why removals notified followers but additions/new versions
    // silently didn't, even after member-sync started copying the file.
    if (albumId) {
      try {
        const [albumForNotify] = await db.select({ name: albums.name }).from(albums).where(eq(albums.id, albumId));
        const actorUsername = await getUsernameById(userId);
        await notifyAlbumFollowers({
          ownerId: userId,
          actorUserId: userId,
          actorUsername,
          albumId,
          albumName: albumForNotify?.name ?? "Unknown album",
          trackId: id,
          trackTitle: title,
          type: versionNumber > 1 ? "version_added" : "track_added",
        });
      } catch (err) {
        console.error("Notification dispatch failed (non-fatal):", err);
      }
    }

    // Sync the new track to any receivers who have a saved copy of this album.
    // This keeps their library up-to-date without them needing to re-save.
    if (albumId) {
      try {
        const members = await db
          .select()
          .from(albumMembers)
          .where(and(eq(albumMembers.albumId, albumId)));

        for (const member of members) {
          if (!member.savedAlbumId) continue;
          const sourceKey = new URL(publicUrl).pathname.replace(/^\//, "");
          const ext = sourceKey.match(/\.[^.]+$/)?.[0] || "";
          const newKey = `tracks/${nanoid()}${ext}`;
          try {
            await r2.send(new CopyObjectCommand({ Bucket: R2_BUCKET, CopySource: `${R2_BUCKET}/${sourceKey}`, Key: newKey }));
            const newId = nanoid();
            await db.insert(tracks).values({
              ...row,
              id: newId,
              userId: member.userId,
              albumId: member.savedAlbumId,
              fileUrl: `${R2_PUBLIC_URL.replace(/\/$/, '')}/${newKey}`,
              versionGroupId: newId,
              versionNumber: 1,
              originalTrackId: id,
              notes: null,
              lyrics: null,
              lyricsSynced: null,
              createdAt: new Date(),
            });
          } catch (memberErr) {
            console.error(`Failed to sync track to member ${member.userId}:`, memberErr);
          }
        }
      } catch (syncErr) {
        console.error('Member track sync failed (non-fatal):', syncErr);
      }
    }
    return NextResponse.json(row);
  } catch (err) {
    console.error("Finalize failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Could not process uploaded file: ${message}` }, { status: 500 });
  }
}
