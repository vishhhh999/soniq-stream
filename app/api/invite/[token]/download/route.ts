import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inviteLinks, albums, tracks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Whole-album ZIP download for an invite link, before the viewer has
// accepted (or even signed in). Gated by the album's own allowDownload
// flag, same as anonymous playback already is — no ownership required.
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const [link] = await db.select().from(inviteLinks).where(eq(inviteLinks.token, params.token));
  if (!link || !link.active) return NextResponse.json({ error: "Invite link is invalid or expired." }, { status: 404 });
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Invite link is invalid or expired." }, { status: 404 });
  }
  if (link.maxUses !== null && link.usedCount >= link.maxUses) {
    return NextResponse.json({ error: "Invite link is invalid or expired." }, { status: 404 });
  }

  const [album] = await db.select().from(albums).where(eq(albums.id, link.albumId));
  if (!album) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!album.allowDownload) {
    return NextResponse.json({ error: "The owner hasn't enabled downloads for this album." }, { status: 403 });
  }

  const albumTracks = await db.select().from(tracks).where(eq(tracks.albumId, link.albumId));
  if (albumTracks.length === 0) {
    return NextResponse.json({ error: "No tracks to download." }, { status: 404 });
  }

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
        const safeTitle = track.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "track";
        let name = `${String(i + 1).padStart(2, "0")} ${safeTitle}${ext}`;
        let counter = 1;
        while (usedNames.has(name)) {
          name = `${String(i + 1).padStart(2, "0")} ${safeTitle} (${++counter})${ext}`;
        }
        usedNames.add(name);
        files[name] = [new Uint8Array(buf), { level: 0 }];
      } catch (err) {
        console.error(`Skipping track ${track.id} in invite zip:`, err);
      }
    })
  );

  if (Object.keys(files).length === 0) {
    return NextResponse.json({ error: "All track downloads failed." }, { status: 502 });
  }

  const zipData = zipSync(files);
  const safeAlbumName = album.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "album";

  return new NextResponse(zipData, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeAlbumName}.zip"`,
      "Content-Length": String(zipData.byteLength),
    },
  });
}
