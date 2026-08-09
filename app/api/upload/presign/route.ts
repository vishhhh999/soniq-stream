import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";

export const dynamic = "force-dynamic";

// THIS ROUTE WAS FOUND COMPLETELY STUBBED OUT — `return { ok: true,
// unprotected: true }` with no presigned URL generation at all. Every
// upload in the app depends on this returning a real `uploadUrl` +
// `publicUrl` (see lib/useTrackUpload.ts, which destructures both and PUTs
// the file straight to `uploadUrl`) — so uploads were completely broken
// until this was restored. Likely cause: a previous session's "add an auth
// check for consistency" edit (see handoff v4, section 2) replaced the
// entire handler body instead of adding a check on top of the existing one.
//
// `@aws-sdk/s3-request-presigner` was already a listed dependency with
// nothing in the codebase actually calling it anymore — a second signal
// the real implementation used to live here.
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.filename) return NextResponse.json({ error: "Missing filename." }, { status: 400 });

  const { filename, contentType, kind } = body as { filename: string; contentType?: string; kind?: string };

  const ext = filename.match(/\.[^./?]+$/)?.[0] || "";
  const prefix = kind === "cover" ? "covers" : "tracks";
  const key = `${prefix}/${userId}/${nanoid()}${ext}`;

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType || "application/octet-stream",
  });

  const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 300 });
  const publicUrl = `${R2_PUBLIC_URL}/${key}`;

  return NextResponse.json({ uploadUrl, publicUrl, key });
}
