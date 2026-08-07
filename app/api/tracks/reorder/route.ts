import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Accepts the full track list in its new order and assigns sequential
// sortOrder values (0, 1, 2...). These small non-negative numbers always
// sort before any -Date.now()-based default a future upload gets, so new
// uploads keep floating to the top even after a manual reorder has happened.
export async function POST(req: NextRequest) {
  try {
    const { trackIds } = await req.json();
    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      return NextResponse.json({ error: "trackIds array is required" }, { status: 400 });
    }

    await Promise.all(
      trackIds.map((id: string, index: number) =>
        db.update(tracks).set({ sortOrder: index }).where(eq(tracks.id, id))
      )
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Reorder failed:", err);
    return NextResponse.json({ error: "Reorder failed." }, { status: 500 });
  }
}
