"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasTourCompleted, useWalkthrough } from "./walkthrough-context";

export function WelcomeGate() {
  const { active, start, skip } = useWalkthrough();
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (pathname === "/dashboard" && auth.isLoggedIn() && !hasTourCompleted()) {
      setShow(true);
    }
  }, [pathname]);

  if (!show || active) return null;

  const dismiss = () => { setShow(false); skip(); };

  return (
    <div className="fixed inset-0 z-[190] flex items-center justify-center px-4">
      <div
        className="absolute inset-0"
        style={{ background: "rgba(4,5,8,0.6)", backdropFilter: "blur(4px)" }}
        onClick={dismiss}
      />
      <div
        className="relative z-10 w-full max-w-sm rounded-2xl p-7 animate-scale-in"
        style={{ background: "rgba(15,17,23,0.97)", border: "1px solid rgba(79,126,248,0.2)", boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}
      >
        <div className="mb-3 text-2xl" style={{ color: "#4f7ef8" }}>&#10022;</div>
        <h2 className="text-lg font-semibold text-ink mb-2">New here? Take the tour</h2>
        <p className="text-sm text-muted leading-relaxed mb-6">
          A 60-second walkthrough of uploading transcripts, what AI extracts, the calendar, and cross-meeting Ask AI.
        </p>
        <div className="flex gap-2">
          <button
            onClick={dismiss}
            className="flex-1 rounded-lg py-2.5 text-sm font-medium text-subtle hover:text-ink transition-colors"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            Skip
          </button>
          <button
            onClick={() => { setShow(false); start(); }}
            className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white transition-colors"
            style={{ background: "#4f7ef8" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#3b6ef0")}
            onMouseLeave={e => (e.currentTarget.style.background = "#4f7ef8")}
          >
            Take the tour
          </button>
        </div>
      </div>
    </div>
  );
}
