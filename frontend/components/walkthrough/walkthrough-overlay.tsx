"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useWalkthrough } from "./walkthrough-context";

interface Rect { top: number; left: number; width: number; height: number }

const PAD = 8;
const GAP = 16;

export function WalkthroughOverlay() {
  const { active, stepIndex, steps, next, prev, skip } = useWalkthrough();
  const pathname = usePathname();
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Locate the target element for the current step (polling handles async route/mount timing).
  // The same data-tour id can exist twice at once — a desktop sidebar link and a
  // mobile bottom-tab link — since one is always display:none depending on viewport.
  // Picking the one with a non-zero rect finds whichever is actually rendered.
  useEffect(() => {
    if (!active || !step) { setReady(false); setRect(null); return; }
    setReady(false);
    setRect(null);

    if (!step.selector) { setReady(true); return; }
    if (pathname !== step.path) return;

    const findVisible = (): HTMLElement | null => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(step.selector!));
      return candidates.find(c => {
        const r = c.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }) ?? null;
    };

    let cancelled = false;
    let attempts = 0;
    const tryFind = () => {
      if (cancelled) return;
      const el = findVisible();
      if (el) {
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
        requestAnimationFrame(() => {
          if (cancelled) return;
          const r = el.getBoundingClientRect();
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
          setReady(true);
        });
      } else if (attempts++ < 40) {
        setTimeout(tryFind, 50);
      } else {
        setReady(true);
      }
    };
    tryFind();

    const onReflow = () => {
      const el = findVisible();
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      }
    };
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [active, step, pathname]);

  // Position the tooltip relative to the target (or centered), clamped to the viewport.
  useLayoutEffect(() => {
    if (!ready || !active) { setPos(null); return; }
    const el = tooltipRef.current;
    if (!el) return;
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top: number, left: number;
    if (!rect) {
      top = (vh - th) / 2;
      left = (vw - tw) / 2;
    } else {
      // Side placements (left/right) assume a desktop-width neighbor column.
      // On a narrow viewport there's often no room for that, so fall back to
      // whichever vertical direction (above/below the target) has more space.
      let placement = step.placement as "top" | "bottom" | "left" | "right";
      const fitsLeft  = rect.left >= tw + GAP;
      const fitsRight = vw - (rect.left + rect.width) >= tw + GAP;
      if ((placement === "left" && !fitsLeft) || (placement === "right" && !fitsRight)) {
        const spaceBelow = vh - (rect.top + rect.height);
        const spaceAbove = rect.top;
        placement = spaceBelow >= spaceAbove ? "bottom" : "top";
      }

      switch (placement) {
        case "right":
          top = rect.top + rect.height / 2 - th / 2;
          left = rect.left + rect.width + GAP;
          break;
        case "left":
          top = rect.top + rect.height / 2 - th / 2;
          left = rect.left - tw - GAP;
          break;
        case "top":
          top = rect.top - th - GAP;
          left = rect.left + rect.width / 2 - tw / 2;
          break;
        case "bottom":
        default:
          top = rect.top + rect.height + GAP;
          left = rect.left + rect.width / 2 - tw / 2;
      }
    }

    top = Math.min(Math.max(top, GAP), vh - th - GAP);
    left = Math.min(Math.max(left, GAP), vw - tw - GAP);
    setPos({ top, left });
  }, [ready, rect, step, active, stepIndex]);

  // Keyboard navigation.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
      if (e.key === "ArrowRight" || e.key === "Enter") (isLast ? skip() : next());
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, next, prev, skip, isLast]);

  if (!active || !step) return null;

  return (
    <div className="fixed inset-0 z-[200]">
      {rect ? (
        <div
          className="absolute rounded-xl pointer-events-none transition-all duration-300 ease-out"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(4,5,8,0.78)",
            border: "1px solid rgba(79,126,248,0.55)",
          }}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: "rgba(4,5,8,0.78)", backdropFilter: "blur(2px)" }}
        />
      )}

      <div
        ref={tooltipRef}
        className="absolute w-[calc(100vw-32px)] max-w-md rounded-2xl p-7 animate-scale-in"
        style={{
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          visibility: pos ? "visible" : "hidden",
          background: "rgba(15,17,23,0.97)",
          border: "1px solid rgba(79,126,248,0.2)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Step {stepIndex + 1} of {steps.length}
          </span>
          <button
            onClick={skip}
            className="text-sm text-muted hover:text-ink transition-colors"
            aria-label="Close tour"
          >
            &#10005;
          </button>
        </div>

        <h3 className="text-lg font-semibold text-ink mb-2">{step.title}</h3>
        <p className="text-sm text-subtle leading-relaxed mb-5">{step.body}</p>

        <div className="mb-5 flex gap-1">
          {steps.map((_, i) => (
            <span
              key={i}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{ background: i <= stepIndex ? "#4f7ef8" : "rgba(255,255,255,0.08)" }}
            />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={skip}
            className="text-sm text-muted hover:text-subtle transition-colors"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <button
                onClick={prev}
                className="rounded-lg px-4 py-2 text-sm font-medium text-subtle hover:text-ink transition-colors"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                Back
              </button>
            )}
            <button
              onClick={isLast ? skip : next}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors"
              style={{ background: "#4f7ef8" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#3b6ef0")}
              onMouseLeave={e => (e.currentTarget.style.background = "#4f7ef8")}
            >
              {isLast ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
