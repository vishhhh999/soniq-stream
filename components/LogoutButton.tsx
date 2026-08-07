"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };
  return (
    <button
      onClick={logout}
      aria-label="Log out"
      title="Log out"
      className="w-8 h-8 flex items-center justify-center rounded-full border border-border hover:border-border-strong transition-colors text-secondary hover:text-primary"
    >
      <LogOut size={14} strokeWidth={1.5} />
    </button>
  );
}
