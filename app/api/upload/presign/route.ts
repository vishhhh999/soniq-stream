import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Returns a short-lived signed URL the browser can PUT directly to R2.
// This request/response is tiny (just JSON) — the actual file bytes never
// pass through this Vercel function, which is what avoids the 4.5MB limit.
export async function POST(req: NextRequest) {
  try {
    // Every other upload-related route (finalize, cover/finalize) requires
    // auth — this one didn't, which meant anyone, logged in or not, could
    // get a valid signed PUT URL into the R2 bucket and upload arbitrary
    // files at zero cost/attribution to them. This doesn't by itself create
    // a DB row (finalize does that and already checks auth), but it's a
    // real storage-cost and content-hosting abuse vector on its own.
    const session = await auth();
    const userId = session?.user && (session.user as any).id;
    if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { filename, contentType, kind } = await req.json();
    if (!filename || !kind) {
      return NextResponse.json({ error: "filename and kind are required" }, { status: 400 });
    }
    if (!R2_BUCKET || !R2_PUBLIC_URL) {
      return NextResponse.json({ error: "R2 storage isn't configured." }, { status: 503 });
    }

    const ext = filename.match(/\.[^.]+$/)?.[0] || "";
    const prefix = kind === "cover" ? "covers" : "tracks";
    const key = `${prefix}/${nanoid()}${ext}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: contentType || "application/octet-stream",
    });
    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 300 });
    const publicUrl = `${R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;

    return NextResponse.json({ uploadUrl, key, publicUrl });
  } catch (err) {
    console.error("Presign failed:", err);
    return NextResponse.json({ error: "Could not create upload URL." }, { status: 500 });
  }
}
