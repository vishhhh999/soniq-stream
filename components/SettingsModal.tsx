"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sun, Moon, Sparkles, LogOut, Check, Pencil, Camera } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTheme } from "./ThemeProvider";
import { useAmbient } from "./AmbientProvider";
import { APP_VERSION } from "@/lib/version";
import { gradientFromSeed } from "@/lib/gradient";

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { theme, toggle: toggleTheme } = useTheme();
  const { enabled: ambientOn, toggle: toggleAmbient } = useAmbient();
  const [email, setEmail] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
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
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/user/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.email) setEmail(d.email);
        if (d.id) setUserId(d.id);
        setUsername(d.username || null);
        setAvatarUrl(d.avatarUrl || null);
        setHasPassword(!!d.hasPassword);
      })
      .catch(() => {});
  }, []);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    const formData = new FormData();
    formData.append("avatar", file);
    const res = await fetch("/api/user/avatar", { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.avatarUrl) setAvatarUrl(data.avatarUrl);
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
        className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center px-6"
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
                </div>
              </div>
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

            <p className="text-xs text-tertiary text-center pt-2">SONIQ v{APP_VERSION}</p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
