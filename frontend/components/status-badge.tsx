import { cn } from "@/lib/utils";
import type { MeetingStatus } from "@/lib/api";

const config: Record<MeetingStatus, { label: string; dot: string; text: string }> = {
  pending:    { label: "Pending",    dot: "bg-slate-400",  text: "text-slate-400"  },
  processing: { label: "Processing", dot: "bg-amber-400",  text: "text-amber-400"  },
  completed:  { label: "Completed",  dot: "bg-emerald-400",text: "text-emerald-400" },
  failed:     { label: "Failed",     dot: "bg-rose-400",   text: "text-rose-400"   },
};

export function StatusBadge({ status }: { status: MeetingStatus }) {
  const c = config[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium", c.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot, status === "processing" && "animate-pulse")} />
      {c.label}
    </span>
  );
}
