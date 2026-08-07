import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { albums } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(albums).orderBy(desc(albums.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { name, folderId } = await req.json();
  const row = { id: nanoid(), name, folderId: folderId || null, coverUrl: null, createdAt: new Date() };
  await db.insert(albums).values(row);
  return NextResponse.json(row);
}
