import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shareLinks, tracks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const link = db.select().from(shareLinks).where(eq(shareLinks.token, params.token)).get();
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }
  if (!link.trackId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const track = db.select().from(tracks).where(eq(tracks.id, link.trackId)).get();
  if (!track) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ track, allowDownload: link.allowDownload });
}
