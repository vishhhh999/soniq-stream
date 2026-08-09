"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sun, Moon, Sparkles, LogOut, Check, Pencil, Camera } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTheme } from "./ThemeProvider";
import { useAmbient } from "./AmbientProvider";
import { usePlayer } from "./PlayerProvider";
import { APP_VERSION } from "@/lib/version";
import { gradientFromSeed } from "@/lib/gradient";

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { theme, toggle: toggleTheme } = useTheme();
  const { enabled: ambientOn, toggle: toggleAmbient } = useAmbient();
  const { crossfadeEnabled, crossfadeDuration, setCrossfade } = usePlayer();
  const [email, setEmail] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPasswordDraft, setCurrentPasswordDraft] = useState("");
  const [newPasswordDraft, setNewPasswordDraft] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [plan, setPlan] = useState<{
    isPaid: boolean;
    status: string;
    periodEnd: string | null;
    storageUsedBytes: number;
    storageCapBytes: number | null;
  } | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const refetchMe = () => {
    fetch("/api/user/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        if (d.plan) setPlan(d.plan);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetch("/api/user/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return; // failed — leave fields blank rather than showing wrong data
        if (d.email) setEmail(d.email);
        if (d.id) setUserId(d.id);
        setUsername(d.username || null);
        setAvatarUrl(d.avatarUrl || null);
        setHasPassword(!!d.hasPassword);
        if (d.plan) setPlan(d.plan);
      })
      .catch(() => {});
  }, []);

  // Razorpay has no hosted checkout page — it's a client-side modal driven
  // by checkout.js, loaded on demand rather than in every page's <head>
  // since most visits never touch billing.
  const loadRazorpayScript = () =>
    new Promise<boolean>((resolve) => {
      if ((window as any).Razorpay) return resolve(true);
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  const startUpgrade = async () => {
    setUpgrading(true);
    setBillingError(null);
    try {
      const [scriptLoaded, res] = await Promise.all([
        loadRazorpayScript(),
        fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interval: billingInterval }),
        }),
      ]);
      if (!scriptLoaded) throw new Error("Could not load the payment form. Check your connection and try again.");
      const data = await res.json();
      if (!res.ok || !data.subscriptionId) throw new Error(data.error || "Could not start checkout.");

      const rzp = new (window as any).Razorpay({
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: "SONIQ",
        description: billingInterval === "yearly" ? "SONIQ Pro — yearly" : "SONIQ Pro — monthly",
        theme: { color: "#f2f2f2" },
        // Verifies the signature server-side and, if genuine, flips the UI
        // to Pro immediately — the webhook (subscription.activated) is
        // still the actual source of truth and will independently confirm
        // this moments later, this just closes the gap so the user isn't
        // staring at "Free" for a few seconds after paying.
        handler: async (response: any) => {
          try {
            const verifyRes = await fetch("/api/billing/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(response),
            });
            if (!verifyRes.ok) throw new Error();
          } catch {
            // Non-fatal — the webhook will still land shortly and correct
            // the status regardless of whether this optimistic step worked.
          }
          setUpgrading(false);
          refetchMe();
        },
        modal: {
          ondismiss: () => setUpgrading(false),
        },
      });
      rzp.on("payment.failed", () => {
        setBillingError("Payment failed. No charge was made — try again or use a different card.");
        setUpgrading(false);
      });
      rzp.open();
    } catch (e: any) {
      setBillingError(e.message || "Could not start checkout. Try again.");
      setUpgrading(false);
    }
  };

  const cancelSubscription = async () => {
    setCancelling(true);
    setBillingError(null);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not cancel.");
      setConfirmingCancel(false);
      refetchMe();
    } catch (e: any) {
      setBillingError(e.message || "Could not cancel. Try again.");
    }
    setCancelling(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setAvatarError(null);
    const formData = new FormData();
    formData.append("avatar", file);
    const res = await fetch("/api/user/avatar", { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.avatarUrl) {
      setAvatarUrl(data.avatarUrl);
    } else {
      // Previously checked res.ok before applying the new URL, but never
      // surfaced a failure — the upload just silently did nothing.
      setAvatarError(data.error || "Couldn't upload that image. Try again.");
    }
    setUploadingAvatar(false);
    // Reset input so same file can be re-selected.
    e.target.value = "";
  };

  const saveUsername = async () => {
    setSaving(true);
    setUsernameError(null);
    const res = await fetch("/api/user/username", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: usernameDraft }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setUsernameError(data.error || "Could not save username.");
      return;
    }
    setUsername(data.username);
    setEditingUsername(false);
  };

  const savePassword = async () => {
    setSavingPassword(true);
    setPasswordError(null);
    const res = await fetch("/api/user/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: currentPasswordDraft, newPassword: newPasswordDraft }),
    });
    const data = await res.json();
    setSavingPassword(false);
    if (!res.ok) {
      setPasswordError(data.error || "Could not update password.");
      return;
    }
    setHasPassword(true);
    setEditingPassword(false);
    setCurrentPasswordDraft("");
    setNewPasswordDraft("");
    setPasswordSaved(true);
    setTimeout(() => setPasswordSaved(false), 2000);
  };

  const { from: gradFrom, to: gradTo } = gradientFromSeed(userId ?? "default");

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 backdrop-ambient z-[60] flex items-center justify-center px-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="bg-elevated border border-border rounded-lg w-full max-w-sm max-h-[85vh] overflow-y-auto no-scrollbar"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-5 border-b border-border">
            <h2 className="text-md font-medium text-primary">Settings</h2>
            <button onClick={onClose} className="text-tertiary hover:text-primary transition-colors">
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>

          <div className="p-6 space-y-8">
            {/* Profile picture */}
            <div>
              <label className="text-xs uppercase tracking-wide text-tertiary mb-3 block">Profile</label>
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="relative w-16 h-16 rounded-full overflow-hidden shrink-0 focus:outline-none"
                  >
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-2xl font-bold text-white"
                        style={{ background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})` }}
                      >
                        {username?.[0]?.toUpperCase() ?? email?.[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 rounded-full">
                      {uploadingAvatar
                        ? <span className="text-white text-[10px]">...</span>
                        : <Camera size={16} strokeWidth={1.5} className="text-white" />
                      }
                    </div>
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    hidden
                    onChange={handleAvatarUpload}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-primary">{username ? `@${username}` : email ?? "—"}</p>
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="text-xs text-tertiary hover:text-secondary transition-colors mt-0.5"
                  >
                    {uploadingAvatar ? "Uploading..." : "Change photo"}
                  </button>
                  {avatarError && <p className="text-xs text-error mt-1">{avatarError}</p>}
                </div>
              </div>
            </div>

            {/* Plan / storage — free tier is a storage cap only, no track
                or feature gating. Checkout opens Razorpay's own hosted
                checkout.js modal (no redirect page — see startUpgrade);
                cancellation is a direct API call since Razorpay has no
                self-serve billing portal for standard accounts. */}
            <div className="px-6 py-5 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wide text-tertiary">Plan</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${plan?.isPaid ? "bg-accent/15 text-accent" : "bg-surface text-secondary"}`}>
                  {plan?.isPaid ? "SONIQ Pro" : "Free"}
                </span>
              </div>

              {plan && !plan.isPaid && plan.storageCapBytes && (
                <div className="mb-3">
                  <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${plan.storageUsedBytes / plan.storageCapBytes > 0.9 ? "bg-error" : "bg-accent"}`}
                      style={{ width: `${Math.min(100, (plan.storageUsedBytes / plan.storageCapBytes) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-tertiary mt-1.5">
                    {(plan.storageUsedBytes / (1024 * 1024)).toFixed(0)}MB of {(plan.storageCapBytes / (1024 * 1024)).toFixed(0)}MB used
                  </p>
                </div>
              )}

              {plan?.isPaid && (
                <p className="text-xs text-tertiary mb-3">
                  Unlimited storage.
                  {plan.status === "past_due" && " Your last payment didn't go through — update your card to avoid losing access."}
                  {plan.periodEnd && plan.status === "active" && ` Renews ${new Date(plan.periodEnd).toLocaleDateString()}.`}
                </p>
              )}

              {billingError && <p className="text-xs text-error mb-2">{billingError}</p>}

              {plan?.isPaid ? (
                confirmingCancel ? (
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <span className="text-secondary hidden sm:inline">
                      Cancel? You'll keep Pro until the current period ends.
                    </span>
                    <button
                      onClick={cancelSubscription}
                      disabled={cancelling}
                      className="text-error border border-error/40 rounded-md px-3 py-1.5 hover:bg-error/10 transition-colors disabled:opacity-50"
                    >
                      {cancelling ? "Cancelling..." : "Yes, cancel"}
                    </button>
                    <button
                      onClick={() => setConfirmingCancel(false)}
                      className="text-secondary border border-border rounded-md px-3 py-1.5 hover:border-border-strong transition-colors"
                    >
                      Never mind
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingCancel(true)}
                    className="text-xs text-secondary border border-border rounded-md px-3 py-1.5 hover:border-border-strong transition-colors"
                  >
                    Cancel subscription
                  </button>
                )
              ) : (
                <div className="space-y-2.5">
                  {/* Monthly/yearly — actual prices live on the Razorpay
                      Plans (RAZORPAY_PLAN_ID_MONTHLY / _YEARLY), these
                      labels are just the marketing framing kept in sync
                      manually. Update both together if pricing changes. */}
                  <div className="flex flex-wrap gap-1.5 p-0.5 bg-surface rounded-md w-fit">
                    <button
                      onClick={() => setBillingInterval("monthly")}
                      className={`text-xs px-3 py-1.5 rounded transition-colors ${billingInterval === "monthly" ? "bg-canvas text-primary" : "text-secondary hover:text-primary"}`}
                    >
                      Monthly — $5/mo
                    </button>
                    <button
                      onClick={() => setBillingInterval("yearly")}
                      className={`text-xs px-3 py-1.5 rounded transition-colors ${billingInterval === "yearly" ? "bg-canvas text-primary" : "text-secondary hover:text-primary"}`}
                    >
                      Yearly — $40/yr
                      <span className="ml-1.5 text-[10px] text-accent">4 months free</span>
                    </button>
                  </div>
                  <button
                    onClick={startUpgrade}
                    disabled={upgrading}
                    className="text-xs font-medium text-canvas bg-accent rounded-md px-3 py-1.5 hover:bg-accent-strong transition-colors disabled:opacity-50"
                  >
                    {upgrading ? "Opening checkout..." : "Upgrade to Pro"}
                  </button>
                </div>
              )}
            </div>

            {/* Account */}
            <div>
              <label className="text-xs uppercase tracking-wide text-tertiary mb-3 block">Account</label>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-tertiary mb-1">Email</p>
                  <p className="text-sm text-primary">{email || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-tertiary mb-1">Username</p>
                  {editingUsername ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-tertiary">@</span>
                        <input
                          autoFocus
                          value={usernameDraft}
                          onChange={(e) => setUsernameDraft(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                          onKeyDown={(e) => e.key === "Enter" && saveUsername()}
                          className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-primary focus:border-border-strong outline-none"
                        />
                      </div>
                      {usernameError && <p className="text-xs text-error">{usernameError}</p>}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={saveUsername}
                          disabled={saving || usernameDraft.length < 3}
                          className="text-xs bg-accent text-canvas rounded-md px-3 py-1.5 hover:bg-accent-strong transition-colors disabled:opacity-50"
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={() => { setEditingUsername(false); setUsernameError(null); }}
                          className="text-xs text-secondary hover:text-primary transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setUsernameDraft(username || ""); setEditingUsername(true); }}
                      className="flex items-center gap-1.5 text-sm text-primary hover:text-secondary transition-colors group"
                    >
                      {username ? `@${username}` : "Set a username"}
                      <Pencil size={12} strokeWidth={1.5} className="text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}
                </div>

                <div>
                  <p className="text-xs text-tertiary mb-1">Password</p>
                  {editingPassword ? (
                    <div className="space-y-2">
                      {hasPassword && (
                        <input
                          type="password"
                          value={currentPasswordDraft}
                          onChange={(e) => setCurrentPasswordDraft(e.target.value)}
                          placeholder="Current password"
                          className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-primary focus:border-border-strong outline-none"
                        />
                      )}
                      <input
                        type="password"
                        value={newPasswordDraft}
                        onChange={(e) => setNewPasswordDraft(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && savePassword()}
                        placeholder="New password (min. 8 characters)"
                        className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-primary focus:border-border-strong outline-none"
                      />
                      {passwordError && <p className="text-xs text-error">{passwordError}</p>}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={savePassword}
                          disabled={savingPassword || newPasswordDraft.length < 8}
                          className="text-xs bg-accent text-canvas rounded-md px-3 py-1.5 hover:bg-accent-strong transition-colors disabled:opacity-50"
                        >
                          {savingPassword ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={() => { setEditingPassword(false); setPasswordError(null); setCurrentPasswordDraft(""); setNewPasswordDraft(""); }}
                          className="text-xs text-secondary hover:text-primary transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingPassword(true)}
                        className="text-sm text-primary hover:text-secondary transition-colors"
                      >
                        {hasPassword ? "Change password" : "Set a password"}
                      </button>
                      {passwordSaved && <span className="text-xs text-accent flex items-center gap-1"><Check size={12} strokeWidth={2} /> Saved</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Playback */}
            <div>
              <label className="text-xs uppercase tracking-wide text-tertiary mb-3 block">Playback</label>
              <div className="space-y-1">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm text-primary">Crossfade</p>
                    <p className="text-xs text-tertiary">Blend between tracks</p>
                  </div>
                  <button
                    onClick={() => setCrossfade(!crossfadeEnabled, crossfadeDuration)}
                    className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${crossfadeEnabled ? "bg-accent" : "bg-border"}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${crossfadeEnabled ? "translate-x-5" : "translate-x-1"}`} />
                  </button>
                </div>

                {crossfadeEnabled && (
                  <div className="pb-2">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-secondary">Duration</p>
                      <p className="text-xs font-medium text-primary tabular-nums">{crossfadeDuration}s</p>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={12}
                      step={0.5}
                      value={crossfadeDuration}
                      onChange={(e) => setCrossfade(true, parseFloat(e.target.value))}
                      className="w-full accent-[var(--accent)]"
                    />
                    <div className="flex justify-between text-[10px] text-tertiary mt-1">
                      <span>1s</span>
                      <span>12s</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Appearance */}
            <div>
              <label className="text-xs uppercase tracking-wide text-tertiary mb-3 block">Appearance</label>
              <div className="space-y-1">
                <button
                  onClick={toggleTheme}
                  className="w-full flex items-center justify-between py-2 text-sm text-primary hover:text-secondary transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    {theme === "dark" ? <Moon size={15} strokeWidth={1.5} /> : <Sun size={15} strokeWidth={1.5} />}
                    Theme
                  </span>
                  <span className="text-xs text-tertiary capitalize">{theme}</span>
                </button>
                <button
                  onClick={toggleAmbient}
                  className="w-full flex items-center justify-between py-2 text-sm text-primary hover:text-secondary transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    <Sparkles size={15} strokeWidth={1.5} />
                    Ambient background
                  </span>
                  {ambientOn ? (
                    <Check size={14} strokeWidth={2} className="text-accent" />
                  ) : (
                    <span className="text-xs text-tertiary">Off</span>
                  )}
                </button>
              </div>
            </div>

            <div className="border-t border-border pt-6">
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center gap-2.5 text-sm text-error hover:text-error/80 transition-colors"
              >
                <LogOut size={15} strokeWidth={1.5} />
                Sign out
              </button>
            </div>

            {/* Previously there was no way back to the marketing page,
                feature list, pricing, or legal links once signed in —
                the root path (/) always redirects a signed-in user
                straight to the library. /about renders the same
                LandingPage content but is reachable regardless of auth
                state. */}
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-tertiary pt-2">
              <Link href="/about" className="hover:text-secondary transition-colors">About SONIQ</Link>
              <Link href="/terms" className="hover:text-secondary transition-colors">Terms</Link>
              <Link href="/privacy" className="hover:text-secondary transition-colors">Privacy</Link>
              <Link href="/cookies" className="hover:text-secondary transition-colors">Cookie Policy</Link>
              <Link href="/contact" className="hover:text-secondary transition-colors">Contact</Link>
            </div>

            <p className="text-xs text-tertiary text-center pt-1">SONIQ v{APP_VERSION}</p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
