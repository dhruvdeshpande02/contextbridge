"use client";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { auth } from "@/lib/auth";
import { SmallBrainIcon } from "@/components/brain-illustration";

export function Navbar() {
  const router  = useRouter();
  const path    = usePathname();
  const logout  = () => { auth.clearToken(); router.push("/login"); };

  const isActive = (href: string) => path.startsWith(href);

  return (
    /* Floating pill — fixed, centered, slightly below top */
    <header className="fixed top-4 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
      <nav className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-border bg-elevated/80 backdrop-blur-xl px-3 py-2 shadow-2xl shadow-black/60">
        {/* Logo */}
        <Link
          href="/dashboard"
          className="mr-3 flex items-center gap-2.5 px-2 py-1 rounded-xl hover:bg-white/5 transition-colors"
        >
          <span className="w-6 h-6 text-amber-400 flex-shrink-0">
            <SmallBrainIcon className="w-full h-full animate-pulse-glow" />
          </span>
          <span className="text-gradient font-bold text-base tracking-tight">ContextBridge</span>
        </Link>

        {/* Divider */}
        <span className="h-4 w-px bg-border mx-1" />

        {/* Nav links */}
        <Link href="/dashboard">
          <span className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-xl transition-all duration-150 ${
            isActive("/dashboard")
              ? "bg-amber-500/15 text-amber-400 font-medium"
              : "text-muted hover:text-ink hover:bg-white/5"
          }`}>
            {isActive("/dashboard") && <span className="h-1 w-1 rounded-full bg-amber-400" />}
            Meetings
          </span>
        </Link>

        <Link href="/query">
          <span className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-xl transition-all duration-150 ${
            isActive("/query")
              ? "bg-amber-500/15 text-amber-400 font-medium"
              : "text-muted hover:text-ink hover:bg-white/5"
          }`}>
            {isActive("/query") && <span className="h-1 w-1 rounded-full bg-amber-400" />}
            Ask AI
          </span>
        </Link>

        {/* Divider */}
        <span className="h-4 w-px bg-border mx-1" />

        <button
          onClick={logout}
          className="px-3 py-1.5 text-sm text-muted rounded-xl hover:text-ink hover:bg-white/5 transition-all duration-150"
        >
          Logout
        </button>
      </nav>
    </header>
  );
}
