import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { albums, tracks, users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notifyOwnerOfDownload, getUsernameById } from "@/lib/notifications";
import { isAdminUsername } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [album] = await db.select().from(albums).where(eq(albums.id, params.id));
  if (!album) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [me] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId));
  const isAdminCrossUser = isAdminUsername(me?.username) && album.userId !== userId;

  // Must own this album copy (owner or receiver both own their respective
  // copy) — UNLESS this is the admin's cross-user read access, which is
  // allowed to download any album regardless of ownership (see
  // lib/adminAccess.ts). Everything below this still applies normally.
  if (album.userId !== userId && !isAdminCrossUser) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  // Receivers: respect the owner's allowDownload setting. Doesn't apply to
  // the admin cross-user case — that's a distinct access model, not a
  // save-to-library copy, so there's no allowDownload toggle to check.
  if (!isAdminCrossUser && album.sharedFromAlbumId && !album.allowDownload) {
    return NextResponse.json({ error: "The owner hasn't enabled downloads for this album." }, { status: 403 });
  }

  const albumTracks = await db
    .select()
    .from(tracks)
    .where(and(eq(tracks.albumId, params.id), eq(tracks.userId, album.userId)));

  if (albumTracks.length === 0) {
    return NextResponse.json({ error: "No tracks to download." }, { status: 404 });
  }

  // Fetch all track files from R2 and bundle into a ZIP.
  // fflate's ZipSync with level:0 = stored mode (no re-compression — audio
  // files are already compressed, adding a deflate pass just wastes CPU
  // and barely changes the file size).
  const { zipSync } = await import("fflate");

  const files: { [name: string]: [Uint8Array, { level: 0 }] } = {};
  const usedNames = new Set<string>();

  await Promise.all(
    albumTracks.map(async (track, i) => {
      try {
        const res = await fetch(track.fileUrl);
        if (!res.ok) throw new Error(`R2 returned ${res.status}`);
        const buf = await res.arrayBuffer();

        const ext = track.fileUrl.match(/\.[^./?#]+(?=[?#]|$)/)?.[0] || ".mp3";
        // Sanitize filename — strip characters that cause issues in ZIP
        // entries or OS filesystems. Prefix with sortOrder index so the
        // album plays in the right order when the folder is opened.
        const safeTitle = track.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "track";
        let name = `${String(i + 1).padStart(2, "0")} ${safeTitle}${ext}`;

        // Deduplicate in the unlikely case two tracks share a title.
        let counter = 1;
        while (usedNames.has(name)) {
          name = `${String(i + 1).padStart(2, "0")} ${safeTitle} (${++counter})${ext}`;
        }
        usedNames.add(name);

        files[name] = [new Uint8Array(buf), { level: 0 }];
      } catch (err) {
        console.error(`Skipping track ${track.id} in zip:`, err);
      }
    })
  );

  if (Object.keys(files).length === 0) {
    return NextResponse.json({ error: "All track downloads failed." }, { status: 502 });
  }

  const zipData = zipSync(files);
  const safeAlbumName = album.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "album";

  // Notify the original owner when a receiver downloads their shared album.
  // (For the owner downloading their own album, ownerId === userId here,
  // and notifyOwnerOfDownload already skips self-notifications.)
  try {
    const ownerId = album.sharedByUserId ?? album.userId;
    const actorUsername = await getUsernameById(userId);
    await notifyOwnerOfDownload({
      ownerId,
      actorUserId: userId,
      actorUsername,
      albumId: album.sharedFromAlbumId ?? album.id,
      albumName: album.name,
    });
  } catch (err) {
    console.error("Download notification failed (non-fatal):", err);
  }

  return new NextResponse(zipData, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeAlbumName}.zip"`,
      "Content-Length": String(zipData.byteLength),
    },
  });
}
