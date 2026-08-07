import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { folders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const rows = await db.select().from(folders).where(eq(folders.userId, userId));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { name, parentId } = await req.json();
  const row = { id: nanoid(), userId, name, parentId: parentId || null, createdAt: new Date() };
  await db.insert(folders).values(row);
  return NextResponse.json(row);
}
