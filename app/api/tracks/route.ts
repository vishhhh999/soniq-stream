import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { asc, desc } from "drizzle-orm";

export const dynamic = "force-dynamic"; // this hits the DB — never prerender at build time

export async function GET() {
  const rows = await db.select().from(tracks).orderBy(asc(tracks.sortOrder), desc(tracks.createdAt));
  return NextResponse.json(rows);
}
