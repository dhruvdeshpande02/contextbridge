"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Files, Calendar, Sparkles, Ellipsis, CircleQuestionMark, LogOut } from "lucide-react";
import { auth } from "@/lib/auth";
import { BridgeLogo } from "@/components/brain-illustration";
import { useWalkthrough } from "@/components/walkthrough/walkthrough-context";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Meetings", tourId: "nav-meetings", icon: Files },
  { href: "/calendar",  label: "Calendar", tourId: "nav-calendar", icon: Calendar },
  { href: "/query",     label: "Ask AI",   tourId: "nav-ask-ai",   icon: Sparkles },
] as const;

function LogoutModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
        onClick={onCancel} />
      {/* Dialog */}
      <div className="relative z-10 rounded-2xl px-7 py-6 w-full max-w-xs flex flex-col gap-4 animate-scale-in"
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
  const [showMore, setShowMore] = useState(false);
  const { start } = useWalkthrough();

  const confirmLogout = () => { auth.clearToken(); router.push("/login"); };

  const navLink = (href: string, label: string, tourId?: string) => {
    const active = path.startsWith(href);
    return (
      <Link key={href} href={href} data-tour={tourId}>
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

      {/* ── Desktop floating sidebar ── */}
      <aside
        className="hidden md:flex fixed top-6 left-5 bottom-6 z-50 flex-col w-44 px-3 py-5"
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
          {NAV_ITEMS.map(item => navLink(item.href, item.label, item.tourId))}
        </nav>

        <div className="flex-1" />

        <div className="h-px w-full mb-3" style={{ background: "rgba(255,255,255,0.05)" }} />

        <button
          onClick={start}
          className="flex items-center gap-2 px-3 py-2 w-full rounded-lg transition-colors text-base text-muted hover:text-subtle"
        >
          <span
            className="flex-shrink-0 flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold"
            style={{ border: "1px solid currentColor" }}
          >
            ?
          </span>
          Help
        </button>

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

      {/* ── Mobile top bar ── */}
      <header
        className="md:hidden fixed top-0 inset-x-0 z-50 flex items-center justify-between px-4 py-3"
        style={{
          background: "rgba(15,17,23,0.85)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="flex-shrink-0" style={{ color: "#4f7ef8", width: 26 }}>
            <BridgeLogo className="w-full h-auto" />
          </span>
          <span className="text-gradient font-bold text-sm tracking-tight">ContextBridge</span>
        </Link>

        <div className="relative">
          <button
            onClick={() => setShowMore(v => !v)}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-muted hover:text-ink transition-colors"
            aria-label="More options"
          >
            <Ellipsis className="w-5 h-5" />
          </button>

          {showMore && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMore(false)} />
              <div
                className="absolute right-0 top-full mt-2 z-50 w-40 rounded-xl p-1.5 flex flex-col gap-0.5 animate-scale-in"
                style={{ background: "rgba(15,17,23,0.97)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 8px 30px rgba(0,0,0,0.5)" }}
              >
                <button
                  onClick={() => { setShowMore(false); start(); }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:text-ink transition-colors text-left"
                >
                  <CircleQuestionMark className="w-4 h-4" /> Help
                </button>
                <button
                  onClick={() => { setShowMore(false); setShowLogout(true); }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left"
                  style={{ color: "#8b6a6a" }}
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── Mobile bottom tab bar ── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 flex items-stretch justify-around"
        style={{
          background: "rgba(15,17,23,0.9)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {NAV_ITEMS.map(item => {
          const active = path.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-tour={item.tourId}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5"
            >
              <Icon className="w-5 h-5" style={{ color: active ? "#4f7ef8" : "#5a6070" }} />
              <span className="text-[11px] font-medium" style={{ color: active ? "#e8eaf0" : "#5a6070" }}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
