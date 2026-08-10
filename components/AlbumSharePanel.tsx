"use client";

import { useEffect, useRef, useState } from "react";
import { triggerFeedback } from "@/lib/feedback";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Globe, Lock, Users, Link2, Check, ChevronRight, ChevronLeft,
  MoreHorizontal, Trash2, Copy,
} from "lucide-react";
import { gradientFromSeed } from "@/lib/gradient";
import { MODAL_SPRING } from "@/lib/motion";

type Member = {
  id: string;
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  canEdit: boolean;
  canDownload: boolean;
};

type InviteLink = {
  id: string;
  token: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  active: boolean;
};

type ShareData = {
  accessMode: string;
  allowEdit: boolean;
  allowDownload: boolean;
  members: Member[];
  inviteLink: InviteLink | null;
};

type PublicLink = {
  token: string;
  allowDownload: boolean;
  expiresAt: string | null;
};

type View = "main" | "members" | "access" | "invite";

function Avatar({ userId, username, avatarUrl, size = 8 }: { userId: string; username: string | null; avatarUrl: string | null; size?: number }) {
  const { from, to } = gradientFromSeed(userId);
  const label = username?.[0]?.toUpperCase() ?? "?";
  const px = size * 4;
  return (
    <div
      className={`w-${size} h-${size} rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold text-white`}
      style={{ width: px, height: px, background: avatarUrl ? undefined : `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : label}
    </div>
  );
}

export default function AlbumSharePanel({
  albumId,
  albumName,
  albumCoverUrl,
  onClose,
}: {
  albumId: string;
  albumName: string;
  albumCoverUrl?: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<ShareData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [view, setView] = useState<View>("main");
  const [memberMenuFor, setMemberMenuFor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [inviteUses, setInviteUses] = useState<string>("");
  const [inviteExpiry, setInviteExpiry] = useState<string>("");
  const [useType, setUseType] = useState<"uses" | "expiry" | "unlimited">("unlimited");
  const [saving, setSaving] = useState(false);

  // Public link — the plain, no-account-needed share model (shareLinks
  // table, consumed at /s/[token]). Separate state from the invite link
  // above on purpose: different table, different route, different access
  // model. Don't merge these into one "link" concept.
  const [publicLink, setPublicLink] = useState<PublicLink | null>(null);
  const [publicLinkLoaded, setPublicLinkLoaded] = useState(false);
  const [publicLinkError, setPublicLinkError] = useState<string | null>(null);
  const [publicLinkBusy, setPublicLinkBusy] = useState(false);
  const [publicCopied, setPublicCopied] = useState(false);

  const load = () => {
    setLoadError(null);
    fetch(`/api/albums/${albumId}/share`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `Couldn't load share settings (${r.status}).`);
        }
        return r.json();
      })
      .then(setData)
      .catch((e) => setLoadError(e.message));
  };

  const loadPublicLink = () => {
    fetch(`/api/albums/${albumId}/public-share`)
      .then((r) => r.json())
      .then((d) => setPublicLink(d.link ?? null))
      .catch(() => {})
      .finally(() => setPublicLinkLoaded(true));
  };

  useEffect(() => { load(); loadPublicLink(); }, [albumId]);

  const createPublicLink = async () => {
    setPublicLinkBusy(true);
    setPublicLinkError(null);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ albumId, allowDownload: false }),
      });
      if (!res.ok) throw new Error();
      const link = await res.json();
      setPublicLink({ token: link.token, allowDownload: link.allowDownload, expiresAt: link.expiresAt });
    } catch {
      setPublicLinkError("Couldn't create the link. Try again.");
    }
    setPublicLinkBusy(false);
  };

  const togglePublicDownload = async (next: boolean) => {
    setPublicLink((p) => (p ? { ...p, allowDownload: next } : p));
    setPublicLinkError(null);
    try {
      const res = await fetch(`/api/albums/${albumId}/public-share`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowDownload: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setPublicLink((p) => (p ? { ...p, allowDownload: !next } : p));
      setPublicLinkError("Couldn't update that. Try again.");
    }
  };

  const revokePublicLink = async () => {
    setPublicLinkError(null);
    try {
      const res = await fetch(`/api/albums/${albumId}/public-share`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPublicLink(null);
    } catch {
      setPublicLinkError("Couldn't deactivate the link. Try again.");
    }
  };

  const copyPublicLink = () => {
    if (!publicLink) return;
    navigator.clipboard.writeText(`${window.location.origin}/s/${publicLink.token}`);
    setPublicCopied(true);
    triggerFeedback("tap");
    setTimeout(() => setPublicCopied(false), 1500);
  };

  const patchSettings = async (patch: Partial<Pick<ShareData, "accessMode" | "allowEdit" | "allowDownload">>) => {
    setSaving(true);
    setActionError(null);
    // Optimistic, but reverted if the request actually fails — previously
    // this applied unconditionally, so a failed toggle (expired session,
    // transient 500) left the UI showing settings that were never actually
    // saved on the server.
    const previous = data;
    setData((d) => d ? { ...d, ...patch } : d);
    try {
      const res = await fetch(`/api/albums/${albumId}/share`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
    } catch {
      setData(previous);
      setActionError("Couldn't save that change. Try again.");
    }
    setSaving(false);
  };

  const generateInvite = async () => {
    setGeneratingLink(true);
    setActionError(null);
    const body: Record<string, unknown> = {};
    if (useType === "uses" && inviteUses) body.maxUses = parseInt(inviteUses, 10);
    if (useType === "expiry" && inviteExpiry) body.expiresAt = new Date(inviteExpiry).toISOString();
    try {
      const res = await fetch(`/api/albums/${albumId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const link = await res.json();
      setData((d) => d ? { ...d, inviteLink: link } : d);
      setView("main");
    } catch {
      setActionError("Couldn't create the invite link. Try again.");
    }
    setGeneratingLink(false);
  };

  const deactivateInvite = async () => {
    setActionError(null);
    const previous = data;
    setData((d) => d ? { ...d, inviteLink: null } : d);
    try {
      const res = await fetch(`/api/albums/${albumId}/invite`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setData(previous);
      setActionError("Couldn't deactivate the link. Try again.");
    }
  };

  const copyInviteLink = () => {
    if (!data?.inviteLink) return;
    navigator.clipboard.writeText(`${window.location.origin}/invite/${data.inviteLink.token}`);
    setCopied(true);
    triggerFeedback("tap");
    setTimeout(() => setCopied(false), 1500);
  };

  const removeMember = async (userId: string) => {
    setActionError(null);
    const previous = data;
    setData((d) => d ? { ...d, members: d.members.filter((m) => m.userId !== userId) } : d);
    setMemberMenuFor(null);
    try {
      const res = await fetch(`/api/albums/${albumId}/members/${userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setData(previous);
      setActionError("Couldn't remove that member. Try again.");
    }
  };

  const patchMember = async (userId: string, patch: { canEdit?: boolean; canDownload?: boolean }) => {
    setActionError(null);
    const previous = data;
    setData((d) => d ? {
      ...d,
      members: d.members.map((m) => m.userId === userId ? { ...m, ...patch } : m),
    } : d);
    try {
      const res = await fetch(`/api/albums/${albumId}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
    } catch {
      setData(previous);
      setActionError("Couldn't update that member. Try again.");
    }
  };

  const { from: gradFrom, to: gradTo } = gradientFromSeed(albumId);
  const inviteUrl = data?.inviteLink ? `${typeof window !== "undefined" ? window.location.origin : ""}/invite/${data.inviteLink.token}` : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 backdrop-ambient z-[60] flex items-end sm:items-center justify-center px-0 sm:px-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={MODAL_SPRING}
          className="bg-elevated border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-sm min-h-[240px] max-h-[85vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
            {view !== "main" && (
              <button onClick={() => setView("main")} className="text-tertiary hover:text-primary mr-1">
                <ChevronLeft size={18} strokeWidth={1.5} />
              </button>
            )}
            {albumCoverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={albumCoverUrl} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-md shrink-0" style={{ background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})` }} />
            )}
            <p className="text-sm font-medium text-primary truncate flex-1">{albumName}</p>
            <button onClick={onClose} className="text-tertiary hover:text-primary shrink-0" aria-label="Close">
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 no-scrollbar">

            {actionError && (
              <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-error/10 border border-error/20 text-xs text-error">
                {actionError}
              </div>
            )}

            {/* Loading / error states — previously the sheet silently
                rendered as just the header with nothing below it if the
                fetch failed or hadn't resolved yet. */}
            {loadError && (
              <div className="p-6 text-center">
                <p className="text-sm text-secondary mb-3">{loadError}</p>
                <button onClick={load} className="text-xs text-accent-text hover:underline">
                  Try again
                </button>
              </div>
            )}
            {!data && !loadError && (
              <div className="p-10 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin" />
              </div>
            )}

            {/* MAIN VIEW */}
            {view === "main" && data && (
              <>
                {/* Access mode pill */}
                <button
                  onClick={() => setView("access")}
                  className="m-4 w-[calc(100%-2rem)] flex items-center gap-3 bg-surface rounded-xl px-4 py-3 hover:bg-border/40 transition-colors"
                >
                  {data.accessMode === "invite_only" ? <Users size={16} strokeWidth={1.5} className="text-secondary" /> : <Lock size={16} strokeWidth={1.5} className="text-secondary" />}
                  <span className="flex-1 text-sm text-primary font-medium capitalize">{data.accessMode === "invite_only" ? "Invite Only" : "Private"}</span>
                  <ChevronRight size={14} strokeWidth={1.5} className="text-tertiary" />
                </button>

                {/* Who has access */}
                <button
                  onClick={() => setView("members")}
                  className="mx-4 w-[calc(100%-2rem)] flex items-center justify-between bg-surface rounded-xl px-4 py-3 hover:bg-border/40 transition-colors mb-4"
                >
                  <span className="text-sm text-primary font-medium">Who has access</span>
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {data.members.slice(0, 3).map((m) => (
                        <Avatar key={m.userId} userId={m.userId} username={m.username} avatarUrl={m.avatarUrl} size={7} />
                      ))}
                    </div>
                    <ChevronRight size={14} strokeWidth={1.5} className="text-tertiary" />
                  </div>
                </button>

                {/* Settings */}
                <div className="mx-4 bg-surface rounded-xl overflow-hidden mb-4">
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-xs uppercase tracking-wide text-tertiary mb-0.5">Settings</p>
                  </div>
                  <ToggleRow
                    label="Allow editing"
                    description="Those invited can edit and add tracks"
                    value={data.allowEdit}
                    onChange={(v) => patchSettings({ allowEdit: v })}
                  />
                  <ToggleRow
                    label="Allow downloads"
                    description="Those invited can download audio"
                    value={data.allowDownload}
                    onChange={(v) => patchSettings({ allowDownload: v })}
                  />
                </div>

                {/* Make private */}
                {data.accessMode !== "private" && (
                  <button
                    onClick={() => patchSettings({ accessMode: "private" })}
                    className="mx-4 w-[calc(100%-2rem)] flex items-center gap-3 bg-error/10 border border-error/20 rounded-xl px-4 py-3 hover:bg-error/15 transition-colors mb-4"
                  >
                    <Lock size={15} strokeWidth={1.5} className="text-error" />
                    <span className="text-sm text-error font-medium">Make project private</span>
                  </button>
                )}

                {/* Invite link section */}
                <div className="mx-4 mb-5">
                  {data.inviteLink ? (
                    <div className="bg-surface rounded-xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                        <p className="text-sm font-medium text-primary">Invite link</p>
                        <button
                          onClick={deactivateInvite}
                          className="text-xs text-error hover:text-error/80 transition-colors"
                        >
                          Deactivate
                        </button>
                      </div>
                      <div className="px-4 py-3">
                        <div className="flex items-center gap-2 bg-canvas rounded-lg px-3 py-2 mb-3">
                          <p className="text-xs text-secondary truncate flex-1">{inviteUrl}</p>
                          <button onClick={copyInviteLink} className="shrink-0">
                            {copied ? <Check size={14} className="text-accent" /> : <Copy size={14} className="text-tertiary hover:text-primary" />}
                          </button>
                        </div>
                        <div className="flex items-center justify-between text-xs text-tertiary">
                          <span>Expires: {data.inviteLink.expiresAt ? new Date(data.inviteLink.expiresAt).toLocaleDateString() : "Never"}</span>
                          <span>{data.inviteLink.maxUses !== null ? `${data.inviteLink.usedCount} / ${data.inviteLink.maxUses} uses` : `${data.inviteLink.usedCount} uses`}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setView("invite")}
                      className="w-full flex items-center justify-center gap-2 bg-surface rounded-xl px-4 py-3 text-sm text-secondary hover:text-primary hover:bg-border/40 transition-colors"
                    >
                      <Link2 size={15} strokeWidth={1.5} />
                      Create invite link
                    </button>
                  )}
                </div>

                {/* Public link — anyone with this link can listen without
                    an account. Saving to their own library or downloading
                    requires login; downloading additionally requires the
                    toggle below to be on. Separate from the invite system
                    above, which grants permissioned membership instead. */}
                <div className="mx-4 mb-4">
                  <div className="bg-surface rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                      <Globe size={14} strokeWidth={1.5} className="text-secondary" />
                      <div>
                        <p className="text-sm font-medium text-primary">Public link</p>
                        <p className="text-xs text-tertiary mt-0.5">Anyone with the link can listen. Login is required to save or download.</p>
                      </div>
                    </div>
                    <div className="px-4 py-3">
                      {publicLinkError && <p className="text-xs text-error mb-2">{publicLinkError}</p>}
                      {!publicLinkLoaded ? (
                        <div className="h-9 rounded-lg bg-canvas animate-pulse" />
                      ) : !publicLink ? (
                        <button
                          onClick={createPublicLink}
                          disabled={publicLinkBusy}
                          className="w-full flex items-center justify-center gap-2 text-sm text-secondary border border-border rounded-lg px-4 py-2 hover:border-border-strong hover:text-primary transition-colors disabled:opacity-50"
                        >
                          <Link2 size={14} strokeWidth={1.5} />
                          {publicLinkBusy ? "Generating..." : "Create public link"}
                        </button>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 bg-canvas rounded-lg px-3 py-2 mb-3">
                            <p className="text-xs text-secondary truncate flex-1">{`${typeof window !== "undefined" ? window.location.origin : ""}/s/${publicLink.token}`}</p>
                            <button onClick={copyPublicLink} className="shrink-0">
                              {publicCopied ? <Check size={14} className="text-accent" /> : <Copy size={14} className="text-tertiary hover:text-primary" />}
                            </button>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer w-fit mb-3">
                            <input
                              type="checkbox"
                              checked={publicLink.allowDownload}
                              onChange={(e) => togglePublicDownload(e.target.checked)}
                              className="accent-[var(--accent)]"
                            />
                            Allow download
                          </label>
                          <button onClick={revokePublicLink} className="text-xs text-error hover:text-error/80 transition-colors">
                            Deactivate
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Invite button */}
                <div className="px-4 pb-5">
                  <button
                    onClick={() => setView("invite")}
                    className="w-full bg-primary text-canvas text-sm font-medium py-3 rounded-xl hover:opacity-90 transition-opacity"
                  >
                    Invite
                  </button>
                </div>
              </>
            )}

            {/* ACCESS MODE VIEW */}
            {view === "access" && data && (
              <div className="p-4 space-y-2">
                {([
                  { mode: "private", icon: <Lock size={16} strokeWidth={1.5} />, label: "Private", desc: "Only you" },
                  { mode: "invite_only", icon: <Users size={16} strokeWidth={1.5} />, label: "Invite Only", desc: "Invite people directly" },
                ] as const).map(({ mode, icon, label, desc }) => (
                  <button
                    key={mode}
                    onClick={() => patchSettings({ accessMode: mode })}
                    className={`w-full flex items-center gap-4 px-4 py-4 rounded-xl border transition-colors ${
                      data.accessMode === mode
                        ? "border-border-strong bg-surface"
                        : "border-border hover:border-border-strong"
                    }`}
                  >
                    <span className="text-secondary">{icon}</span>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-primary">{label}</p>
                      <p className="text-xs text-tertiary">{desc}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${data.accessMode === mode ? "border-accent" : "border-border"}`}>
                      {data.accessMode === mode && <div className="w-2.5 h-2.5 rounded-full bg-accent" />}
                    </div>
                  </button>
                ))}

                <ToggleRow
                  label="Allow downloads"
                  description="Those invited can download audio"
                  value={data.allowDownload}
                  onChange={(v) => patchSettings({ allowDownload: v })}
                />

                {data.accessMode !== "private" && (
                  <button
                    onClick={() => patchSettings({ accessMode: "private" })}
                    className="w-full flex items-center gap-3 bg-error/10 border border-error/20 rounded-xl px-4 py-3 hover:bg-error/15 transition-colors"
                  >
                    <Lock size={15} strokeWidth={1.5} className="text-error" />
                    <span className="text-sm text-error font-medium">Make project private</span>
                  </button>
                )}
              </div>
            )}

            {/* MEMBERS VIEW */}
            {view === "members" && data && (
              <div className="p-4">
                <p className="text-xs uppercase tracking-wide text-tertiary mb-3">Who has access</p>
                {data.members.length === 0 ? (
                  <p className="text-sm text-tertiary text-center py-6">No one yet. Share an invite link to give others access.</p>
                ) : (
                  <div className="space-y-1">
                    {data.members.map((m) => (
                      <div key={m.userId} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface transition-colors">
                        <Avatar userId={m.userId} username={m.username} avatarUrl={m.avatarUrl} size={8} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-primary font-medium truncate">{m.username ? `@${m.username}` : "Unknown"}</p>
                          <p className="text-xs text-tertiary">{m.canEdit ? "Can edit" : m.canDownload ? "Can download" : "View only"}</p>
                        </div>
                        <div className="relative">
                          <button
                            onClick={() => setMemberMenuFor(memberMenuFor === m.userId ? null : m.userId)}
                            className="text-tertiary hover:text-primary p-1"
                          >
                            <MoreHorizontal size={16} strokeWidth={1.5} />
                          </button>
                          {memberMenuFor === m.userId && (
                            <div className="absolute right-0 top-8 bg-elevated border border-border rounded-xl shadow-xl z-10 w-44 overflow-hidden">
                              <button onClick={() => patchMember(m.userId, { canDownload: !m.canDownload })} className="w-full text-left px-4 py-2.5 text-sm text-primary hover:bg-surface transition-colors">
                                {m.canDownload ? "Disable downloads" : "Allow downloads"}
                              </button>
                              <button onClick={() => patchMember(m.userId, { canEdit: !m.canEdit })} className="w-full text-left px-4 py-2.5 text-sm text-primary hover:bg-surface transition-colors">
                                {m.canEdit ? "Make view-only" : "Allow editing"}
                              </button>
                              <button onClick={() => removeMember(m.userId)} className="w-full text-left px-4 py-2.5 text-sm text-error hover:bg-error/10 transition-colors flex items-center gap-2">
                                <Trash2 size={13} strokeWidth={1.5} /> Remove
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* INVITE LINK VIEW */}
            {view === "invite" && (
              <div className="p-4 space-y-4">
                <div>
                  <p className="text-sm font-medium text-primary mb-1">Invite link</p>
                  <p className="text-xs text-tertiary">An expiring link that lets others join when accepted.</p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-tertiary">Limit by</p>
                  {([
                    { id: "unlimited", label: "No limit" },
                    { id: "uses", label: "Number of uses" },
                    { id: "expiry", label: "Expiry date" },
                  ] as const).map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => setUseType(id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${useType === id ? "border-border-strong bg-surface" : "border-border hover:border-border-strong"}`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${useType === id ? "border-accent" : "border-border"}`}>
                        {useType === id && <div className="w-2 h-2 rounded-full bg-accent" />}
                      </div>
                      <span className="text-sm text-primary">{label}</span>
                    </button>
                  ))}

                  {useType === "uses" && (
                    <input
                      type="number"
                      min={1}
                      value={inviteUses}
                      onChange={(e) => setInviteUses(e.target.value)}
                      placeholder="e.g. 10"
                      className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-primary focus:border-border-strong outline-none"
                    />
                  )}
                  {useType === "expiry" && (
                    <input
                      type="date"
                      value={inviteExpiry}
                      onChange={(e) => setInviteExpiry(e.target.value)}
                      min={new Date().toISOString().split("T")[0]}
                      className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-primary focus:border-border-strong outline-none"
                    />
                  )}
                </div>

                <button
                  onClick={generateInvite}
                  disabled={generatingLink || (useType === "uses" && !inviteUses) || (useType === "expiry" && !inviteExpiry)}
                  className="w-full bg-accent text-on-accent text-sm font-medium py-3 rounded-xl hover:bg-accent-strong transition-colors disabled:opacity-50"
                >
                  {generatingLink ? "Generating..." : "Generate invite link"}
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ToggleRow({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <p className="text-sm font-medium text-primary">{label}</p>
        <p className="text-xs text-tertiary">{description}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${value ? "bg-accent" : "bg-border"}`}
      >
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? "translate-x-5" : "translate-x-1"}`} />
      </button>
    </div>
  );
}
