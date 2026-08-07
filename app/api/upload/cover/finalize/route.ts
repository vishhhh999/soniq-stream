import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { albums } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user && (session.user as any).id;
    if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { albumId, publicUrl } = await req.json();
    if (!albumId || !publicUrl) {
      return NextResponse.json({ error: "albumId and publicUrl are required" }, { status: 400 });
    }

    // Without this, anyone could overwrite the cover art of an album they
    // don't own, just by knowing its id.
    const [album] = await db.select().from(albums).where(and(eq(albums.id, albumId), eq(albums.userId, userId)));
    if (!album) return NextResponse.json({ error: "Album not found." }, { status: 404 });

    await db.update(albums).set({ coverUrl: publicUrl }).where(eq(albums.id, albumId));
    return NextResponse.json({ coverUrl: publicUrl });
  } catch (err) {
    console.error("Cover finalize failed:", err);
    return NextResponse.json({ error: "Could not save cover art." }, { status: 500 });
  }
}
