import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { albums } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const rows = await db.select().from(albums).where(eq(albums.userId, userId)).orderBy(desc(albums.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { name, folderId } = await req.json();
  const row = { id: nanoid(), userId, name, folderId: folderId || null, coverUrl: null, createdAt: new Date() };
  await db.insert(albums).values(row);
  return NextResponse.json(row);
}
