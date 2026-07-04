"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { auth } from "@/lib/auth";
import { BridgeLogo } from "@/components/brain-illustration";

function LogoutModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
        onClick={onCancel} />
      {/* Dialog */}
      <div className="relative z-10 rounded-2xl px-7 py-6 w-72 flex flex-col gap-4 animate-scale-in"
        style={{ background: "rgba(15,17,23,0.95)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}>
        <div>
          <p className="text-sm font-semibold text-ink mb-1">Sign out?</p>
          <p className="text-xs text-muted">You'll need to sign in again to access your meetings.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 rounded-lg py-2 text-xs font-medium transition-colors text-subtle hover:text-ink"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            Cancel
          </button>
          <button onClick={onConfirm}
            className="flex-1 rounded-lg py-2 text-xs font-medium text-white transition-colors"
            style={{ background: "#f87171" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#ef4444")}
            onMouseLeave={e => (e.currentTarget.style.background = "#f87171")}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const router = useRouter();
  const path   = usePathname();
  const [showLogout, setShowLogout] = useState(false);

  const confirmLogout = () => { auth.clearToken(); router.push("/login"); };

  const navLink = (href: string, label: string) => {
    const active = path.startsWith(href);
    return (
      <Link href={href}>
        <span className={`block px-3 py-2 rounded-lg text-base transition-all duration-150 ${
          active ? "text-ink font-medium" : "text-muted hover:text-subtle"
        }`}>
          {label}
        </span>
      </Link>
    );
  };

  return (
    <>
      {showLogout && <LogoutModal onConfirm={confirmLogout} onCancel={() => setShowLogout(false)} />}

      <aside
        className="fixed top-6 left-5 bottom-6 z-50 flex flex-col w-44 px-3 py-5"
        style={{
          background: "rgba(15,17,23,0.6)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow: "0 0 40px 4px rgba(79,126,248,0.09), 0 0 12px 1px rgba(79,126,248,0.06), 0 8px 32px rgba(0,0,0,0.35)",
          borderRadius: "16px",
        }}
      >
        {/* Logo at top */}
        <Link href="/dashboard" className="flex flex-col items-center gap-2 w-full py-4 mb-4 rounded-xl hover:bg-white/[0.02] transition-colors">
          <span className="flex-shrink-0" style={{ color: "#4f7ef8", width: 64 }}>
            <BridgeLogo className="w-full h-auto" />
          </span>
          <span className="text-gradient font-bold text-lg tracking-tight text-center leading-snug">
            ContextBridge
          </span>
        </Link>

        <div className="h-px w-full mb-3" style={{ background: "rgba(255,255,255,0.05)" }} />

        {/* Nav links */}
        <nav className="flex flex-col gap-0.5">
          {navLink("/dashboard", "Meetings")}
          {navLink("/calendar", "Calendar")}
          {navLink("/query", "Ask AI")}
        </nav>

        <div className="flex-1" />

        <div className="h-px w-full mb-3" style={{ background: "rgba(255,255,255,0.05)" }} />

        <button
          onClick={() => setShowLogout(true)}
          className="text-left px-3 py-2 w-full rounded-lg transition-colors text-base"
          style={{ color: "#3a4155" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#5a6070")}
          onMouseLeave={e => (e.currentTarget.style.color = "#3a4155")}
        >
          Logout
        </button>
      </aside>
    </>
  );
}

