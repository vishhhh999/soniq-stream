// Shared by both signup paths (OTP email+password, Google sign-in) so
// there's exactly one place that defines "who's allowed to create an
// account" rather than two independently-drifting checks.
//
// ALLOWED_EMAILS is a comma-separated list of exact emails and/or
// "@domain.com" wildcard entries, e.g. "me@gmail.com,@mycompany.com".
// Unset or empty = signup is open to anyone (matches the documented
// "leave unset if you want it open" behavior).
//
// This only gates NEW account creation. It does not affect existing
// users signing back in — someone who already has an account keeps
// working even if ALLOWED_EMAILS changes later.
export function isEmailAllowed(email: string): boolean {
  const raw = process.env.ALLOWED_EMAILS;
  if (!raw || !raw.trim()) return true;

  const normalized = email.toLowerCase().trim();
  const entries = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return entries.some((entry) => {
    if (entry.startsWith("@")) return normalized.endsWith(entry);
    return normalized === entry;
  });
}
