import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { shareLinks, tracks, albums } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Downloading from a share link now requires being signed in — anonymous
// downloads were removed as a safety tradeoff (anyone with a link could
// previously pull the raw file with zero identity behind it). Playback
// stays anonymous; this is the one action that now needs an account.
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Sign in to download." }, { status: 401 });

  const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, params.token));
  if (!link) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Link expired." }, { status: 410 });
  }
  if (!link.allowDownload) {
    return NextResponse.json({ error: "The owner hasn't enabled downloads for this link." }, { status: 403 });
  }

  // Single-track share — no zip needed, just the one file.
  if (link.trackId) {
    const [track] = await db.select().from(tracks).where(eq(tracks.id, link.trackId));
    if (!track) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const res = await fetch(track.fileUrl);
    if (!res.ok) return NextResponse.json({ error: "Could not fetch file." }, { status: 502 });
    const buf = await res.arrayBuffer();
    const ext = track.fileUrl.match(/\.[^./?#]+(?=[?#]|$)/)?.[0] || ".mp3";
    const safeName = track.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "track";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeName}${ext}"`,
        "Content-Length": String(buf.byteLength),
      },
    });
  }

  // Album share — zip all tracks, same pattern as /api/albums/[id]/download.
  if (link.albumId) {
    const [album] = await db.select().from(albums).where(eq(albums.id, link.albumId));
    if (!album) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const albumTracks = await db.select().from(tracks).where(eq(tracks.albumId, link.albumId));
    if (albumTracks.length === 0) return NextResponse.json({ error: "No tracks to download." }, { status: 404 });

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
          console.error(`Skipping track ${track.id} in share zip:`, err);
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

  return NextResponse.json({ error: "Not found." }, { status: 404 });
}
