"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const router = useRouter();
  const handleLogout = () => { auth.clearToken(); router.push("/login"); };

  return (
    <nav className="border-b border-border bg-surface/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-accent font-bold text-lg tracking-tight">ContextBridge</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">Meetings</Button>
          </Link>
          <Link href="/query">
            <Button variant="ghost" size="sm">Query</Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLogout}>Logout</Button>
        </div>
      </div>
    </nav>
  );
}
