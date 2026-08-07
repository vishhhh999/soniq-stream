import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { folders } from "@/lib/db/schema";

export async function GET() {
  const rows = db.select().from(folders).all();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { name, parentId } = await req.json();
  const row = { id: nanoid(), name, parentId: parentId || null, createdAt: new Date() };
  db.insert(folders).values(row).run();
  return NextResponse.json(row);
}
