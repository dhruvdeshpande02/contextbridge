"use client";
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { WALKTHROUGH_STEPS, WalkthroughStep } from "@/lib/walkthrough-steps";

const STORAGE_KEY = "cb_tour_done";

export function hasTourCompleted(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) === "1";
}

interface WalkthroughContextValue {
  active: boolean;
  stepIndex: number;
  steps: WalkthroughStep[];
  start: () => void;
  next: () => void;
  prev: () => void;
  skip: () => void;
}

const WalkthroughContext = createContext<WalkthroughContextValue | null>(null);

export function WalkthroughProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Navigation is a side effect of the active step, not something triggered
  // imperatively from click handlers — keeps router updates out of the
  // render/commit cycle of state changes made by next/prev/start. Only push
  // when the path actually changes: pushing the current URL still resets
  // scroll position, which fights the overlay's own scrollIntoView.
  useEffect(() => {
    if (!active) return;
    const target = WALKTHROUGH_STEPS[stepIndex].path;
    if (target !== pathname) router.push(target);
  }, [active, stepIndex, pathname, router]);

  const finish = useCallback(() => {
    setActive(false);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, "1");
  }, []);

  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
  }, []);

  const next = useCallback(() => {
    setStepIndex(i => Math.min(i + 1, WALKTHROUGH_STEPS.length - 1));
  }, []);

  const prev = useCallback(() => {
    setStepIndex(i => Math.max(i - 1, 0));
  }, []);

  const skip = useCallback(() => finish(), [finish]);

  return (
    <WalkthroughContext.Provider
      value={{ active, stepIndex, steps: WALKTHROUGH_STEPS, start, next, prev, skip }}
    >
      {children}
    </WalkthroughContext.Provider>
  );
}

export function useWalkthrough() {
  const ctx = useContext(WalkthroughContext);
  if (!ctx) throw new Error("useWalkthrough must be used within a WalkthroughProvider");
  return ctx;
}
