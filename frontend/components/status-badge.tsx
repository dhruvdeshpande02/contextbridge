import { cn } from "@/lib/utils";
import type { MeetingStatus } from "@/lib/api";

const cfg: Record<MeetingStatus, { label: string; dot: string; text: string; border: string; bg: string }> = {
  pending:    { label: "Pending",    dot: "bg-[#3a4155]",  text: "text-[#5a6070]",  border: "rgba(255,255,255,0.06)", bg: "transparent" },
  processing: { label: "Processing", dot: "bg-[#4f7ef8]",  text: "text-[#6b96fa]",  border: "rgba(79,126,248,0.2)",   bg: "rgba(79,126,248,0.06)" },
  completed:  { label: "Done",       dot: "bg-[#34d399]",  text: "text-[#34d399]",  border: "rgba(52,211,153,0.2)",   bg: "rgba(52,211,153,0.06)" },
  failed:     { label: "Failed",     dot: "bg-[#f87171]",  text: "text-[#f87171]",  border: "rgba(248,113,113,0.2)",  bg: "rgba(248,113,113,0.06)" },
};

export function StatusBadge({ status }: { status: MeetingStatus }) {
  const c = cfg[status];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border", c.text)}
      style={{ borderColor: c.border, background: c.bg }}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", c.dot, status === "processing" && "animate-pulse")} />
      {c.label}
    </span>
  );
}
