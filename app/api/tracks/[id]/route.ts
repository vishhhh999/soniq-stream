import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// PATCH handles all editable fields: bpm (after client-side detection or manual
// correction), key, trim points, pitch shift, notes. One endpoint, partial body.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const allowed = ["bpm", "bpmConfidence", "key", "notes", "trimStart", "trimEnd", "pitchShift", "title", "artist"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];

  db.update(tracks).set(update).where(eq(tracks.id, params.id)).run();
  const row = db.select().from(tracks).where(eq(tracks.id, params.id)).get();
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  db.delete(tracks).where(eq(tracks.id, params.id)).run();
  return NextResponse.json({ ok: true });
}
