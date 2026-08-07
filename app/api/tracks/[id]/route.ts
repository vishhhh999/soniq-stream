import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const allowed = ["bpm", "bpmConfidence", "key", "notes", "trimStart", "trimEnd", "pitchShift", "title", "artist"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];

  await db.update(tracks).set(update).where(eq(tracks.id, params.id));
  const [row] = await db.select().from(tracks).where(eq(tracks.id, params.id));
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await db.delete(tracks).where(eq(tracks.id, params.id));
  return NextResponse.json({ ok: true });
}
