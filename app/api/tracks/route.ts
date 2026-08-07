import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { asc, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const rows = await db.select().from(tracks).where(eq(tracks.userId, userId)).orderBy(asc(tracks.sortOrder), desc(tracks.createdAt));
  return NextResponse.json(rows);
}
