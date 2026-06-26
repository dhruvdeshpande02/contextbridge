import { cn } from "@/lib/utils";
import { forwardRef, InputHTMLAttributes } from "react";

const base = "w-full rounded-xl border border-border bg-surface text-ink placeholder:text-muted/50 text-sm px-3.5 py-2.5 transition-all focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10 focus:bg-elevated";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(base, className)} {...props} />
  )
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(base, "resize-none leading-relaxed", className)} {...props} />
  )
);
Textarea.displayName = "Textarea";
