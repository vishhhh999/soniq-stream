import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { albums } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { albumId, publicUrl } = await req.json();
    if (!albumId || !publicUrl) {
      return NextResponse.json({ error: "albumId and publicUrl are required" }, { status: 400 });
    }
    await db.update(albums).set({ coverUrl: publicUrl }).where(eq(albums.id, albumId));
    return NextResponse.json({ coverUrl: publicUrl });
  } catch (err) {
    console.error("Cover finalize failed:", err);
    return NextResponse.json({ error: "Could not save cover art." }, { status: 500 });
  }
}
