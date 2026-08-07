import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { shareLinks } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { trackId, albumId, expiresInDays, allowDownload } = await req.json();
  const row = {
    id: nanoid(),
    token: nanoid(12),
    trackId: trackId || null,
    albumId: albumId || null,
    expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86400000) : null,
    allowDownload: !!allowDownload,
    createdAt: new Date(),
  };
  await db.insert(shareLinks).values(row);
  return NextResponse.json(row);
}
