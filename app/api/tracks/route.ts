import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = db.select().from(tracks).orderBy(desc(tracks.createdAt)).all();
  return NextResponse.json(rows);
}
