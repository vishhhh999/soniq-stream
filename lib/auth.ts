// Uses Web Crypto (SubtleCrypto) instead of Node's `crypto` module —
// middleware runs on Vercel's Edge Runtime, which doesn't support Node
// built-ins. Web Crypto works in both Node and Edge, so this file is safe
// to import from middleware.ts.
const COOKIE_NAME = "soniq_session";
const SESSION_DAYS = 30;

function getSecret(): string {
  const s = process.env.APP_SECRET;
  if (!s) throw new Error("APP_SECRET is not set — required to sign session cookies.");
  return s;
}

async function hmac(message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function signSession(): Promise<string> {
  const expiry = Date.now() + SESSION_DAYS * 86400000;
  const sig = await hmac(String(expiry));
  return `${expiry}.${sig}`;
}

export async function verifySession(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const [expiry, sig] = value.split(".");
  if (!expiry || !sig) return false;
  if (Date.now() > Number(expiry)) return false;
  const expected = await hmac(expiry);
  if (expected.length !== sig.length) return false;
  // constant-time compare (Web Crypto has no built-in for this)
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export const SESSION_COOKIE = COOKIE_NAME;
