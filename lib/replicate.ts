// Wraps the parts of Replicate's HTTP API this app actually needs:
// creating a Demucs prediction, and verifying that a webhook claiming to
// be from Replicate actually is. Requires REPLICATE_API_TOKEN in the
// environment (see lib/adminAccess.ts-style docs in the handoff for setup
// steps) — throws at first use, not at import time, matching the pattern
// in lib/razorpay.ts.

const REPLICATE_MODEL_OWNER = "ryan5453";
const REPLICATE_MODEL_NAME = "demucs";

function getToken(): string {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN is not set.");
  return token;
}

// cjwbw/demucs is a community model, not one of Replicate's "official"
// models — those can be called without a version, but community models
// still need a specific version id pinned per-request. Rather than
// hardcoding a version hash (which goes stale whenever the model author
// pushes an update, silently breaking this feature with a confusing 404),
// this looks up whatever the CURRENT latest version is at request time.
async function getLatestModelVersion(): Promise<string> {
  const res = await fetch(`https://api.replicate.com/v1/models/${REPLICATE_MODEL_OWNER}/${REPLICATE_MODEL_NAME}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`Couldn't look up the Demucs model on Replicate (${res.status}).`);
  const data = await res.json();
  const versionId = data?.latest_version?.id;
  if (!versionId) throw new Error("Replicate didn't return a model version to run.");
  return versionId;
}

// Kicks off a stem-separation prediction. Returns immediately with the
// prediction id — actual separation happens async on Replicate's GPU and
// reports back via webhookUrl once done (see app/api/webhooks/replicate).
export async function createStemSeparationPrediction(params: {
  audioUrl: string;
  webhookUrl: string;
}): Promise<{ predictionId: string }> {
  const version = await getLatestModelVersion();

  const res = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version,
      input: {
        audio: params.audioUrl,
        model: "htdemucs",
        format: "mp3",
        // "none" = full split into all 4 stems. The other valid values
        // ("vocals"/"drums"/"bass"/"other") instead do a 2-stem split —
        // that one isolated stem plus everything else combined — which
        // isn't what this feature needs. Confirmed against the model's
        // actual predictor.py source (github.com/Ryan5453/unblend), not
        // just scraped docs, since this specific parameter name/values
        // isn't consistently documented across Replicate's own pages.
        isolate_stem: "none",
      },
      webhook: params.webhookUrl,
      webhook_events_filter: ["completed"], // don't bother us for "starting"/"processing" ticks
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail || `Replicate rejected the prediction request (${res.status}).`);
  }

  const data = await res.json();
  return { predictionId: data.id };
}

// Replicate signs webhooks the same way Svix does (svix-id / svix-timestamp
// / svix-signature headers, HMAC-SHA256 over "{id}.{timestamp}.{rawBody}"
// using the base64 portion of a whsec_... secret). The secret itself isn't
// a static env var — it's account-wide and fetched from Replicate's API,
// cached in memory across warm serverless invocations so this isn't an
// extra round-trip on every webhook delivery.
let cachedWebhookSecret: string | null = null;

async function getWebhookSigningSecret(): Promise<string> {
  if (cachedWebhookSecret) return cachedWebhookSecret;
  const res = await fetch("https://api.replicate.com/v1/webhooks/default/secret", {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`Couldn't fetch the Replicate webhook signing secret (${res.status}).`);
  const data = await res.json();
  const secret = data?.key as string | undefined;
  if (!secret) throw new Error("Replicate didn't return a webhook signing secret.");
  cachedWebhookSecret = secret;
  return secret;
}

// Verifies an incoming webhook is genuinely from Replicate before any of
// its contents are trusted. Rejects requests with no valid signature and
// requests older than 5 minutes (replay-attack protection, matching
// Svix's own recommended window). Must be called with the RAW request
// body string — parsing to JSON and re-stringifying breaks the signature.
export async function verifyReplicateWebhook(params: {
  rawBody: string;
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
}): Promise<boolean> {
  const { rawBody, svixId, svixTimestamp, svixSignature } = params;
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const timestamp = parseInt(svixTimestamp, 10);
  if (!Number.isFinite(timestamp)) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - timestamp);
  if (ageSeconds > 300) return false; // older than 5 minutes — reject

  const secret = await getWebhookSigningSecret();
  const secretBytes = Buffer.from(secret.split("_")[1] ?? "", "base64");
  if (secretBytes.length === 0) return false;

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const crypto = await import("crypto");
  const expectedSignature = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  // Header can contain multiple space-delimited "v1,<sig>" entries.
  const passedSignatures = svixSignature.split(" ").map((s) => s.split(",")[1]).filter(Boolean);
  return passedSignatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSignature));
    } catch {
      return false; // length mismatch etc — not a match, not a crash
    }
  });
}

// Best-effort cancel — used both for explicit user cancellation and for
// auto-cleanup of stale jobs (see STALE_THRESHOLD_MS in the route). If the
// prediction already finished on Replicate's end, this just no-ops there;
// harmless either way.
export async function cancelPrediction(predictionId: string): Promise<void> {
  try {
    await fetch(`https://api.replicate.com/v1/predictions/${predictionId}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
  } catch (err) {
    console.error(`Couldn't cancel Replicate prediction ${predictionId} (non-fatal):`, err);
  }
}
