import { S3Client } from "@aws-sdk/client-s3";

// R2 is S3-compatible, so the standard AWS SDK works against it — just point
// the endpoint at your account's R2 URL instead of AWS. Credentials come from
// an R2 API token (Cloudflare dashboard → R2 → Manage API Tokens), not your
// Cloudflare account login.
export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

export const R2_BUCKET = process.env.R2_BUCKET_NAME || "";
// Public base URL for serving files back out — either R2's own r2.dev
// dev subdomain, or a custom domain you've connected to the bucket.
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "";
