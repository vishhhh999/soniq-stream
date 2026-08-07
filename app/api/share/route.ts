import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { shareLinks } from "@/lib/db/schema";

// Deliberately NOT full multi-user auth — recipients need no account.
// A share is just a bearer token with optional expiry. That matches how
// [untitled] itself works for listeners, and it's the right amount of
// complexity for a personal tool with a handful of recipients.
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
  db.insert(shareLinks).values(row).run();
  return NextResponse.json(row);
}
