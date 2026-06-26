"use client";

/**
 * ContextBridge Logo — a circle connecting three concepts:
 * Notes (top) · Brain/AI (bottom-right) · People (bottom-left)
 */
export function BridgeLogo({ className = "" }: { className?: string }) {
  // Ring: center (20,20) radius 13. Nodes at 120° apart.
  // Top (notes): -90° → (20, 7)
  // Bottom-right (brain): 30° → (31.3, 26.5)
  // Bottom-left (people): 150° → (8.7, 26.5)
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>

      {/* Connecting arcs between nodes (ring with gaps at each node) */}
      {/* Arc: notes → brain */}
      <path d="M 24 7.6 A 13 13 0 0 1 32.7 22.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
      {/* Arc: brain → people */}
      <path d="M 28.7 29.7 A 13 13 0 0 1 11.3 29.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
      {/* Arc: people → notes */}
      <path d="M 7.3 22.7 A 13 13 0 0 1 16 7.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />

      {/* ── Node 1: Notes / Meeting Transcript (top) ── */}
      <circle cx="20" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
      <line x1="17.5" y1="5.5" x2="22.5" y2="5.5" stroke="currentColor" strokeWidth="1"   strokeLinecap="round" />
      <line x1="17.5" y1="7"   x2="22.5" y2="7"   stroke="currentColor" strokeWidth="1"   strokeLinecap="round" />
      <line x1="17.5" y1="8.5" x2="21"   y2="8.5"  stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" opacity="0.7" />

      {/* ── Node 2: Brain / AI (bottom-right) ── */}
      <circle cx="31.3" cy="26.5" r="5" stroke="currentColor" strokeWidth="1.4" />
      {/* left lobe */}
      <ellipse cx="30" cy="26.5" rx="1.4" ry="1.9" stroke="currentColor" strokeWidth="1.1" fill="none" />
      {/* right lobe */}
      <ellipse cx="32.6" cy="26.5" rx="1.4" ry="1.9" stroke="currentColor" strokeWidth="1.1" fill="none" />
      {/* center dividing line */}
      <line x1="31.3" y1="24.6" x2="31.3" y2="28.4" stroke="currentColor" strokeWidth="0.7" opacity="0.6" />

      {/* ── Node 3: People (bottom-left) ── */}
      <circle cx="8.7" cy="26.5" r="5" stroke="currentColor" strokeWidth="1.4" />
      {/* person: head + shoulders */}
      <circle cx="8.7" cy="24.5" r="1.4" stroke="currentColor" strokeWidth="1" />
      <path d="M 6 29 Q 6 27 8.7 27 Q 11.4 27 11.4 29"
        stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none" />

    </svg>
  );
}

/** Alias used in sidebar & login */
export function SmallBrainIcon({ className = "" }: { className?: string }) {
  return <BridgeLogo className={className} />;
}

/** Animated processing state */
export function ProcessingBrain({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="80" cy="80" r="60" stroke="rgba(79,126,248,0.08)" strokeWidth="1" strokeDasharray="4 4" className="animate-spin-slow" />
      <path d="M80 120 C64 120 48 112 40 100 C30 87 30 72 36 58 C40 48 48 40 56 36 C62 32 70 30 76 30 C78 30 79 30 80 31"
        stroke="#4f7ef8" strokeWidth="2" strokeLinecap="round" fill="rgba(79,126,248,0.04)" />
      <path d="M80 120 C96 120 112 112 120 100 C130 87 130 72 124 58 C120 48 112 40 104 36 C98 32 90 30 84 30 C82 30 81 30 80 31"
        stroke="#6b96fa" strokeWidth="2" strokeLinecap="round" fill="rgba(107,150,250,0.04)" />
      {[{cx:56,cy:68,d:"0s"},{cx:50,cy:88,d:"0.3s"},{cx:57,cy:106,d:"0.6s"},{cx:104,cy:68,d:"0.15s"},{cx:110,cy:88,d:"0.45s"},{cx:103,cy:106,d:"0.75s"}]
        .map(({cx,cy,d},i)=>(
          <circle key={i} cx={cx} cy={cy} r="4" fill="#4f7ef8" opacity="0.8"
            className="animate-pulse-glow" style={{animationDelay:d}} />
      ))}
      <line x1="56" y1="68" x2="50" y2="88"  stroke="rgba(79,126,248,0.4)" strokeWidth="1.2" />
      <line x1="50" y1="88" x2="57" y2="106" stroke="rgba(79,126,248,0.3)" strokeWidth="1" />
      <line x1="104" y1="68" x2="110" y2="88"  stroke="rgba(107,150,250,0.4)" strokeWidth="1.2" />
      <line x1="110" y1="88" x2="103" y2="106" stroke="rgba(107,150,250,0.3)" strokeWidth="1" />
      <path d="M56 68 C68 60 92 60 104 68" stroke="rgba(79,126,248,0.4)" strokeWidth="1.2"
        strokeDasharray="3 3" fill="none" className="animate-pulse-glow" />
    </svg>
  );
}

export function BrainIllustration({ className = "" }: { className?: string }) {
  return <ProcessingBrain className={className} />;
}
