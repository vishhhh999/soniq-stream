import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { folders } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(folders);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { name, parentId } = await req.json();
  const row = { id: nanoid(), name, parentId: parentId || null, createdAt: new Date() };
  await db.insert(folders).values(row);
  return NextResponse.json(row);
}
