export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "#4f7ef8" : pct >= 50 ? "#6b96fa" : "#8891a4";
  return (
    <div className="flex items-center gap-3">
      <div className="h-1 flex-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-8 text-right text-xs tabular-nums" style={{ color }}>{pct}%</span>
    </div>
  );
}
