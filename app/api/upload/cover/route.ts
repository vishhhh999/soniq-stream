import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { albums } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const albumId = formData.get("albumId") as string | null;
    if (!file || !albumId) return NextResponse.json({ error: "file and albumId are required" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.match(/\.[^.]+$/)?.[0]) || ".jpg";
    const key = `covers/${nanoid()}${ext}`;

    if (!R2_BUCKET || !R2_PUBLIC_URL) {
      return NextResponse.json({ error: "R2 storage isn't configured." }, { status: 503 });
    }

    await r2.send(
      new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: file.type || "image/jpeg" })
    );
    const coverUrl = `${R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;

    await db.update(albums).set({ coverUrl }).where(eq(albums.id, albumId));
    return NextResponse.json({ coverUrl });
  } catch (err) {
    console.error("Cover upload failed:", err);
    return NextResponse.json({ error: "Cover upload failed." }, { status: 500 });
  }
}
