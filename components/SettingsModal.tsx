"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sun, Moon, Sparkles, LogOut, Check, Pencil } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTheme } from "./ThemeProvider";
import { useAmbient } from "./AmbientProvider";
import { APP_VERSION } from "@/lib/version";

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { theme, toggle: toggleTheme } = useTheme();
  const { enabled: ambientOn, toggle: toggleAmbient } = useAmbient();
  const [email, setEmail] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/user/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.email) setEmail(d.email);
        setUsername(d.username || null);
      })
      .catch(() => {});
  }, []);

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
                          onClick={() => {
                            setEditingUsername(false);
                            setUsernameError(null);
                          }}
                          className="text-xs text-secondary hover:text-primary transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setUsernameDraft(username || "");
                        setEditingUsername(true);
                      }}
                      className="flex items-center gap-1.5 text-sm text-primary hover:text-secondary transition-colors group"
                    >
                      {username ? `@${username}` : "Set a username"}
                      <Pencil size={12} strokeWidth={1.5} className="text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}
                </div>
              </div>
            </div>

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
