"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      aria-label="Log out"
      title="Log out"
      className="w-8 h-8 flex items-center justify-center rounded-full border border-border hover:border-border-strong transition-colors text-secondary hover:text-primary"
    >
      <LogOut size={14} strokeWidth={1.5} />
    </button>
  );
}
